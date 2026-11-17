// 识图辅助逻辑测试（假 ctx/session，不连数据库、不发请求）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-vision.ts
//
// 要保证的事：能从本次消息和引用消息里抽图片、正文里的 img 标签会被去掉、
// 图片能转成 data URL、识图提示词带上原消息正文。
import {
  buildVisionPrompt, collectImages, currentImages, downloadImageAsDataUrl, guessImageMime, hasTextContent, stripImageTags,
} from '../src/vision'
import { consumeVisionUsage } from '../src/database'
import {
  IMAGE_CACHE_TTL_MS, clearImageCache, forgetImageMessage, rememberImageMessage, takeRecentImageMessage,
} from '../src/image-cache'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

async function main() {
  // ---------- 场景 1：抽取本次消息 + 引用消息里的图片 ----------
  {
    const session = {
      content: '<img src="https://example.com/1.jpg"/><img src="base64://QUJD"/><at id="1" name="灵梦"/>',
      elements: [
        { type: 'text', attrs: {} },
        { type: 'img', attrs: { src: 'https://example.com/1.jpg' } },
        { type: 'img', attrs: { src: 'base64://QUJD' } },
        { type: 'at', attrs: { id: '1', name: '灵梦' } },
      ],
      quote: { elements: [{ type: 'img', attrs: { src: 'https://example.com/quoted.png' } }] },
    } as any

    const images = collectImages(session)
    assert(images.length === 3, `本次和引用消息共 3 张图（实际 ${images.length}）`)
    assert(images[0].source === 'current' && images[1].source === 'current', '当前消息的图片标记为 current')
    assert(images[2].source === 'quoted', '引用消息的图片标记为 quoted')
    assert(images[2].src.includes('quoted.png'), '引用图片按顺序排在最后')

    assert(currentImages(session).length === 2, 'currentImages 只返回当前消息的图片')
    assert(hasTextContent(session) === false, '纯图片消息没有正文')
    assert(hasTextContent({ content: '看看这个<img src="x"/>', elements: [] } as any) === true, '带文字的消息有正文')
  }

  // ---------- 场景 2：正文去掉图片标签 ----------
  {
    assert(
      stripImageTags('看看这个<img src="https://example.com/a.jpg"/>可爱吗') === '看看这个可爱吗',
      '去掉 img 标签，保留正文',
    )
    assert(stripImageTags('<img src="x"/>') === '', '只有图片时正文为空')
  }

  // ---------- 场景 3：图片转 data URL ----------
  {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert(guessImageMime(png) === 'image/png', 'PNG 文件头识别正确')
    assert(guessImageMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0])) === 'image/jpeg', 'JPEG 文件头识别正确')
    assert(guessImageMime(Buffer.from('GIF89a', 'ascii')) === 'image/gif', 'GIF 文件头识别正确')

    const ctx = { http: { get: async () => png } } as any
    const url = await downloadImageAsDataUrl(ctx, 'https://example.com/a.png')
    assert(url?.startsWith('data:image/png;base64,'), '下载后按 magic number 生成 data URL')

    const inline = await downloadImageAsDataUrl(ctx, `base64://${png.toString('base64')}`)
    assert(inline?.startsWith('data:image/png;base64,'), 'base64:// 直接解码，不再下载')
  }

  // ---------- 场景 4：识图提示词带上正文和引用说明 ----------
  {
    const prompt = buildVisionPrompt('这张图是什么<img src="https://example.com/a.jpg"/>？', 2, 1)
    assert(prompt.includes('这张图是什么？'), '提示词带上原消息正文（已去掉 img 标签）')
    assert(prompt.includes('2 张'), '提示词写明图片数量')
    assert(prompt.includes('1 张来自用户引用的消息'), '提示词说明引用来源')
    assert(prompt.includes('重点描述与消息正文相关的内容'), '提示词要求聚焦问题相关内容')
    assert(prompt.includes('只做中性描述'), '提示词带内容安全软约束')

    const withPrevious = buildVisionPrompt('这是什么？', 2, 0, 1)
    assert(withPrevious.includes('1 张来自用户上一条消息'), '提示词说明上一条消息来源')
  }

  // ---------- 场景 6：上一条纯图片消息的缓存 ----------
  {
    clearImageCache()
    const session = { channelId: 'c1', userId: 'u1' } as any
    const images = [{ src: 'https://example.com/1.jpg', source: 'current' as const }]

    rememberImageMessage(session, images, 1000)
    const taken = takeRecentImageMessage(session, 1000 + IMAGE_CACHE_TTL_MS)
    assert(taken.length === 1 && taken[0].source === 'previous', '一分钟内的上一条纯图片可以被取用')
    assert(takeRecentImageMessage(session, 2000).length === 0, '取出后即失效')

    rememberImageMessage(session, images, 1000)
    assert(takeRecentImageMessage(session, 1000 + IMAGE_CACHE_TTL_MS + 1).length === 0, '超过一分钟后不再使用')

    rememberImageMessage(session, images, 1000)
    forgetImageMessage(session)
    assert(takeRecentImageMessage(session, 1500).length === 0, '发了别的消息后失效')

    rememberImageMessage({ channelId: 'c1', userId: 'u2' } as any, images, 1000)
    assert(takeRecentImageMessage(session, 1500).length === 0, '别的用户的图片不会串到当前用户')
    clearImageCache()
  }

  // ---------- 场景 5：识图次数按等级限额、按天重置 ----------
  {
    const now = new Date()
    const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
    const writes: any[] = []
    const ctx = {
      database: { set: async (_table: string, _query: any, data: any) => { writes.push(data) } },
    } as any
    const user: any = { userid: 'u1', userlevel: 0, visionUsage: 29, visionLastTime: key }

    assert(await consumeVisionUsage(ctx, user, 30) === true, '未到上限时允许识图')
    assert(user.visionUsage === 30 && writes.length === 1, '消耗一次并把次数写回数据库')

    assert(await consumeVisionUsage(ctx, user, 30) === false, '达到上限后不再识图')
    assert(user.visionUsage === 30 && writes.length === 1, '被拦住时不增加次数')

    user.visionLastTime = key - 1
    assert(await consumeVisionUsage(ctx, user, 30) === true, '跨天后重置计数')
    assert(user.visionUsage === 1, '跨天后从 1 开始计')

    user.visionLastTime = key
    user.visionUsage = 100
    assert(await consumeVisionUsage(ctx, user, 0) === true, '限制为 0 时视为不限制')
    assert(user.visionUsage === 101, '不限制时仍然计数')
  }

  console.log('\n全部通过')
}

main()

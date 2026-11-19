// 识图辅助逻辑测试（假 ctx/session，不连数据库、不发请求）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-vision.ts
//
// 要保证的事：能从本次消息和引用消息里抽图片、正文里的 img 标签会被去掉、
// 图片能转成 data URL、识图提示词带上原消息正文。
import {
  buildVisionPrompt, collectImages, currentImages, dedupeFeatureLines, downloadImageAsDataUrl, guessImageMime, hasTextContent, stripImageTags,
} from '../src/vision'
import { consumeVisionUsage } from '../src/database'
import {
  IMAGE_CACHE_TTL_MS, clearImageCache, forgetImageMessage, rememberImageMessage, takeRecentImageMessage,
} from '../src/image-cache'
import { buildQuoteNote, stripReplyMarker } from '../src/utils'

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
      // Satori 的 quote 通常只有 content 字符串，没有 elements
      quote: { content: '<img src="https://example.com/quoted.png"/>' },
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

  // ---------- 场景 2.5：复读的特征行去重 ----------
  {
    // 线上真实故障：四格漫画里同一角色反复出现，模型输出了 84 行特征，实际只有 5 种
    const lines = ['图1：四格漫画，多名角色在温泉中。']
    for (let i = 0; i < 40; i++) {
      lines.push('特征1：金发，长发，红瞳，裸体，无头饰，无标志物。')
      lines.push('特征2：金发，长发，蓝瞳，裸体，无头饰，无标志物。')
    }
    lines.push('特征3：黑发，短发，红瞳，穿红白相间服装，戴红蝴蝶结，无标志物。')
    const deduped = dedupeFeatureLines(lines.join('\n'))
    assert(deduped.split('\n').length === 4, `重复特征行只保留一次（实际 ${deduped.split('\n').length} 行）`)
    assert(deduped.includes('图1：四格漫画') && deduped.includes('特征3：'), '去重后保留概述行和不同特征')
    assert(dedupeFeatureLines('没有特征行') === '没有特征行', '没有特征行时原样返回')
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

    // Satori 的 /v1/assets 需要 Bearer token，必须用适配器自带的 http 客户端
    let usedBotHttp = false
    const botHttp = {
      get: async () => {
        usedBotHttp = true
        return png
      },
    }
    const viaBot = await downloadImageAsDataUrl(ctx, 'http://127.0.0.1:5504/v1/assets/x', botHttp)
    assert(usedBotHttp && viaBot?.startsWith('data:image/png;base64,'), '传入 http 客户端时优先用它下载')

    // Chronocat 的资源接口在媒体未就绪时返回 500，重试应能拿到
    let attempts = 0
    const flaky = {
      get: async () => {
        attempts += 1
        if (attempts < 3) throw new Error('Internal Server Error')
        return png
      },
    }
    const retried = await downloadImageAsDataUrl(ctx, 'http://127.0.0.1:5504/v1/assets/x', flaky, 0)
    assert(attempts === 3 && retried?.startsWith('data:image/png;base64,'), '前两次 500 后重试成功')
  }

  // ---------- 场景 4：识图提示词带上正文和引用说明 ----------
  {
    const prompt = buildVisionPrompt('这张图是什么<img src="https://example.com/a.jpg"/>？', 2, 1)
    assert(prompt.includes('这张图是什么？'), '提示词带上原消息正文（已去掉 img 标签）')
    assert(prompt.includes('2 张'), '提示词写明图片数量')
    assert(prompt.includes('1 张来自用户引用的消息'), '提示词说明引用来源')
    assert(prompt.includes('重点描述与消息正文相关的内容'), '提示词要求聚焦问题相关内容')
    assert(prompt.includes('显眼道具必须写进'), '提示词要求把标志物写进特征行')
    assert(prompt.includes('特征1：') && prompt.includes('每个角色单独一行'), '提示词要求多角色分别写特征行')
    assert(prompt.includes('不能只写主角') && prompt.includes('绝不合并到同一行'), '提示词要求写全每个角色且不合并特征行')
    assert(prompt.includes('特征行必须写全') && prompt.includes('不受这个字数限制'), '多人图的特征行不受单图字数限制')
    assert(prompt.includes('不写睁眼/闭眼'), '特征行不写睁眼闭眼等瞬时状态')
    assert(prompt.includes('只做中性描述'), '提示词带内容安全软约束')
    assert(prompt.includes('【内容违规】'), '整图违规时要求输出拦截标记')

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

  // ---------- 场景 7：引用消息说明 ----------
  {
    const imageQuote = {
      quote: { content: '<author id="1" name="灵梦" avatar="x"/><img src="https://example.com/a.jpg"/>' },
    } as any
    assert(buildQuoteNote(imageQuote) === '（引用消息：灵梦：[图片]）', '引用图片注明发送者')

    const textQuote = { quote: { content: '<author id="1" name="灵梦"/>你好呀' } } as any
    assert(buildQuoteNote(textQuote) === '（引用消息：灵梦：你好呀）', '引用文字注明发送者')

    assert(buildQuoteNote({} as any) === '', '没有引用时返回空串')
    assert(stripReplyMarker('看看 。回复：') === '看看', '去掉「。回复：」标记')
    assert(stripReplyMarker('看看回复:') === '看看', 'ASCII 冒号同样处理')
    assert(stripReplyMarker('普通消息') === '普通消息', '没有标记时原样返回')
  }

  console.log('\n全部通过')
}

main()

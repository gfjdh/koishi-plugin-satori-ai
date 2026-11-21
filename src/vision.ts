// src/vision.ts
// 识图：抽取消息里的图片，转成模型能接收的格式。
//
// 只处理「本次消息 + 被引用消息」里的 img 元素；纯图片消息不触发对话，
// 所以这里不需要自己判断是否该回复。
import { Context, Logger, Session, h } from 'koishi'

const logger = new Logger('satori-vision')

/** 单张图片的大小上限；超过就跳过，避免把内存和请求体撑爆 */
export const VISION_MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** 一次最多处理多少张图（当前消息 + 引用消息合计） */
export const VISION_MAX_IMAGES = 6
/**
 * Chronocat 的 /v1/assets 在媒体下载超过 1 秒时会返回 500，而第一次请求通常
 * 已经把媒体拉到了本地。重试几次就能命中缓存。
 */
export const IMAGE_DOWNLOAD_ATTEMPTS = 10
export const IMAGE_DOWNLOAD_RETRY_DELAY_MS = 3000

export interface CollectedImage {
  src: string
  /** 来源：当前消息 / 被引用的消息 / 用户上一条纯图片消息 */
  source: 'current' | 'quoted' | 'previous'
}

/** 去掉图片、文件、@ 和裸链接后还有没有正文 */
export function hasTextContent(session: Session): boolean {
  return (session.content || '')
    .replace(/<img\b[^>]*\/?>/gi, '')
    .replace(/<file\b[^>]*\/?>/gi, '')
    .replace(/<at\b[^>]*\/?>/gi, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/file:\/\/\S+/gi, '')
    .trim().length > 0
}

/** 本次消息自身的图片（不含引用消息） */
export function currentImages(session: Session): CollectedImage[] {
  const result: CollectedImage[] = []
  for (const element of (session.elements as any[]) || []) {
    if (element?.type !== 'img') continue
    const src = String(element.attrs?.src || '').trim()
    if (src) result.push({ src, source: 'current' })
  }
  return result
}

/**
 * 引用消息的元素。Satori 的 Resource.decode 只把被引用消息塞进
 * `quote.content` 字符串，`quote.elements` 通常是空的，需要自己解析。
 */
function quoteElements(session: Session): any[] {
  const quote = session.quote as any
  if (!quote) return []
  if (Array.isArray(quote.elements) && quote.elements.length) return quote.elements
  const content = typeof quote.content === 'string' ? quote.content : ''
  if (!content) return []
  try {
    return h.parse(content) as any[]
  } catch {
    return []
  }
}

/** 收集本次消息和被引用消息里的图片，保持出现顺序 */
export function collectImages(session: Session): CollectedImage[] {
  const result = currentImages(session)
  for (const element of quoteElements(session)) {
    if (element?.type !== 'img') continue
    const src = String(element.attrs?.src || '').trim()
    if (src) result.push({ src, source: 'quoted' })
  }
  return result.slice(0, VISION_MAX_IMAGES)
}

/** 去掉正文里的图片标签；图片本身交给识图或多模态，不留在文本里 */
export function stripImageTags(text: string): string {
  return (text || '')
    .replace(/<img\b[^>]*\/?>/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

/**
 * 这张图值不值得下载。
 * 引用消息里只有解析出来的 img 标签，媒体本身取不到（Chronocat 的引用记录
 * 指向本地不存在的文件），重试十次也只是白等三十秒，直接按失败处理。
 */
export function isDownloadable(image: CollectedImage): boolean {
  return image.source !== 'quoted'
}

/** 从文件头猜 MIME；猜不出按 jpeg 处理，多数平台会自行识别 */
export function guessImageMime(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png'
  if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (buffer.length >= 2 && buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp'
  return 'image/jpeg'
}

function toDataUrl(buffer: Buffer): string | null {
  if (!buffer.length) {
    logger.warn('图片内容为空，已跳过')
    return null
  }
  if (buffer.length > VISION_MAX_IMAGE_BYTES) {
    logger.warn(`图片超过大小上限（${buffer.length} 字节），已跳过`)
    return null
  }
  return `data:${guessImageMime(buffer)};base64,${buffer.toString('base64')}`
}

/**
 * 把图片转成 data URL。
 * QQ 图片链接常带时效或平台鉴权，外部模型自己去抓经常失败，所以先下载再编码。
 * Satori 的 /v1/assets 接口需要 Bearer token，调用方应优先传 bot.http。
 */
export async function downloadImageAsDataUrl(
  ctx: Context,
  src: string,
  http: { get: (url: string, config?: any) => Promise<any> } = ctx.http,
  retryDelayMs = IMAGE_DOWNLOAD_RETRY_DELAY_MS,
): Promise<string | null> {
  if (!src) return null
  if (src.startsWith('data:')) return src
  if (src.startsWith('base64://')) {
    return toDataUrl(Buffer.from(src.slice('base64://'.length), 'base64'))
  }
  let lastError: unknown
  for (let attempt = 1; attempt <= IMAGE_DOWNLOAD_ATTEMPTS; attempt++) {
    try {
      const data = await http.get(src, { responseType: 'arraybuffer', timeout: 15000 })
      return toDataUrl(Buffer.from(data))
    } catch (error) {
      lastError = error
      if (attempt < IMAGE_DOWNLOAD_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, retryDelayMs))
      }
    }
  }
  logger.warn(`图片下载失败（已重试 ${IMAGE_DOWNLOAD_ATTEMPTS} 次）：`
    + `${(lastError as any)?.message || lastError} ${src}`)
  return null
}

/** 识图模型判定整张图违规时输出的标记，由系统拦截并丢弃整段描述 */
export const VISION_BLOCK_MARKER = '【内容违规】'

/**
 * 图片没取全时给主模型的提示。
 *
 * 关键：只有一张图都没拿到时才能说「你看不到这张图」。部分图片失败时，
 * 已经识别出来的 [图片内容] 仍然有效；这时再说「看不到图」会让模型丢掉
 * 描述、转而从记忆里编名字（线上案例：黄仁勋的照片被答成群友「清水尚辉」，
 * 因为同一轮里上一张纯图片下载失败，触发了整段「图片无法识别」提示）。
 */
export function buildImageFailureNote(input: {
  total: number
  used: number
  quotedTotal: number
  quotedUsed: number
  censored?: boolean
}): string {
  const { total, used, quotedTotal, quotedUsed, censored } = input
  if (total <= 0 || used >= total) return ''
  if (censored) {
    return '[图片内容违规：图中内容违反了内容规定，不要描述或猜测图中内容，直接告诉用户图片内容违规、无法讨论]'
  }
  if (used === 0) {
    return quotedUsed < quotedTotal
      ? '[引用的图片无法识别：你看不到这张图，不要描述或猜测图中内容，直接告诉用户图片没加载出来]'
      : '[图片无法识别：你看不到这张图，不要描述或猜测图中内容]'
  }
  return `[另有 ${total - used} 张图片没有加载出来，不要描述或猜测这些图片的内容]`
}

/** 识图提示词：带上本消息正文，并要求重点描述与问题相关的部分 */
export function buildVisionPrompt(
  text: string,
  imageCount: number,
  quotedCount: number,
  previousCount = 0,
): string {
  const question = stripImageTags(text)
  const sources = [
    quotedCount ? `${quotedCount} 张来自用户引用的消息` : '',
    previousCount ? `${previousCount} 张来自用户上一条消息` : '',
  ].filter(Boolean).join('，')
  const sourceLine = sources ? `其中${sources}。` : ''
  return `请描述下面${imageCount > 1 ? ` ${imageCount} 张` : ''}图片的内容，供后续对话使用。
${question ? `用户这条消息的正文是：「${question}」` : '用户这条消息没有正文。'}
${sourceLine}

要求：
· 重点描述与消息正文相关的内容；正文没提到的地方简单带过。
· 图中有少量文字时原样转写，有大量文字时简要概括。
· 只描述看得见的内容，不要推测或编造。
· 如果图中有角色，描述外观、动作、表情；每张图的描述末尾另起一行写身份行：
  - 认识图中的角色就写「角色：角色名」；有多个角色时按从左到右编号，每个角色单独一行「角色1：」「角色2：」；
  - 同一角色在多个画面、格子或位置重复出现时只写一次；角色超过 8 个时只写最显眼的 8 个；
  - 不确定、不认识、或只是觉得像某个角色时，写「角色：不确定」，不要猜；
  - 图中没有角色（真人、物体、风景等）时写「角色：无」；
  - 身份行只写角色名，不要写外貌、动作或推测理由。
· 遇到暴力、色情、违法内容只做中性描述，不展开细节；如果整张图都是色情、血腥、暴力或违法内容，不要描述，只输出${VISION_BLOCK_MARKER}。
· 按顺序用「图1：」「图2：」分段；每张图的正文描述控制在 150 字以内。`
}

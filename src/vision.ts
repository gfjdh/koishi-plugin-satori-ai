// src/vision.ts
// 识图：抽取消息里的图片，转成模型能接收的格式。
//
// 只处理「本次消息 + 被引用消息」里的 img 元素；纯图片消息不触发对话，
// 所以这里不需要自己判断是否该回复。
import { Context, Session } from 'koishi'

/** 单张图片的大小上限；超过就跳过，避免把内存和请求体撑爆 */
export const VISION_MAX_IMAGE_BYTES = 10 * 1024 * 1024
/** 一次最多处理多少张图（当前消息 + 引用消息合计） */
export const VISION_MAX_IMAGES = 6

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

/** 收集本次消息和被引用消息里的图片，保持出现顺序 */
export function collectImages(session: Session): CollectedImage[] {
  const result = currentImages(session)
  for (const element of ((session.quote as any)?.elements as any[]) || []) {
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
  if (!buffer.length || buffer.length > VISION_MAX_IMAGE_BYTES) return null
  return `data:${guessImageMime(buffer)};base64,${buffer.toString('base64')}`
}

/**
 * 把图片转成 data URL。
 * QQ 图片链接常带时效或平台鉴权，外部模型自己去抓经常失败，所以先下载再编码。
 */
export async function downloadImageAsDataUrl(ctx: Context, src: string): Promise<string | null> {
  if (!src) return null
  if (src.startsWith('data:')) return src
  if (src.startsWith('base64://')) {
    return toDataUrl(Buffer.from(src.slice('base64://'.length), 'base64'))
  }
  try {
    const data = await ctx.http.get(src, { responseType: 'arraybuffer', timeout: 15000 })
    return toDataUrl(Buffer.from(data))
  } catch {
    return null
  }
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
· 图中有文字时原样转写。
· 只描述看得见的内容，不要推测或编造。
· 如果图中有角色，只需要描述外观、动作、表情等，不需要给出角色的身份等信息。
· 遇到暴力、色情、违法内容只做中性描述，不展开细节。
· 按顺序用「图1：」「图2：」分段，每张图不超过 150 字。`
}

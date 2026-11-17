// src/image-cache.ts
// 记住每个用户在各频道的上一条消息：如果它是一张纯图片，紧随其后的文字消息
// 在识图时要把这张图一起带上。
//
// 纯图片消息本身不触发对话，也不会写入频道记忆，所以只能在这里单独缓存。
import { Session } from 'koishi'
import { CollectedImage } from './vision'

/** 上一条纯图片消息的有效期：超过就不算「紧接着的」 */
export const IMAGE_CACHE_TTL_MS = 60_000
/** 缓存条目上限；纯图片消息没人跟进时不会自动删除，超过后清理过期项 */
const MAX_ENTRIES = 500

interface Entry {
  at: number
  images: CollectedImage[]
}

const cache = new Map<string, Entry>()

const keyOf = (session: { channelId?: string, userId?: string }) =>
  `${session.channelId || ''}:${session.userId || ''}`

/** 记录一条纯图片消息，供该用户在这个频道的下一条消息使用 */
export function rememberImageMessage(session: Session, images: CollectedImage[], now = Date.now()): void {
  if (!images.length) return
  if (cache.size >= MAX_ENTRIES) {
    for (const [key, entry] of cache) {
      if (now - entry.at > IMAGE_CACHE_TTL_MS) cache.delete(key)
    }
  }
  cache.set(keyOf(session), {
    at: now,
    images: images.map(image => ({ ...image, source: 'previous' as const })),
  })
}

/** 这个用户发了别的消息，上一条纯图片不再算「上一条」 */
export function forgetImageMessage(session: Session): void {
  cache.delete(keyOf(session))
}

/** 取出 60 秒内上一条纯图片消息的图片；取出后即失效 */
export function takeRecentImageMessage(session: Session, now = Date.now()): CollectedImage[] {
  const key = keyOf(session)
  const entry = cache.get(key)
  if (!entry) return []
  cache.delete(key)
  if (now - entry.at > IMAGE_CACHE_TTL_MS) return []
  return entry.images
}

/** 测试用：清空缓存 */
export function clearImageCache(): void {
  cache.clear()
}

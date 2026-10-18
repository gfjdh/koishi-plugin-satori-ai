// src/memory/delta.ts
// 画像增量合并。零运行时依赖，方便离线测试。

export interface DeltaEntry {
  key: string
  category?: string
  content?: string
  importance?: number
}

export interface ProfileDelta {
  added?: DeltaEntry[]
  modified?: DeltaEntry[]
  deleted?: string[]
}

export interface ProfileEntryLike {
  key: string
  category: string
  content: string
  importance: number
  updatedAt: string
}

export function clampImportance(value: number | undefined, fallback = 10): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(50, Math.round(value)))
}

/**
 * 应用一次增量。
 *
 * 与参考实现的两处差异：
 * 1. added 内部先按 key 去重，modified 会与同一次 delta 里的 added 合并，
 *    不会出现“同一次 delta 撞 key 产生两条”的情况；
 * 2. 结果始终按 (importance DESC, updatedAt DESC) 持久化排序，
 *    不再每次淘汰都原地打乱 entries 的顺序。
 */
export function applyProfileDelta<T extends ProfileEntryLike>(
  entries: T[],
  delta: ProfileDelta,
  now: string,
  maxEntries: number,
): T[] {
  const merged = new Map<string, T>()
  for (const entry of entries) {
    if (entry?.key) merged.set(entry.key, { ...entry })
  }

  const incoming = new Map<string, T>()

  for (const item of delta.added || []) {
    if (!item?.key || !item?.content) continue
    incoming.set(item.key, {
      key: item.key,
      category: item.category || 'fact',
      content: item.content,
      importance: clampImportance(item.importance),
      updatedAt: now,
    } as T)
  }

  for (const item of delta.modified || []) {
    if (!item?.key) continue
    const base = incoming.get(item.key) || merged.get(item.key)
    if (!base && !item.content) continue
    incoming.set(item.key, {
      key: item.key,
      category: item.category || base?.category || 'fact',
      content: item.content ?? base?.content ?? '',
      importance: clampImportance(item.importance, base?.importance ?? 10),
      updatedAt: now,
    } as T)
  }

  for (const key of delta.deleted || []) {
    if (!key) continue
    merged.delete(key)
    incoming.delete(key)
  }

  for (const [key, entry] of incoming) {
    if (entry.content) merged.set(key, entry)
  }

  const result = [...merged.values()]
  result.sort((a, b) =>
    b.importance - a.importance ||
    b.updatedAt.localeCompare(a.updatedAt) ||
    a.key.localeCompare(b.key),
  )

  return result.slice(0, Math.max(0, maxEntries))
}

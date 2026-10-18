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

/** 迁移生成的旧画像原文。只允许被拆解后删除，不接受改写，避免整段旧画像被覆盖。 */
export const PROTECTED_PROFILE_KEYS = new Set(['legacy_portrait'])

const EDIT_INSTRUCTION_RE = /^(?:请\s*)?(?:(?:移除|删除|删掉|去掉|修改|更正|更新|替换|改为)|将[^。]{0,20}(?:改为|删除|移除|去掉|替换))/
const EDIT_NOTE_RE = /(?:该项|该条|此项|此条)[^。]{0,20}(?:为准|删除|移除)|以\s*["“']?[A-Za-z][\w-]*["”']?\s*为准/

/**
 * 判断 content 是否是“编辑说明”而不是关于用户的事实。
 * 模型偶尔会把“移除某表述”“以某条为准”直接写进 content，
 * 这类内容必须丢弃，否则会覆盖掉真正的画像。
 */
export function looksLikeEditInstruction(content: string | undefined): boolean {
  const text = (content || '').trim()
  if (!text) return false
  return EDIT_INSTRUCTION_RE.test(text) || EDIT_NOTE_RE.test(text)
}

export interface SanitizeResult {
  delta: ProfileDelta
  /** 被丢弃的条目，形如 key(added) / key(modified:protected) */
  rejected: string[]
}

/**
 * 应用前清洗模型输出：
 * 1. deleted 既接受字符串，也接受 { key } / { title } 对象（模型常混用）；
 * 2. 丢弃“编辑说明”样式的 added / modified；
 * 3. 保护 legacy_portrait，只允许删除、不允许改写。
 */
export function sanitizeProfileDelta(delta: ProfileDelta): SanitizeResult {
  const rejected: string[] = []

  const filter = (items: DeltaEntry[] | undefined, kind: 'added' | 'modified') =>
    (items || []).filter((item) => {
      if (!item?.key) return true // 交给 apply 阶段按原规则忽略
      if (PROTECTED_PROFILE_KEYS.has(item.key)) {
        rejected.push(`${item.key}(${kind}:protected)`)
        return false
      }
      if (looksLikeEditInstruction(item.content)) {
        rejected.push(`${item.key}(${kind}:instruction)`)
        return false
      }
      return true
    })

  const deleted: string[] = []
  for (const item of (delta.deleted || []) as unknown[]) {
    const key = typeof item === 'string'
      ? item
      : (item as { key?: unknown; title?: unknown })?.key ?? (item as { title?: unknown })?.title
    if (typeof key === 'string' && key.trim()) deleted.push(key.trim())
  }

  return {
    delta: {
      added: filter(delta.added, 'added'),
      modified: filter(delta.modified, 'modified'),
      deleted,
    },
    rejected,
  }
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

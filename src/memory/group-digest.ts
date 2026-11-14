// src/memory/group-digest.ts
// 群聊「省流」：把用户上次发言以来的群记忆整理成模型输入。
//
// 选材顺序是「粗粒度优先」：年 → 季 → 月 → 周 → 日 → 话题。
// 每一级只取归档游标之后已闭合的节点，取完就把游标推到节点末尾，
// 所以粗粒度覆盖过的时段不会再被细粒度重复计入；只有最近的、还没被
// 更粗层级覆盖的部分才落到下一级。最早的那个节点可能起点早于用户上次
// 发言——这是允许的，粗粒度记忆本来就是整段整段的。
// 最后剩下还没归档的原始消息，直接给原文。
import { Granularity, SatDialogue, SatMemory } from './schema'
import { formatGroupRows, formatTime } from './summarizer'

/** 由粗到细；topic 是最后一级 */
export const DIGEST_LEVELS: Granularity[] = ['year', 'season', 'month', 'week', 'day', 'topic']

const LEVEL_LABELS: Record<string, string> = {
  year: '年度总结',
  season: '季度总结',
  month: '月度总结',
  week: '周总结',
  day: '日总结',
  topic: '话题',
}

export const DIGEST_MAX_CHARS = 200
/** 未归档原始消息最多取多少条，避免归档积压时输入失控 */
export const DIGEST_MAX_RAW_MESSAGES = 300

/** 「省流 -d/-m/-y」给出的范围；多个单位同时给出时依次往前推 */
export interface DigestRange {
  days?: number
  months?: number
  years?: number
}

/**
 * 「最近 N 天/月/年」的起点。
 * 天按滚动小时数（-d 5 = 往前 120 小时），月/年按日历（-m 1 是同一个日期上个月，
 * 目标月份没有这一天时取当月最后一天）。多个单位同时给出时累加。
 */
export function digestRangeStart(now: Date, timezoneOffset: number, range: DigestRange): Date {
  const offsetMs = timezoneOffset * 3_600_000
  const local = new Date(now.getTime() + offsetMs)

  const years = Math.max(0, Math.floor(range.years || 0))
  const months = Math.max(0, Math.floor(range.months || 0))
  const days = Math.max(0, Math.floor(range.days || 0))

  if (years) local.setUTCFullYear(local.getUTCFullYear() - years)
  if (months) {
    // 先落到 1 号再减月，避免 3/31 - 1 个月滚成 3/3
    const day = local.getUTCDate()
    local.setUTCDate(1)
    local.setUTCMonth(local.getUTCMonth() - months)
    const lastDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate()
    local.setUTCDate(Math.min(day, lastDay))
  }
  if (days) local.setUTCDate(local.getUTCDate() - days)

  return new Date(local.getTime() - offsetMs)
}

export function hasDigestRange(range?: DigestRange): boolean {
  if (!range) return false
  return (range.days || 0) > 0 || (range.months || 0) > 0 || (range.years || 0) > 0
}

/**
 * 按「粗粒度优先」挑出覆盖 (from, now] 的记忆节点。
 *
 * 每取完一级就把游标推到该级最后一个节点的末尾，下一级只补之后的空档。
 * 最早那个节点的 periodStart 可能早于 from——这是允许的，粗粒度记忆本来
 * 就是整段整段的（例如用户昨天中午发言，昨天的日节点仍然纳入）。
 *
 * fetchNodes 由调用方绑定到具体的数据源，便于离线测试。
 */
export async function selectDigestNodes(
  from: Date,
  now: Date,
  fetchNodes: (level: Granularity, after: Date, to: Date) => Promise<SatMemory[]>,
): Promise<{ nodes: SatMemory[], cursor: Date }> {
  let cursor = from
  const nodes: SatMemory[] = []
  for (const level of DIGEST_LEVELS) {
    const rows = await fetchNodes(level, cursor, now)
    if (!rows.length) continue
    nodes.push(...rows)
    cursor = new Date(rows[rows.length - 1].periodEnd)
  }
  return { nodes, cursor }
}

export interface DigestFormatOptions {
  /** 提问者 userId：原始消息里标出他的发言，避免张冠李戴 */
  requesterId?: string
}

export function formatDigestMaterials(
  nodes: SatMemory[],
  rows: SatDialogue[],
  timezoneOffset: number,
  options: DigestFormatOptions = {},
): string {
  const parts: string[] = []
  for (const node of nodes) {
    const range = `${formatTime(node.periodStart, timezoneOffset)} ~ ${formatTime(node.periodEnd, timezoneOffset)}`
    const label = LEVEL_LABELS[node.granularity] || node.granularity
    const topic = node.topic ? `【${node.topic}】` : ''
    const state = node.userState ? `（群状态：${node.userState}）` : ''
    parts.push(`【${label} ${range}】${topic}${node.content}${state}`)
  }
  if (rows.length) {
    // 材料是给模型看的：机器人（也就是模型自己）的发言用「你」，提问者的发言单独标出来
    parts.push(`【尚未归档的原始消息】\n${formatGroupRows(rows, timezoneOffset, {
      botLabel: '你',
      requesterId: options.requesterId,
    })}`)
  }
  return parts.join('\n\n')
}

/** 概要只需要一段话：去掉代码块、压平换行，并截到 200 字 */
export function clampDigest(text: string, max = DIGEST_MAX_CHARS): string {
  const cleaned = (text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
  return cleaned.length > max ? cleaned.slice(0, max).trim() : cleaned
}

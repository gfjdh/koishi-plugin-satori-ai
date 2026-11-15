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
import { GroupReportKind } from './report-specs'
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

/** 日报正文的硬上限；周/月/年报的上限在 report-specs.ts 里 */
export const DAILY_DIGEST_MAX_CHARS = 1600

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

/** 某个本地日期在指定小时的真正 UTC 时刻 */
function boundaryAt(
  year: number,
  monthIndex: number,
  day: number,
  timezoneOffset: number,
  hour: number,
): Date {
  return new Date(Date.UTC(year, monthIndex, day, hour) - timezoneOffset * 3_600_000)
}

export interface ReportPeriod {
  kind: GroupReportKind
  /** 日报为 null，由上次日报游标决定；其余为固定自然周期起点 */
  from: Date | null
  /** 报告覆盖的终点（自然周期是已闭合的零点，日报是当前时刻） */
  to: Date
}

/**
 * 按执行时刻判断该出哪种报告，并给出自然周期范围。
 *
 * 日期判定按本地零点：周一 00:00 之后就是周一，1 号 00:00 之后就是 1 号。
 * 记忆金字塔自己的日界线（默认 04:00）不参与报告类型判断；周期末尾的
 * 最后几个小时如果还没形成日节点，会自然退回话题/原始消息。
 * 优先级：年 > 月 > 周 > 日（1 月 1 日只出年报，1 号只出月报，周一才出周报）。
 */
export function resolveReportPeriod(now: Date, timezoneOffset: number): ReportPeriod {
  const local = new Date(now.getTime() + timezoneOffset * 3_600_000)
  const year = local.getUTCFullYear()
  const monthIndex = local.getUTCMonth()
  const date = local.getUTCDate()
  const weekday = local.getUTCDay()
  const to = boundaryAt(year, monthIndex, date, timezoneOffset, 0)

  if (monthIndex === 0 && date === 1) {
    return {
      kind: 'yearly',
      from: boundaryAt(year - 1, 0, 1, timezoneOffset, 0),
      to,
    }
  }
  if (date === 1) {
    return {
      kind: 'monthly',
      from: boundaryAt(year, monthIndex - 1, 1, timezoneOffset, 0),
      to,
    }
  }
  if (weekday === 1) {
    return {
      kind: 'weekly',
      from: new Date(to.getTime() - 7 * 86_400_000),
      to,
    }
  }
  return { kind: 'daily', from: null, to: now }
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
  levels: Granularity[] = DIGEST_LEVELS,
): Promise<{ nodes: SatMemory[], cursor: Date }> {
  let cursor = from
  const nodes: SatMemory[] = []
  for (const level of levels) {
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

export interface DailyDigestParsed {
  /** 去掉「今日/本期最喜欢」标记后的正文 */
  body: string
  /** 模型选中的群友昵称；没有选或没按格式输出时为空字符串 */
  favorite: string
}

/**
 * 拆出报告正文和末尾的「今日/本期最喜欢」标记。
 *
 * 标记是模型输出里的元数据，不能出现在卡片上。模型可能写成
 * 「【今日最喜欢】昵称」或「【本期最喜欢：昵称】」，前后还可能带省略号、
 * 句号；标记单独一行或跟在最后一段末尾都要能处理。
 */
export function parseDailyDigest(text: string): DailyDigestParsed {
  const source = (text || '').replace(/\r\n?/g, '\n')

  const inline = source.match(/【(?:今日|本期)最喜欢】\s*[：:]?\s*([^\n【】]+)/)
  if (inline) {
    const favorite = inline[1]
      .replace(/^[…\.。\s]+/, '')
      .replace(/[…\.。\s]+$/, '')
      .trim()
    return {
      body: removeDailyDigestMarker(source, inline.index!, inline[0].length),
      favorite,
    }
  }

  const bracketed = source.match(/【(?:今日|本期)最喜欢[：:]\s*([^】\n]+)】/)
  if (bracketed) {
    return {
      body: removeDailyDigestMarker(source, bracketed.index!, bracketed[0].length),
      favorite: bracketed[1].trim(),
    }
  }

  return { body: source.trim(), favorite: '' }
}

/** 去掉标记本身；标记独占一行时连整行一起删，跟在句尾时只删标记之后的内容 */
function removeDailyDigestMarker(source: string, index: number, length: number): string {
  const lineStart = source.lastIndexOf('\n', index) + 1
  const beforeMarker = source.slice(lineStart, index)
  const start = /^[\s…\.。]*$/.test(beforeMarker) ? lineStart : index
  let end = source.indexOf('\n', index + length)
  if (end < 0) end = source.length
  const before = source.slice(0, start).replace(/[…\.\s]+$/, '')
  const after = source.slice(end)
  return (before + after).trim()
}

/**
 * 群日报的正文清洗：保留段落换行（卡片是 pre-wrap），压缩多余空行，
 * 超出上限时尽量在句末截断，避免把一句话劈成两半。
 */
export function clampDailyDigest(text: string, max = DAILY_DIGEST_MAX_CHARS): string {
  const cleaned = (text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (cleaned.length <= max) return cleaned
  const slice = cleaned.slice(0, max)
  const cut = Math.max(
    slice.lastIndexOf('。'),
    slice.lastIndexOf('！'),
    slice.lastIndexOf('？'),
    slice.lastIndexOf('…'),
  )
  // 句末太靠前说明后面还有一大段没说完，宁可硬截也不要只剩半句
  return (cut > max - 150 ? slice.slice(0, cut + 1) : slice).trim()
}

/** 区间内发过言的群友，用于把模型选出的昵称映射回 userId */
export interface DigestParticipant {
  userId: string
  username: string
  count: number
}

/**
 * 把模型选出的昵称映射回群友。模型可能改写昵称（去括号、加句号、用简称），
 * 所以先精确匹配，再退到包含匹配；多个候选时取发言最多的那个。
 */
export function resolveDigestFavorite(
  choice: string,
  participants: DigestParticipant[],
): DigestParticipant | null {
  const target = (choice || '')
    .replace(/^[【\[（(「『"'“]+/, '')
    .replace(/[】\]）)」』"'”]+$/, '')
    .replace(/^今日最喜欢[：:]?/, '')
    .replace(/[。．.!！,，、\s]+$/, '')
    .trim()
  if (!target) return null
  const byCount = (pool: DigestParticipant[]) => [...pool].sort((a, b) => b.count - a.count)[0]

  const exact = participants.filter(item => item.username === target)
  if (exact.length) return byCount(exact)

  const fuzzy = participants.filter(item =>
    (target.length >= 2 && item.username.includes(target))
    || (item.username.length >= 2 && target.includes(item.username)))
  return fuzzy.length ? byCount(fuzzy) : null
}

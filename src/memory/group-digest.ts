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
import { GroupReportKind, resolveFavoriteTier } from './report-specs'
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
  /** 报告覆盖的起点：日报是前一天 00:00，周/月/年报是对应自然周期起点 */
  from: Date
  /** 报告覆盖的终点（自然周期是已闭合的零点，日报是当天 00:00） */
  to: Date
}

/**
 * 按执行时刻判断该出哪种报告，并给出自然周期范围。
 *
 * 日期判定按本地零点：周一 00:00 之后就是周一，1 号 00:00 之后就是 1 号。
 * 记忆金字塔自己的日界线（默认 04:00）不参与报告类型判断；周期末尾的
 * 最后几个小时如果还没形成日节点，会自然退回话题/原始消息。
 * 优先级：年 > 月 > 周 > 日（1 月 1 日只出年报，1 号只出月报，周一才出周报）。
 *
 * 日报固定取「前一天 00:00 ~ 当天 00:00」，不看上次报告时间；
 * 同一天重复执行会重新生成同一段内容，不依赖游标。
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
  return {
    kind: 'daily',
    from: boundaryAt(year, monthIndex, date - 1, timezoneOffset, 0),
    to,
  }
}

/**
 * 指定报告类型时的周期（预览与测试用）。
 * 与 resolveReportPeriod 不同，这里取「当前时刻所在」的自然月/年，
 * 方便用当前数据预览月报/年报；weekly 仍取最近一个已闭合的周一。
 */
export function resolvePeriodOfKind(
  kind: GroupReportKind,
  now: Date,
  timezoneOffset: number,
): ReportPeriod {
  const local = new Date(now.getTime() + timezoneOffset * 3_600_000)
  const year = local.getUTCFullYear()
  const monthIndex = local.getUTCMonth()
  const date = local.getUTCDate()
  const weekday = local.getUTCDay()
  if (kind === 'yearly') {
    return { kind, from: boundaryAt(year, 0, 1, timezoneOffset, 0), to: boundaryAt(year + 1, 0, 1, timezoneOffset, 0) }
  }
  if (kind === 'monthly') {
    return {
      kind,
      from: boundaryAt(year, monthIndex, 1, timezoneOffset, 0),
      to: boundaryAt(year, monthIndex + 1, 1, timezoneOffset, 0),
    }
  }
  if (kind === 'weekly') {
    const daysSinceMonday = (weekday + 6) % 7
    const to = new Date(boundaryAt(year, monthIndex, date, timezoneOffset, 0).getTime() - daysSinceMonday * 86_400_000)
    return { kind, from: new Date(to.getTime() - 7 * 86_400_000), to }
  }
  return {
    kind: 'daily',
    from: boundaryAt(year, monthIndex, date - 1, timezoneOffset, 0),
    to: boundaryAt(year, monthIndex, date, timezoneOffset, 0),
  }
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

/** 概要只需要一段话：去掉代码块、压平换行；篇幅由提示词约束，不在这里硬截断 */
export function cleanDigest(text: string): string {
  return (text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim()
}

/** 去掉代码块、统一换行、压缩多余空行；不做截断 */
export function normalizeBody(text: string): string {  return (text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 群日报的正文清洗：保留段落换行（卡片是 pre-wrap），压缩多余空行，
 * 超出上限时尽量在句末截断，避免把一句话劈成两半。
 */
export function clampDailyDigest(text: string, max = DAILY_DIGEST_MAX_CHARS): string {
  const cleaned = normalizeBody(text)
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

// ---------- 报纸分节 ----------

export interface ReportQuote {
  text: string
  speaker: string
  /** 角色对这句的短评 */
  comment: string
}

export interface ReportRankingEntry {
  name: string
  comment: string
}

/** 一条要闻：小标题 + 正文（可多段） */
export interface ReportNewsItem {
  title: string
  body: string
}

export interface ReportFavorite {
  name: string
  /** 有点喜欢 / 喜欢 / 非常喜欢 */
  tier: string
  /** 10 / 20 / 30 */
  delta: number
  reason: string
}

export interface ReportSections {
  /** 是否识别出分节标记；false 时只使用 fallback */
  structured: boolean
  headline: string
  lead: string
  news: ReportNewsItem[]
  quotes: ReportQuote[]
  comment: string
  hotwords: string[]
  ranking: ReportRankingEntry[]
  favorite: ReportFavorite | null
  /** 结构化失败时的原始正文 */
  fallback: string
}

const SECTION_KEYS: Record<string, string> = {
  '头条': 'headline',
  '标题': 'headline',
  '导语': 'lead',
  '要闻': 'news',
  '本群要闻': 'news',
  '金句': 'quote',
  '群友金句': 'quote',
  '点评': 'comment',
  '觉的点评': 'comment',
  '热词': 'hot',
  '本期热词': 'hot',
  '活跃': 'ranking',
  '活跃榜': 'ranking',
  '今日最喜欢': 'favorite',
  '本期最喜欢': 'favorite',
}

function normalizeSectionKey(raw: string): string | null {
  const key = (raw || '').replace(/\s+/g, '').trim()
  return SECTION_KEYS[key] || null
}

/**
 * 识别一行是不是栏目标记。模型被要求写成 `【要闻】正文`，
 * 也可能写成 `要闻：正文` 或把正文另起一行，两种都要认。
 */
function matchSectionMarker(line: string): { key: string, rest: string } | null {
  const bracket = line.match(/^\s*[【\[]\s*([^】\]]{1,12}?)\s*[】\]]\s*[：:]?\s*(.*)$/)
  if (bracket) {
    const key = normalizeSectionKey(bracket[1])
    return key ? { key, rest: bracket[2] } : null
  }
  const colon = line.match(/^\s*([^\s：:【】\[\]]{2,6})\s*[：:]\s*(.*)$/)
  if (colon) {
    const key = normalizeSectionKey(colon[1])
    if (key) return { key, rest: colon[2] }
  }
  return null
}

function stripWrapping(text: string): string {
  return (text || '')
    .replace(/^[【\[（(「『"'“]+/, '')
    .replace(/[】\]）)」』"'”]+$/, '')
    .trim()
}

function parseQuoteLine(lines: string[]): ReportQuote | null {
  const raw = lines.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:\d+[.、)]|[-*·])\s*/, '')
    .trim()
  if (!raw) return null
  // 先拆末尾的「｜一句点评」，再拆原话与发言人
  const [quotePart, ...rest] = raw.split(/\s*[｜|]\s*/)
  const comment = rest.join('｜').trim()
  const split = quotePart.match(/^(.+?)\s*(?:——|—|--|－|–)\s*(.+)$/)
  if (split) {
    const text = stripWrapping(split[1]).replace(/^[“"「『]/, '').replace(/[”"」』]$/, '')
    return { text, speaker: stripWrapping(split[2]), comment }
  }
  return { text: stripWrapping(quotePart), speaker: '', comment }
}

/** 模型有时会把提示词里的占位词（正文/内容）原样抄成正文的第一行，去掉它 */
function stripBodyPlaceholder(body: string): string {
  const lines = body.split('\n')
  const first = lines[0].trim()
  // 只有整行就是占位词时才删，避免误伤「正文内容。」这种正常开头
  if (/^(?:正文内容|具体内容|正文|内容)$/.test(first)) {
    return lines.slice(1).join('\n').trimStart()
  }
  const inline = first.match(/^(?:正文内容|具体内容|正文|内容)\s*[:：]\s*(.+)$/)
  if (inline) {
    return [inline[1], ...lines.slice(1)].join('\n').trimStart()
  }
  return body
}

/** 一条要闻：`小标题｜正文`；没有 `｜` 时首行短句也当作小标题 */
function parseNewsItem(lines: string[]): ReportNewsItem | null {
  const raw = lines.join('\n').trim()
  if (!raw) return null
  const split = raw.match(/^([^｜|\n]{1,24})\s*[｜|]\s*([\s\S]+)$/)
  if (split) {
    return {
      title: stripWrapping(split[1]).trim(),
      body: stripBodyPlaceholder(normalizeBody(split[2])),
    }
  }

  // 模型也常写成「小标题独占一行，正文另起」：首行短、不带句末标点、不是引语时当标题
  const rows = raw.split('\n').map(line => line.trim()).filter(Boolean)
  if (rows.length >= 2) {
    const rawFirst = rows[0]
    const first = stripWrapping(rawFirst).replace(/[：:]$/, '').trim()
    const looksLikeTitle = first.length > 0
      && first.length <= 24
      && !/[。！？!?；;，,]$/.test(first)
      && !/^[「『“"]/.test(rawFirst)
    if (looksLikeTitle) {
      return {
        title: first,
        body: stripBodyPlaceholder(normalizeBody(rows.slice(1).join('\n'))),
      }
    }
  }
  return { title: '', body: stripBodyPlaceholder(normalizeBody(raw)) }
}

function parseRankingLine(lines: string[]): ReportRankingEntry | null {
  const raw = lines.join(' ')
    .replace(/\s+/g, ' ')
    .replace(/^\s*(?:\d+[.、)]|[-*·])\s*/, '')
    .trim()
  if (!raw) return null
  const split = raw.match(/^(.+?)\s*[｜|]\s*(.+)$/)
  if (!split) return { name: stripWrapping(raw), comment: '' }
  return { name: stripWrapping(split[1]), comment: split[2].trim() }
}

function parseFavoriteLine(lines: string[]): ReportFavorite | null {
  const raw = lines.join(' ').replace(/\s+/g, ' ').trim()
    .replace(/^[…\.。\s]+/, '')
    .replace(/[…\.。\s]+$/, '')
  if (!raw) return null

  const parts = raw.split(/\s*[｜|]\s*/).map(part => part.trim()).filter(Boolean)
  let name = parts[0] || ''
  let tierLabel = ''
  let reason = ''

  if (parts.length >= 3) {
    tierLabel = parts[1]
    reason = parts.slice(2).join('，')
  } else if (parts.length === 2) {
    // 「昵称｜因为……」说明模型漏了档位，第二段其实是理由
    if (/^因为/.test(parts[1])) reason = parts[1]
    else tierLabel = parts[1]
  } else {
    const because = raw.match(/^(.+?)\s*[，,]?\s*因为\s*(.+)$/)
    if (because) {
      name = because[1]
      reason = because[2]
    }
  }

  name = stripWrapping(name).replace(/^@/, '').trim()
  if (!name) return null
  const tier = resolveFavoriteTier(tierLabel)
  return {
    name,
    tier: tier.label,
    delta: tier.delta,
    reason: reason.replace(/^因为\s*/, '').replace(/^[：:，,\s]+/, '').trim(),
  }
}

/** 热词可能写成一行、也可能每行一个；统一按分隔符拆开 */
function parseHotwords(lines: string[]): string[] {
  const words = lines.join(' ')
    .split(/[\/、,，·\s]+/)
    .map(word => stripWrapping(word).replace(/^#/, '').trim())
    .filter(word => word.length >= 1 && word.length <= 8)
  return [...new Set(words)].slice(0, 6)
}

/**
 * 把模型输出的分节报纸拆成栏目。
 *
 * 完全按标记解析；只要拿到要闻且至少有两个标记就认为结构化成功，
 * 缺的栏目留空由渲染器跳过。解析不到标记时整段原文放进 fallback，
 * 渲染器退回旧的整块正文样式，不会因为格式漂移导致整张图发不出去。
 */
export function parseReportSections(text: string): ReportSections {
  const source = (text || '')
    .replace(/```[a-z]*\n?/gi, '')
    .replace(/\r\n?/g, '\n')
    .trim()

  const empty: ReportSections = {
    structured: false,
    headline: '',
    lead: '',
    news: [],
    quotes: [],
    comment: '',
    hotwords: [],
    ranking: [],
    favorite: null,
    fallback: source,
  }
  if (!source) return empty

  const buckets: { key: string, lines: string[] }[] = []
  let current: { key: string, lines: string[] } | null = null
  let markers = 0
  for (const line of source.split('\n')) {
    const marker = matchSectionMarker(line)
    if (marker) {
      markers++
      current = { key: marker.key, lines: marker.rest ? [marker.rest] : [] }
      buckets.push(current)
      continue
    }
    if (current) current.lines.push(line)
  }

  const pick = (key: string) => buckets.filter(bucket => bucket.key === key)
  const join = (key: string) => pick(key)
    .map(bucket => bucket.lines.join('\n').trim())
    .filter(Boolean)
    .join('\n\n')

  // 要闻可以有多条，每条一个【要闻】栏目
  const news = pick('news')
    .map(bucket => parseNewsItem(bucket.lines))
    .filter((item): item is ReportNewsItem => !!item && !!item.body)
  if (!news.length || markers < 2) return empty

  const headline = pick('headline')
    .map(bucket => bucket.lines.join(' ').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/^[“"「『]/, '')
    .replace(/[”"」』]$/, '')
    .replace(/[。．.！!]+$/, '')
    .trim()

  return {
    structured: true,
    headline: headline || deriveHeadline(news[0].body),
    lead: join('lead').replace(/\s*\n+\s*/g, ' '),
    news,
    // 模型常把多条金句写在同一个【金句】下面，按行拆开
    quotes: pick('quote')
      .flatMap(bucket => bucket.lines)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => parseQuoteLine([line]))
      .filter((item): item is ReportQuote => !!item),
    comment: normalizeBody(join('comment')),
    hotwords: parseHotwords(pick('hot').flatMap(bucket => bucket.lines)),
    // 模型常把多条活跃榜写在同一个【活跃】下面，按行拆开
    ranking: pick('ranking')
      .flatMap(bucket => bucket.lines)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => parseRankingLine([line]))
      .filter((item): item is ReportRankingEntry => !!item),
    favorite: parseFavoriteLine(pick('favorite').flatMap(bucket => bucket.lines)),
    fallback: source,
  }
}

/** 模型漏写头条时，用要闻第一句顶上，别让版面空着 */
function deriveHeadline(news: string): string {
  const first = news.split(/\n+/)[0] || ''
  const sentence = first.split(/[。！？!?]/)[0].trim()
  return sentence.length > 18 ? `${sentence.slice(0, 18)}…` : sentence
}

// ---------- 金句候选 ----------

export interface QuoteCandidate {
  text: string
  /** 第一个说这句话的群友 */
  speaker: string
  /** 被复读的总次数（含第一次） */
  count: number
  time: Date
}

/**
 * 候选条数：按当期总消息数取对数，1500 条拟合到 150 条。
 * 100 条 -> 69，1500 条 -> 150，1 万条 -> 171，4.5 万条 -> 192。
 */
export function quoteCandidateCount(total: number): number {
  if (total <= 0) return 0
  return Math.max(1, Math.round(150 * Math.log(total) / Math.log(1500)))
}

const QUOTE_MIN_CHARS = 6
const QUOTE_MAX_CHARS = 40

function normalizeQuoteText(text: string): string {
  return (text || '').replace(/\s+/g, ' ').trim()
}

/** 过滤掉链接、命令、纯表情、复读同一个字这类不适合当金句的消息 */
function isQuotable(text: string): boolean {
  if (text.length < QUOTE_MIN_CHARS || text.length > QUOTE_MAX_CHARS) return false
  if (/^https?:\/\//i.test(text) || text.includes('://')) return false
  if (/^[/!.]/.test(text)) return false
  if (text === '[图片]') return false
  const meaningful = text.replace(/[^\p{L}\p{N}]/gu, '')
  if (meaningful.length < 4) return false
  if (/^(.)\1+$/.test(meaningful)) return false
  return true
}

/**
 * 从区间内的群友消息里抽金句候选。
 *
 * 相同内容去重，记录被复读的总次数，发言人取第一个说这句话的群友；
 * 超过上限时按时间分 24 桶轮流取，避免候选全挤在某个时段。
 */
export function buildQuoteCandidates(
  rows: SatDialogue[],
  total: number,
  from: Date,
  to: Date,
): QuoteCandidate[] {
  const limit = quoteCandidateCount(total)
  if (!limit) return []

  const map = new Map<string, QuoteCandidate>()
  for (const row of rows) {
    if (row.kind !== 'ambient') continue
    const text = normalizeQuoteText(row.userContent)
    if (!isQuotable(text)) continue
    const time = new Date(row.createdAt)
    const existing = map.get(text)
    if (existing) {
      existing.count++
      if (time.getTime() < existing.time.getTime()) {
        existing.time = time
        existing.speaker = row.username || row.userId || '群友'
      }
    } else {
      map.set(text, {
        text,
        speaker: row.username || row.userId || '群友',
        count: 1,
        time,
      })
    }
  }

  const all = [...map.values()]
  if (all.length <= limit) return all.sort((a, b) => +a.time - +b.time)

  const span = Math.max(1, to.getTime() - from.getTime())
  const buckets: QuoteCandidate[][] = Array.from({ length: 24 }, () => [])
  for (const item of all) {
    const index = Math.min(23, Math.max(0, Math.floor((item.time.getTime() - from.getTime()) / span * 24)))
    buckets[index].push(item)
  }
  const score = (item: QuoteCandidate) => {
    let value = item.count * 3 + Math.min(item.text.length, 30) / 10
    if (/[！？!?…]/.test(item.text)) value += 2
    if (item.count > 1) value += 4
    return value
  }
  for (const bucket of buckets) bucket.sort((a, b) => score(b) - score(a))

  const picked: QuoteCandidate[] = []
  for (let round = 0; picked.length < limit; round++) {
    let added = false
    for (const bucket of buckets) {
      const item = bucket[round]
      if (!item) continue
      picked.push(item)
      added = true
      if (picked.length >= limit) break
    }
    if (!added) break
  }
  return picked.sort((a, b) => +a.time - +b.time)
}

/** 金句候选的提示词格式：MM/DD HH:mm 昵称：原话（复读 N 次） */
export function formatQuoteCandidates(candidates: QuoteCandidate[], timezoneOffset: number): string {
  return candidates.map(item => {
    const time = formatTime(item.time, timezoneOffset).slice(5)
    const repeat = item.count > 1 ? `（复读 ${item.count} 次）` : ''
    return `${time} ${item.speaker}：${item.text}${repeat}`
  }).join('\n')
}

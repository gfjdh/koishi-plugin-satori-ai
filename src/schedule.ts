// src/schedule.ts
// 「觉的日程」引擎：从数据目录的 schedule.json 读取日程，按当前时刻挑一条，
// 替换随机变量，生成注入系统提示的一段文字。
//
// 内容全部在 JSON 里（默认 ${dataDir}/schedule.json），插件只负责匹配与选词。
// 文件不存在时会写入一份只演示写法的示例，不会写入任何角色扮演内容。
//
// 关键约束：
// - 同一时段内所有用户、所有请求拿到的文字必须逐字节相同，保证前缀缓存可命中；
//   因此活动和变量都用「日期 + 条目」的确定性哈希选择，不使用 Math.random()。
// - {变量} 在同一时段内固定：午饭里的 {food} 和同一时段插曲里的 {food} 是同一个。
import * as fs from 'fs'
import * as path from 'path'

const MINUTES_PER_DAY = 24 * 60
const HOUR_MS = 3_600_000
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DEFAULT_TEMPLATE = '你现在的日程安排是：{activity}。'
// 用「没有互动就会去做」来限定日程的作用：避免模型以为自己此刻正身处那个场景，
// 把日程当成正在发生的经历写进对话。
const DEFAULT_HINT = '如果与用户没有具体的互动，你就会去做这件事。不要主动说明这是一份日程或系统信息。'
/** 一次注入最多附带几条变量简介，避免提示词过长 */
const MAX_NOTES = 3

/** 变量条目：字符串，或带简介的对象（简介会一起注入，让模型能就这个话题展开） */
export interface ScheduleVar {
  text: string
  note?: string
}

export interface ScheduleItem {
  /** 开始时间 "HH:MM" */
  start: string
  /** 结束时间 "HH:MM"，省略表示到当天结束；小于开始时间表示跨午夜 */
  end?: string
  /** 只在指定星期生效，省略表示每天 */
  days?: string[]
  /** 候选活动，至少一条 */
  activities: string[]
  /** 可选小插曲 */
  variations?: string[]
  /** 覆盖全局的小插曲概率 */
  variationChance?: number
}

export interface ScheduleFile {
  template: string
  /** 日程后面的说明，限定它只是「没有互动时才会去做」的安排 */
  hint: string
  variationChance: number
  vars: Record<string, ScheduleVar[]>
  items: ScheduleItem[]
}

export interface ScheduleOptions {
  file: ScheduleFile
  /** 时区偏移（小时），与分层记忆共用，保证时段与提示里的日期时间一致 */
  timezoneOffset: number
  /** 可注入时钟，便于验证；生产环境不传 */
  now?: () => Date
  /** 配置有问题时的告警出口（同一个问题只报一次） */
  warn?: (message: string) => void
}

// 同一条告警只报一次：日程每个会话都会计算，重复刷日志没有意义
const warned = new Set<string>()
function warnOnce(warn: ScheduleOptions['warn'], message: string) {
  if (!warn || warned.has(message)) return
  warned.add(message)
  warn(message)
}

/** "HH:MM" → 当天分钟数；非法值返回 null */
function parseTime(value?: string): number | null {
  if (value == null) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value).trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 24 || minutes > 59) return null
  const total = hours * 60 + minutes
  return total > MINUTES_PER_DAY ? null : total
}

/** 条目是否覆盖当前分钟；end <= start 视为跨午夜，end == start 视为整天 */
function covers(item: ScheduleItem, minute: number): boolean {
  const start = parseTime(item.start)
  if (start == null) return false
  // 省略的 end 在 JSON 里可能写成空字符串，同样按「到当天结束」处理
  const end = item.end == null || item.end === '' ? MINUTES_PER_DAY : parseTime(item.end)
  if (end == null) return false
  if (end > start) return minute >= start && minute < end
  return minute >= start || minute < end
}

/** FNV-1a 32 位哈希，跨进程稳定，不需要引入依赖 */
function hashString(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pick<T>(list: T[], seed: string): T {
  return list[hashString(seed) % list.length]
}

/** 把哈希映射到 [0, 1)，用于小插曲概率 */
function roll(seed: string): number {
  return hashString(seed) / 4294967296
}

/** 去掉句末标点，由模板或调用方统一补，避免出现「。。」 */
function strip(value: string): string {
  return value.trim().replace(/[。.]+$/, '')
}

/** 替换 {变量}；找不到对应变量池时按空字符串处理并告警 */
function resolveVars(
  text: string,
  vars: Record<string, ScheduleVar[]>,
  seed: string,
  used: Map<string, ScheduleVar>,
  warn?: ScheduleOptions['warn'],
): string {
  return text.replace(/\{([^{}]+)\}/g, (_whole, name: string) => {
    const pool = vars[name]
    if (!pool || !pool.length) {
      warnOnce(warn, `日程变量 {${name}} 没有对应的取值列表（vars.${name}），已按空字符串处理`)
      return ''
    }
    const entry = pick(pool, seed + '|var:' + name)
    used.set(name, entry)
    return entry.text
  })
}

// ---------- 文件读取 ----------

interface CacheEntry {
  mtimeMs: number
  file: ScheduleFile | null
}
const cache = new Map<string, CacheEntry>()

/** 只演示写法、不含角色扮演内容的示例文件 */
export function createExampleSchedule(): Record<string, any> {
  return {
    说明: [
      'start/end 为 HH:MM；end 省略表示到当天结束，end 小于 start 表示跨午夜。',
      'days 省略表示每天生效，可写 周一…周日。',
      'activities / variations 里可以写 {变量}，从 vars 的同名列表取值；同一时段内固定取同一个值。',
      'vars 的条目可以是字符串，也可以是 { "text": "...", "note": "..." }，note 会作为补充信息一起注入。',
      'template 是日程的句式，{activity} 会被替换；hint 是跟在后面的说明，用来限定它只是「没有互动时才会去做」的安排。',
      'variationChance 是小插曲概率，条目里可以单独覆盖。',
      '没有任何条目命中的时段不会注入日程。',
    ],
    template: DEFAULT_TEMPLATE,
    hint: DEFAULT_HINT,
    variationChance: 0.35,
    vars: {
      book: [
        '《一本正在看的书》',
        { text: '《另一本书》', note: '一句话简介，会作为补充信息一起注入' },
      ],
      food: ['某道菜'],
    },
    items: [
      { start: '00:00', end: '08:00', activities: ['睡觉'] },
      {
        start: '08:00', end: '12:00',
        activities: ['在看书{book}', '整理书架'],
        variations: ['有人来敲门'],
        variationChance: 0.5,
      },
      { start: '12:00', end: '13:00', activities: ['吃{food}'] },
      { start: '13:00', end: '18:00', activities: ['处理手头的事'] },
      { start: '18:00', end: '22:00', activities: ['休息'] },
      { start: '22:00', end: '00:00', activities: ['准备睡觉'] },
    ],
  }
}

function toVarList(value: any): ScheduleVar[] {
  if (!Array.isArray(value)) return []
  const list: ScheduleVar[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      list.push({ text: entry })
    } else if (entry && typeof entry === 'object' && typeof entry.text === 'string') {
      list.push({
        text: entry.text,
        note: typeof entry.note === 'string' ? entry.note : undefined,
      })
    }
  }
  return list.filter(entry => !!entry.text)
}

/** 把 JSON 内容整理成引擎能用的结构；结构性错误只跳过对应部分 */
export function parseScheduleFile(raw: any, warn?: ScheduleOptions['warn']): ScheduleFile | null {
  if (!raw || typeof raw !== 'object') {
    warnOnce(warn, '日程文件的内容不是对象，已忽略')
    return null
  }
  const vars: Record<string, ScheduleVar[]> = {}
  if (raw.vars && typeof raw.vars === 'object') {
    for (const [name, value] of Object.entries(raw.vars)) {
      const list = toVarList(value)
      if (list.length) vars[name] = list
    }
  }
  const items: ScheduleItem[] = []
  for (const entry of Array.isArray(raw.items) ? raw.items : []) {
    if (!entry || typeof entry !== 'object') continue
    const activities = Array.isArray(entry.activities)
      ? entry.activities.filter((text: any) => typeof text === 'string' && text.trim())
      : []
    if (typeof entry.start !== 'string' || !activities.length) {
      warnOnce(warn, '日程条目缺少 start 或 activities，已跳过')
      continue
    }
    const chance = entry.variationChance ?? entry.variation_chance
    items.push({
      start: entry.start,
      end: typeof entry.end === 'string' ? entry.end : undefined,
      days: Array.isArray(entry.days) ? entry.days.filter((day: any) => typeof day === 'string') : undefined,
      activities,
      variations: Array.isArray(entry.variations)
        ? entry.variations.filter((text: any) => typeof text === 'string' && text.trim())
        : undefined,
      variationChance: typeof chance === 'number' ? chance : undefined,
    })
  }
  const chance = raw.variationChance ?? raw.variation_chance
  return {
    template: typeof raw.template === 'string' && raw.template.trim() ? raw.template : DEFAULT_TEMPLATE,
    hint: typeof raw.hint === 'string' && raw.hint.trim() ? raw.hint : DEFAULT_HINT,
    variationChance: typeof chance === 'number' ? chance : 0.35,
    vars,
    items,
  }
}

/**
 * 读取 ${dataDir}/schedule.json。文件不存在时写入示例；按 mtime 缓存，
 * 改完文件不用重启，下一次回复就会生效。
 */
export function loadScheduleFile(dataDir: string, warn?: ScheduleOptions['warn']): ScheduleFile | null {
  const filePath = path.join(dataDir, 'schedule.json')
  try {
    if (!fs.existsSync(filePath)) {
      fs.mkdirSync(dataDir, { recursive: true })
      fs.writeFileSync(filePath, JSON.stringify(createExampleSchedule(), null, 2) + '\n')
      warnOnce(warn, `已生成示例日程文件：${filePath}（只演示写法，请按需修改）`)
    }
    const stat = fs.statSync(filePath)
    const cached = cache.get(filePath)
    if (cached && cached.mtimeMs === stat.mtimeMs) return cached.file
    const file = parseScheduleFile(JSON.parse(fs.readFileSync(filePath, 'utf-8')), warn)
    cache.set(filePath, { mtimeMs: stat.mtimeMs, file })
    return file
  } catch (error) {
    warnOnce(warn, `读取日程文件失败（${filePath}）：${error?.message || error}`)
    return null
  }
}

// ---------- 生成 ----------

/** 当前时刻的日程文本；没有条目命中时返回 null（此时不注入） */
export function buildScheduleText(options: ScheduleOptions): string | null {
  const file = options.file
  if (!file?.items?.length) return null
  const vars = file.vars || {}
  const template = file.template || DEFAULT_TEMPLATE
  const chance = file.variationChance ?? 0.35

  const now = options.now ? options.now() : new Date()
  const shifted = new Date(now.getTime() + options.timezoneOffset * HOUR_MS)
  const weekday = WEEKDAYS[shifted.getUTCDay()]
  const minute = shifted.getUTCHours() * 60 + shifted.getUTCMinutes()
  const pad = (value: number) => String(value).padStart(2, '0')
  const dateKey = `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`

  const candidates = file.items
    .map((item, index) => ({ item, index, start: parseTime(item.start) }))
    .filter(candidate =>
      candidate.start != null
      && candidate.item.activities?.length > 0
      // 省略的 days 可能是空数组，空数组等同于「每天」
      && (!candidate.item.days?.length || candidate.item.days.includes(weekday))
      && covers(candidate.item, minute),
    )
  if (!candidates.length) return null

  // 星期限定的条目优先，其次开始时间更晚的（更具体的时段覆盖更宽的）
  candidates.sort((a, b) => {
    const specificity = (item: ScheduleItem) => item.days?.length ? 1 : 0
    const diff = specificity(b.item) - specificity(a.item)
    if (diff) return diff
    if (a.start !== b.start) return b.start - a.start
    return a.index - b.index
  })

  const chosen = candidates[0]
  const item = chosen.item
  // 种子只用「日期 + 条目」：同一时段内反复请求得到同一句话，跨时段各自选词
  const seed = `${dateKey}|${weekday}|${item.start}|${chosen.index}`
  const used = new Map<string, ScheduleVar>()

  const activity = strip(resolveVars(pick(item.activities, seed + '|act'), vars, seed, used, options.warn))
  if (!template.includes('{activity}')) {
    warnOnce(options.warn, 'schedule.json 的 template 里没有 {activity}，日程不会包含当前活动')
  }
  let text = template.split('{activity}').join(activity)

  const itemChance = item.variationChance ?? chance
  if (item.variations?.length && roll(seed + '|roll') < itemChance) {
    const variation = resolveVars(pick(item.variations, seed + '|var-pick'), vars, seed, used, options.warn)
    text += '\n' + strip(variation) + '。'
  }

  // 变量自带的简介一起注入：模型被问到「你在看什么书」时才有话可说
  const notes = [...used.values()].filter(entry => entry.note).slice(0, MAX_NOTES)
  for (const note of notes) text += `\n${note.text}：${note.note}`

  return text + '\n' + (file.hint || DEFAULT_HINT)
}

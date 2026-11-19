// src/silence.ts
// 静默 / 封禁：本质是同一件事——某个用户在一段时间内不再得到回复。
// 区别只在来源：model = 模型被冒犯后用触发词主动宣告；admin = 管理员手动封禁。
// 状态持久化在数据库 sat_silence 表，重启不丢；模型决定时长（触发词 [沉默N]），
// 管理员封禁可设永久（时长 0）。解除入口统一为「解封」。
import { Context, Logger } from 'koishi'

const logger = new Logger('satori-silence')

/** 提示词里展示给模型的触发词形式；N 是模型自己决定的分钟数 */
export const SILENCE_MARKER = '[沉默N]'

/** 模型没有写分钟数时的兜底时长 */
const DEFAULT_MINUTES = 30
/** 防止模型写出过长的时长；管理员封禁不受此限制 */
const MAX_MODEL_MINUTES = 24 * 60

// 触发词里带可选的数字与单位；方括号/全角括号都认
const MARKER_PATTERN = /[\[【]\s*沉默\s*(\d+)?\s*(分钟|分|小时|时|h|min)?\s*[\]】]/gi

export interface SilenceTrigger {
  content: string
  triggered: boolean
  /** 模型决定的沉默分钟数 */
  minutes: number
}

/** 从回复里取出触发词：返回去掉触发词后的内容、是否触发、以及模型指定的时长 */
export function stripSilenceMarker(content: string): SilenceTrigger {
  if (!content) return { content, triggered: false, minutes: 0 }
  const matches = [...content.matchAll(MARKER_PATTERN)]
  if (!matches.length) return { content, triggered: false, minutes: 0 }

  let minutes = 0
  for (const match of matches) {
    const value = Number(match[1] || 0)
    const unit = (match[2] || '').toLowerCase()
    const parsed = unit === '小时' || unit === '时' || unit === 'h' ? value * 60 : value
    minutes = Math.max(minutes, parsed)
  }
  if (!minutes) minutes = DEFAULT_MINUTES
  minutes = Math.min(minutes, MAX_MODEL_MINUTES)

  return { content: content.replace(MARKER_PATTERN, ''), triggered: true, minutes }
}

/** 静默/封禁期间也放行的运维指令：查看、管理员封禁/解封 */
export function isMuteControlCommand(name: string): boolean {
  return name === 'sat.silence' || name === '封禁' || name === '解封'
}

/** 解析管理员输入的封禁时长（分钟）；非法输入返回 null，0 表示永久 */
export function parseBanMinutes(input?: string): number | null {
  if (!input) return null
  const value = Number(input)
  if (!Number.isFinite(value) || value < 0) return null
  return Math.floor(value)
}

// ---------- 持久化 ----------

export interface SatSilence {
  id: number
  userId: string
  /** 解除时间；null 表示永久 */
  until: Date | null
  /** model = 模型主动静默；admin = 管理员封禁 */
  source: string
  /** 管理员封禁时的操作者；模型触发时为空字符串 */
  operator: string
  createdAt: Date
}

declare module 'koishi' {
  interface Tables {
    sat_silence: SatSilence
  }
}

const extendedContexts = new WeakSet<Context>()

export function extendSilenceDatabase(ctx: Context) {
  if (extendedContexts.has(ctx)) return
  extendedContexts.add(ctx)
  ctx.model.extend('sat_silence', {
    id: 'unsigned',
    userId: 'string',
    until: 'timestamp',
    source: 'string',
    operator: 'string',
    createdAt: 'timestamp',
  }, {
    autoInc: true,
    unique: [['userId']],
  })
}

/** 剩余分钟数；永久封禁返回 0（用 until === null 判断） */
export function silenceRemainingMinutes(row: SatSilence): number {
  if (!row.until) return 0
  return Math.max(0, Math.ceil((row.until.getTime() - Date.now()) / 60_000))
}

export class SilenceManager {
  constructor(private ctx: Context) {}

  /** 当前状态；到期记录顺手清理 */
  async info(userId: string): Promise<SatSilence | null> {
    if (!userId) return null
    const [row] = await this.ctx.database.get('sat_silence', { userId })
    if (!row) return null
    if (row.until && row.until.getTime() <= Date.now()) {
      await this.ctx.database.remove('sat_silence', { userId })
      logger.info(`[静默/封禁] 到期自动解除 user=${userId}`)
      return null
    }
    return row
  }

  async isMuted(userId: string): Promise<boolean> {
    return !!(await this.info(userId))
  }

  /**
   * 开始静默/封禁：minutes = 0 表示永久（管理员封禁用）。
   * source 区分模型主动静默与管理员封禁，只影响日志和查看文案。
   */
  async apply(userId: string, minutes: number, source: 'model' | 'admin', operator = ''): Promise<SatSilence> {
    const duration = Math.floor(minutes)
    const until = duration > 0 ? new Date(Date.now() + duration * 60_000) : null
    await this.ctx.database.remove('sat_silence', { userId })
    const row: Omit<SatSilence, 'id'> = { userId, until, source, operator, createdAt: new Date() }
    await this.ctx.database.create('sat_silence', row)
    const prefix = source === 'admin' ? '封禁' : '主动静默'
    logger.info(`[${prefix}] user=${userId} ${until ? `${duration} 分钟` : '永久'}`
      + (operator ? ` operator=${operator}` : ''))
    return { id: 0, ...row }
  }

  /** 解除静默或封禁；返回是否真的解除了 */
  async lift(userId: string): Promise<boolean> {
    const result = await this.ctx.database.remove('sat_silence', { userId })
    if (result.removed) logger.info(`[静默/封禁] 手动解除 user=${userId}`)
    return !!result.removed
  }
}

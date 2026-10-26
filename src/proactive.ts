// src/proactive.ts
// 主动消息 MVP：仅私聊。用户沉默 1~2 小时后，由机器人基于记忆主动开口一次；
// 用户不回复就不再追发，直到他下一次说话重新计时。
//
// 状态全部在内存里，插件重载即清空。这是有意的安全阀：
// 重启后不会突然给所有历史用户群发，也避免 MVP 阶段引入数据库迁移。
import { Bot, Context, Logger, Session, Universal } from 'koishi'
import type { SAT } from './index'
import type { Sat } from './types'
import { splitSentences } from './utils'

const logger = new Logger('satori-proactive')

/** 一次沉默周期只主动一次：发出后 armed=false，等用户再次发言才重新武装。 */
interface Target {
  key: string
  platform: string
  selfId: string
  channelId: string
  guildId: string
  userId: string
  username: string
  /** 用户最后一次真实发言时间（毫秒） */
  lastActiveAt: number
  /** 用户最后一句，截断后用于记忆检索 */
  lastContent: string
  /** 下次允许主动的时间（毫秒） */
  dueAt: number
  armed: boolean
}

export class ProactiveManager {
  private targets = new Map<string, Target>()
  private timer: (() => void) | null = null
  private firing = false

  constructor(
    private ctx: Context,
    private sat: SAT,
    private config: Sat.Config,
  ) {}

  start(): void {
    if (!this.config.enable_proactive) {
      logger.info('主动消息未启用')
      return
    }
    const min = this.minIdleMs
    const max = this.maxIdleMs
    logger.info(`主动消息已启动：沉默 ${min / 60_000}~${max / 60_000} 分钟后触发，`
      + `安静时段 ${this.config.proactive_quiet_start_hour}:00-${this.config.proactive_quiet_end_hour}:00`)
    this.timer = this.ctx.setInterval(() => void this.tick(), 60_000)
  }

  stop(): void {
    if (this.timer) {
      this.timer()
      this.timer = null
    }
    this.targets.clear()
  }

  /** 在私聊消息进入对话流程前调用：记录活跃并重新武装。 */
  touch(session: Session): void {
    if (!this.config.enable_proactive) return
    if (!this.isPrivateSession(session)) return

    const now = Date.now()
    const key = `${session.platform}:${session.selfId}:${session.channelId}`
    const content = (session.content || '').trim().slice(0, 200)
    const dueAt = this.nextDueAt(now)
    const existing = this.targets.get(key)

    if (existing) {
      existing.lastActiveAt = now
      existing.lastContent = content || existing.lastContent
      existing.dueAt = dueAt
      existing.armed = true
      existing.username = session.username || existing.username
      return
    }

    this.targets.set(key, {
      key,
      platform: session.platform,
      selfId: session.selfId,
      channelId: session.channelId,
      guildId: session.guildId || '',
      userId: session.userId,
      username: session.username || '',
      lastActiveAt: now,
      lastContent: content,
      dueAt,
      armed: true,
    })
    logger.debug(`已记录私聊目标 ${key}，将在 ${Math.round((dueAt - now) / 60_000)} 分钟后待命`)
  }

  private async tick(): Promise<void> {
    if (!this.config.enable_proactive || this.firing) return
    if (this.inQuietHours(new Date())) return

    this.firing = true
    try {
      const now = Date.now()
      this.prune(now)
      for (const target of this.targets.values()) {
        if (!target.armed) continue
        if (now < target.dueAt) continue
        if (now - target.lastActiveAt > this.config.proactive_max_idle_hours * 3_600_000) {
          target.armed = false
          logger.debug(`沉默过久，放弃主动 ${target.key}`)
          continue
        }

        const bot = this.ctx.bots.find(
          bot => bot.platform === target.platform && bot.selfId === target.selfId,
        )
        if (!bot) {
          logger.debug(`找不到在线机器人 ${target.platform}:${target.selfId}，跳过 ${target.key}`)
          continue
        }

        // 先解除武装再发送：即使发送很慢或失败，也不会在同一分钟重复触发。
        target.armed = false
        try {
          await this.fire(target, bot)
        } catch (error) {
          logger.error(`主动消息失败 ${target.key}: ${error}`)
        }
        // 每分钟最多一条，避免重载或积压时瞬间刷屏。
        break
      }
    } finally {
      this.firing = false
    }
  }

  private async fire(target: Target, bot: Bot): Promise<void> {
    const session = bot.session({
      type: 'message',
      user: { id: target.userId, name: target.username },
      channel: { id: target.channelId, type: Universal.Channel.Type.DIRECT },
      guild: { id: target.guildId },
    }) as unknown as Session

    const idleMinutes = Math.floor((Date.now() - target.lastActiveAt) / 60_000)
    const text = await this.sat.generateProactive(session, idleMinutes, target.lastContent)
    if (!text) {
      logger.info(`生成内容为空，跳过 ${target.key}`)
      return
    }

    const parts = this.config.sentences_divide && text.length > 10
      ? splitSentences(text, this.config.min_sentences_length, this.config.max_sentences_length)
      : [text]

    for (let i = 0; i < parts.length; i++) {
      if (i > 0 && this.config.time_interval > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.time_interval))
      }
      await this.send(bot, target, parts[i])
    }
    // 只有真正发出去才写短期记忆，避免发送失败后模型误以为说过。
    this.sat.recordProactive(session, text)
    logger.info(`已主动发送 user=${target.userId} idle=${idleMinutes}min: ${text}`)
  }

  private async send(bot: Bot, target: Target, content: string): Promise<void> {
    try {
      await bot.sendPrivateMessage(target.userId, content)
    } catch (error) {
      logger.debug(`sendPrivateMessage 失败，回退 sendMessage: ${error}`)
      await bot.sendMessage(target.channelId, content)
    }
  }

  /** 清理长期沉默且不会再触发的目标，避免 Map 无限增长 */
  private prune(now: number): void {
    const expire = 7 * 86_400_000
    for (const [key, target] of this.targets) {
      if (!target.armed && now - target.lastActiveAt > expire) {
        this.targets.delete(key)
      }
    }
  }

  private isPrivateSession(session: Session): boolean {
    if (session.subtype === 'private') return true
    return typeof session.channelId === 'string' && session.channelId.includes('private')
  }

  private get minIdleMs(): number {
    return Math.max(1, this.config.proactive_min_idle_minutes) * 60_000
  }

  private get maxIdleMs(): number {
    return Math.max(1, this.config.proactive_max_idle_minutes) * 60_000
  }

  private nextDueAt(from: number): number {
    const min = Math.min(this.minIdleMs, this.maxIdleMs)
    const max = Math.max(this.minIdleMs, this.maxIdleMs)
    return from + min + Math.random() * (max - min)
  }

  private inQuietHours(date: Date): boolean {
    const start = this.config.proactive_quiet_start_hour
    const end = this.config.proactive_quiet_end_hour
    if (start === end) return false
    const hour = date.getHours()
    // 兼容跨零点区间，例如 23 -> 8
    return start < end
      ? hour >= start && hour < end
      : hour >= start || hour < end
  }
}

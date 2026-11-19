// src/cold-rescue.ts
// 冷场救场：群里十分钟没人说话后，有人开口、且一分钟内无人回应，bot 接一句。
// 与随机回复互相独立：这条消息已经触发随机回复（或昵称回复）时不再救场。
// 状态只在内存里，插件重载即清空；不写长期记忆。
import { Context, Logger, Session } from 'koishi'
import type { SAT } from './index'
import type { Sat } from './types'
import { hasTextContent } from './vision'
import { isGroupSession } from './memory/group'

const logger = new Logger('satori-cold-rescue')

/** 上一条消息距今至少十分钟，才算冷场 */
const COLD_SILENCE_MS = 10 * 60_000
/** 开口后等待一分钟，仍无人回应才救场 */
const RESCUE_DELAY_MS = 60_000

interface Pending {
  timer: () => void
  session: Session
  /** 武装这条救场时，本群的消息序号；期间有新消息就不再救场 */
  seq: number
}

export class ColdRescueManager {
  /** channelId -> 本群最后一条消息的时间 */
  private lastMessageAt = new Map<string, number>()
  /** channelId -> 本群消息序号；同一毫秒内的两条消息也能区分 */
  private messageSeq = new Map<string, number>()
  /** channelId -> 待触发的救场 */
  private pending = new Map<string, Pending>()

  constructor(
    private ctx: Context,
    private sat: SAT,
    private config: Sat.Config,
  ) {}

  /**
   * 每条群消息都会经过这里：更新本群最后活动时间，并取消待触发的救场。
   * 返回这条消息的序号表示它发生在十分钟沉默之后，符合「冷场开口」；
   * 否则返回 null。
   */
  observe(session: Session): number | null {
    if (!this.config.enable_cold_rescue) return null
    if (!isGroupSession(session)) return null

    const key = session.channelId
    const now = Date.now()
    const previous = this.lastMessageAt.get(key)
    const seq = (this.messageSeq.get(key) || 0) + 1
    this.messageSeq.set(key, seq)
    this.lastMessageAt.set(key, now)
    this.clearPending(key)

    // bot 自己的回显、纯图片/@/链接不算「有人开口」
    if (session.userId === session.selfId) return null
    if (!hasTextContent(session)) return null

    return previous !== undefined && now - previous >= COLD_SILENCE_MS ? seq : null
  }

  /**
   * 冷场开口的消息已经进入群聊环境，武装一分钟后的救场。
   * seq 是 observe 返回的序号；等待期间又有消息进来就不再武装。
   */
  arm(session: Session, seq: number): void {
    if (!this.config.enable_cold_rescue) return
    const key = session.channelId
    // 消息写入群聊环境是异步的，期间可能已经有人接着说话
    if (this.messageSeq.get(key) !== seq) return
    this.clearPending(key)
    const timer = this.ctx.setTimeout(() => void this.fire(key), RESCUE_DELAY_MS)
    this.pending.set(key, { timer, session, seq })
    logger.info(`冷场救场已武装 channel=${key}，一分钟后无人回复将接话`)
  }

  stop(): void {
    for (const key of [...this.pending.keys()]) this.clearPending(key)
    this.lastMessageAt.clear()
    this.messageSeq.clear()
  }

  private async fire(key: string): Promise<void> {
    const pending = this.pending.get(key)
    if (!pending) return
    this.pending.delete(key)
    // 定时器排队期间可能又有人说话（clearPending 清得掉定时器，清不掉已排队的回调）
    if (this.messageSeq.get(key) !== pending.seq) return

    logger.info(`冷场救场触发 channel=${key} user=${pending.session.username}`)
    try {
      await this.sat.handleColdRescue(pending.session)
      // bot 的发言也算群里的活动，下一次冷场从这条发言之后重新计时
      this.lastMessageAt.set(key, Date.now())
    } catch (error) {
      logger.warn(`冷场救场失败 channel=${key}: ${error}`)
    }
  }

  private clearPending(key: string): void {
    const pending = this.pending.get(key)
    if (!pending) return
    pending.timer()
    this.pending.delete(key)
  }
}

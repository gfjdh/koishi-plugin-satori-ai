// src/memory/group-recorder.ts
// 群聊原始消息的落库缓冲。
//
// 群里每天几千条消息，逐条同步写 SQLite 会拖慢消息处理路径，所以先按频道
// 攒在内存里，定时或攒够一批再批量写入。进程崩溃最多丢一个缓冲窗口，
// 不影响已经归档的记忆。
//
// 只记录「机器人最近真的参与过」的群：机器人回话时才把群标记为合格并建 meta，
// 启动时从活跃 meta 恢复。没人理 bot 的群不会白占存储和心跳名额。
import { Context, Logger } from 'koishi'
import { MemoryRepository } from './repository'
import {
  GROUP_BOT_KIND, GROUP_MEMBER_KIND, GROUP_SCOPE_PREFIX, groupScopeId, isGroupSession,
} from './group'
import { SatDialogue } from './schema'

const logger = new Logger('satori-group')

export interface GroupRecorderConfig {
  enabled: boolean
  /** 机器人多少天内回过话的群才算活跃 */
  activeWindowDays: number
  flushIntervalMs?: number
  maxBuffer?: number
}

/** 只取 GroupRecorder 需要的会话字段，便于测试 */
export interface GroupRecorderSession {
  channelId?: string
  userId?: string
  username?: string
  selfId?: string
  subtype?: string
  isDirect?: boolean
}

export class GroupRecorder {
  private buffers = new Map<string, Omit<SatDialogue, 'id'>[]>()
  /** 机器人回过话的群（channelId） */
  private qualified = new Set<string>()
  /** 同一频道的写入串行化，避免两次 flush 交错导致消息乱序 */
  private pending = new Map<string, Promise<void>>()
  private timer?: () => void

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private config: GroupRecorderConfig,
  ) {}

  start(): void {
    if (!this.config.enabled) return
    void this.seed()
    const interval = Math.max(10_000, this.config.flushIntervalMs ?? 60_000)
    this.timer = this.ctx.setInterval(() => this.flushAll(), interval)
  }

  stop(): void {
    if (this.timer) {
      this.timer()
      this.timer = undefined
    }
    this.flushAll()
  }

  /** 启动时恢复活跃群列表；失败不影响后续（机器人回话时会重新标记） */
  private async seed(): Promise<void> {
    try {
      const since = new Date(Date.now() - this.config.activeWindowDays * 86_400_000)
      const metas = await this.repo.getActiveMetas(since, 1000)
      for (const meta of metas) {
        if (!meta.scopeId?.startsWith(GROUP_SCOPE_PREFIX)) continue
        this.qualified.add(meta.scopeId.slice(GROUP_SCOPE_PREFIX.length))
      }
      if (this.qualified.size) logger.info(`群聊记忆已恢复 ${this.qualified.size} 个活跃群`)
    } catch (error) {
      logger.warn(`恢复活跃群失败：${error}`)
    }
  }

  /** 群友发言：只记录机器人参与过的群 */
  record(session: GroupRecorderSession, content: string): void {
    if (!this.config.enabled) return
    if (!isGroupSession(session)) return
    const channelId = session.channelId
    if (!channelId || !this.qualified.has(channelId)) return
    const text = (content || '').trim()
    if (!text) return
    this.push(channelId, {
      scopeId: groupScopeId(channelId),
      userId: session.userId || '',
      username: session.username || '',
      kind: GROUP_MEMBER_KIND,
      userContent: text,
      aiContent: '',
      createdAt: new Date(),
    })
  }

  /** 机器人发言：同时把这个群标记为活跃并建 meta，心跳从下一轮开始归档 */
  recordBot(session: GroupRecorderSession, content: string): void {
    if (!this.config.enabled) return
    if (!isGroupSession(session)) return
    const channelId = session.channelId
    if (!channelId) return
    const text = (content || '').trim()
    if (!text) return
    if (!this.qualified.has(channelId)) {
      this.qualified.add(channelId)
      void this.repo.touchMeta(groupScopeId(channelId))
      logger.info(`群聊记忆开始记录 channel=${channelId}`)
    }
    this.push(channelId, {
      scopeId: groupScopeId(channelId),
      userId: session.selfId || '',
      username: '',
      kind: GROUP_BOT_KIND,
      userContent: text,
      aiContent: '',
      createdAt: new Date(),
    })
  }

  private push(channelId: string, row: Omit<SatDialogue, 'id'>): void {
    const list = this.buffers.get(channelId) || []
    list.push(row)
    this.buffers.set(channelId, list)
    if (list.length >= Math.max(1, this.config.maxBuffer ?? 50)) this.flush(channelId)
  }

  private flush(channelId: string): void {
    const rows = this.buffers.get(channelId)
    if (!rows?.length) return
    this.buffers.set(channelId, [])
    const previous = this.pending.get(channelId) || Promise.resolve()
    const task = previous
      .then(() => this.repo.createDialogueBatch(rows))
      .catch((error) => {
        logger.warn(`写入群聊消息失败 channel=${channelId}: ${error}`)
      })
    this.pending.set(channelId, task)
  }

  flushAll(): void {
    for (const channelId of [...this.buffers.keys()]) this.flush(channelId)
  }
}

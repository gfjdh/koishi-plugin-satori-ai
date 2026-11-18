// src/memory/heartbeat.ts
// 定时汇总。替代参考实现的 node-cron（每分钟、无防重入、多用户成本失控）。
import { Context, Logger } from 'koishi'
import { MemoryRepository } from './repository'
import { Summarizer } from './summarizer'
import { GROUP_RETENTION_DAYS } from './group'

const logger = new Logger('satori-heartbeat')

export interface HeartbeatConfig {
  intervalMinutes: number
  maxScopesPerTick: number
  /** 同时处理的 scope 数。单个 scope 内部仍严格串行（游标与层级顺序不能乱），
   * 但不同 scope 互不影响；这是补齐历史积压时唯一有效的提速维度。 */
  concurrency: number
  activeWindowDays: number
  retentionDays: number
}

export class Heartbeat {
  private running = false
  private cursor = 0
  private disposers: (() => void)[] = []

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private summarizer: Summarizer,
    private config: HeartbeatConfig,
  ) {}

  start(): void {
    const interval = Math.max(1, this.config.intervalMinutes) * 60_000
    // 启动后稍等再跑第一次，避免和插件初始化抢资源
    this.disposers.push(this.ctx.setTimeout(() => void this.tick(), 30_000))
    this.disposers.push(this.ctx.setInterval(() => void this.tick(), interval))
    logger.info(`分层记忆心跳已启动：每 ${this.config.intervalMinutes} 分钟，`
      + `每次最多 ${this.config.maxScopesPerTick} 个 scope，并发 ${this.config.concurrency}`)
  }

  stop(): void {
    for (const dispose of this.disposers) {
      try { dispose() } catch { /* ignore */ }
    }
    this.disposers = []
  }

  async tick(): Promise<void> {
    if (this.running) {
      logger.debug('上一次心跳尚未结束，跳过本次')
      return
    }
    this.running = true

    try {
      const since = new Date(Date.now() - this.config.activeWindowDays * 86_400_000)
      // 取全部活跃 scope 再按游标轮转。候选集一旦按 lastActiveAt 截断，
      // 排在后面的 scope 就永远进不了批次；而 lastActiveAt 只在汇总时刷新，
      // 掉出去之后再也不会回来（2026-11-17 生产上 187 个活跃 scope、上限 180，
      // 有群积压 1448 条消息 22 小时没被归档）。
      const candidates = await this.repo.getActiveMetas(since)

      if (candidates.length) {
        const start = this.cursor % candidates.length
        const ordered = [...candidates.slice(start), ...candidates.slice(0, start)]
        const batch = ordered.slice(0, this.config.maxScopesPerTick)
        this.cursor = (start + batch.length) % candidates.length

        await this.runBatch(batch)
      }
      // 0 = 永久保留：不清理原始对话，累计统计与召回才能覆盖完整历史
      if (this.config.retentionDays > 0) {
        const before = new Date(Date.now() - this.config.retentionDays * 86_400_000)
        const pruned = await this.repo.pruneDialogues(before)
        if (pruned) logger.info(`已清理 ${pruned} 条超过 ${this.config.retentionDays} 天的对话`)
      }
      // 群聊原始消息只是归档素材，保留期远短于按人对话
      const groupBefore = new Date(Date.now() - GROUP_RETENTION_DAYS * 86_400_000)
      const prunedGroups = await this.repo.pruneGroupDialogues(groupBefore)
      if (prunedGroups) logger.info(`已清理 ${prunedGroups} 条超过 ${GROUP_RETENTION_DAYS} 天的群聊消息`)
    } catch (error) {
      logger.error(`心跳执行失败：${error}`)
    } finally {
      this.running = false
    }
  }

  /**
   * 以固定并发消费 batch。每个 scope 内部仍是一条串行链路：
   * 归档必须按游标顺序推进，层级也依赖上一层结果，不能并发。
   * 并发只发生在 scope 之间，可以安全地放大到 10 倍左右。
   */
  private async runBatch(batch: { scopeId: string }[]): Promise<void> {
    const limit = Math.max(1, Math.min(this.config.concurrency, batch.length))
    let next = 0
    let failed = 0
    await Promise.all(Array.from({ length: limit }, async () => {
      while (next < batch.length) {
        const meta = batch[next++]
        try {
          await this.summarizer.summarizeScope(meta.scopeId)
        } catch (error) {
          failed++
          logger.error(`scope=${meta.scopeId} 汇总失败：${error}`)
        }
      }
    }))
    if (failed) logger.warn(`本轮有 ${failed} 个 scope 汇总失败，将在后续心跳重试`)
  }
}

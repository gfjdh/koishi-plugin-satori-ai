// src/memory/summarizer.ts
// 话题归档 + 分层汇总（topic -> day -> week -> month -> season -> year）。
import { Context, Logger } from 'koishi'
import { APIClient } from '../api'
import { User } from '../types'
import { MemoryRepository } from './repository'
import { Granularity, SatMemory } from './schema'
import { parseLlmJson } from './json'
import { buildSummaryPrompt, buildTopicArchivePrompt, buildTopicSwitchPrompt, ArchiveResult, SummaryResult } from './prompts'
import { ProfileManager } from './profile'
import { lastBoundary } from './retrieval'

const logger = new Logger('satori-summary')

export const TOPIC_MIN_TURNS = 5
export const TOPIC_MAX_TURNS = 20
export const TOPIC_MAX_AGE_HOURS = 24
export const MAX_ARCHIVE_DIALOGUES = 200
export const MAX_CHILDREN_PER_SUMMARY = 100

const LEVEL_DAYS: Record<string, number> = {
  day: 1,
  week: 7,
  month: 28,
  season: 90,
  year: 365,
}

const LEVEL_ORDER = ['day', 'week', 'month', 'season', 'year'] as const
type Level = typeof LEVEL_ORDER[number]

const CHILD_OF: Record<Level, Granularity> = {
  day: 'topic',
  week: 'day',
  month: 'week',
  season: 'month',
  year: 'season',
}

export interface SummarizerConfig {
  dryRun: boolean
  topicSwitchCheck: boolean
  timezoneOffset: number
  dayBoundaryHour: number
  /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
  resolveUser?: (scopeId: string) => Promise<User | null>
}

export function formatTime(date: Date, timezoneOffsetHours: number): string {
  const shifted = new Date(new Date(date).getTime() + timezoneOffsetHours * 3_600_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

export class Summarizer {
  /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
  private busy = new Set<string>()

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private api: APIClient,
    private profile: ProfileManager,
    private config: SummarizerConfig,
  ) {}

  // ---------- 话题 ----------

  /**
   * 每轮对话后调用：必要时归档当前话题。
   * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
   */
  async maybeSwitchTopic(scopeId: string): Promise<void> {
    if (!this.config.topicSwitchCheck) return
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId)
      const meta = await this.repo.ensureMeta(scopeId)
      const dialogues = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: ['turn', 'legacy'],
        // 只需要判断是否达到阈值，不把迁移后的全部历史读进内存
        limit: TOPIC_MAX_TURNS,
      })
      if (dialogues.length <= TOPIC_MIN_TURNS) return

      let shouldSwitch = dialogues.length >= TOPIC_MAX_TURNS
      if (!shouldSwitch) {
        const text = this.formatDialogues(dialogues)
        const result = await this.api.auxiliaryChat(
          buildTopicSwitchPrompt(text, formatTime(meta.topicStart, this.config.timezoneOffset)),
          user,
        )
        if (result.error) return
        const answer = (result.content || '').replace(/[\s。，,.!！?？]/g, '')
        shouldSwitch = answer.startsWith('是')
      }

      if (shouldSwitch) await this.archiveTopicLocked(scopeId, user)
    })
  }

  /** 兜底：话题持续时间过长时强制归档一次，否则金字塔会断在 topic 级 */
  private async archiveStaleTopic(scopeId: string, user: User | null): Promise<void> {
    const meta = await this.repo.ensureMeta(scopeId)
    const ageHours = (Date.now() - new Date(meta.topicStart).getTime()) / 3_600_000
    if (ageHours < TOPIC_MAX_AGE_HOURS) return
    const dialogues = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
      kinds: ['turn', 'legacy'],
      limit: 1,
    })
    if (!dialogues.length) return
    await this.archiveTopicLocked(scopeId, user)
  }

  /** 把 [topicStart, 末尾] 的对话归档为一条 topic 记忆。调用方需持有 busy 锁。 */
  private async archiveTopicLocked(scopeId: string, user: User | null): Promise<void> {
    const meta = await this.repo.ensureMeta(scopeId)
    const dialogues = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
      kinds: ['turn', 'legacy'],
      limit: MAX_ARCHIVE_DIALOGUES,
    })
    if (!dialogues.length) return

    const text = this.formatDialogues(dialogues)
    if (this.config.dryRun) {
      logger.info(`[dry-run] topic 归档 scope=${scopeId} 对话=${dialogues.length} 字符=${text.length}`)
      return
    }

    const result = await this.api.auxiliaryChat(buildTopicArchivePrompt(text), user)
    if (result.error) {
      logger.warn(`topic 归档失败 scope=${scopeId}: ${result.content}`)
      return
    }

    const parsed = parseLlmJson<ArchiveResult>(result.content)
    const summary = parsed?.summary?.trim()
    if (!summary) {
      logger.warn(`topic 归档解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return
    }

    const periodStart = dialogues[0].createdAt
    const last = dialogues[dialogues.length - 1]
    // 记忆与游标一次写入：只推进到本批对话的末尾，不跳到 now，
    // 避免丢掉归档期间新到的消息
    await this.repo.commitTopicArchive({
      scopeId,
      granularity: 'topic',
      topic: (parsed.topic || '').trim(),
      content: summary,
      userState: (parsed.user_state || '').trim(),
      periodStart,
      periodEnd: last.createdAt,
      sourceCount: dialogues.length,
      createdAt: new Date(),
    }, scopeId, new Date(last.createdAt))

    const remaining = await this.repo.countDialoguesAfter(scopeId, new Date(last.createdAt))
    logger.info(`topic 归档完成 scope=${scopeId} 对话=${dialogues.length}${remaining ? ` 剩余${remaining}条待处理` : ''}`)
  }

  // ---------- 分层汇总 ----------

  async summarizeScope(scopeId: string): Promise<void> {
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId)
      await this.repo.touchMeta(scopeId)
      await this.archiveStaleTopic(scopeId, user)
      for (const level of LEVEL_ORDER) {
        await this.summarizeLevel(scopeId, level, user)
      }
    })
  }

  private async summarizeLevel(scopeId: string, level: Level, user: User | null): Promise<void> {
    const now = new Date()
    const cutoff = level === 'day'
      ? lastBoundary(now, this.config.timezoneOffset, this.config.dayBoundaryHour)
      : new Date(now.getTime() - LEVEL_DAYS[level] * 86_400_000)

    const parent = await this.repo.getLatestMemory(scopeId, level)
    const from = parent ? new Date(parent.periodEnd) : null

    const children = (await this.repo.getMemoriesInRange(
      scopeId, CHILD_OF[level], from, cutoff,
    )).slice(0, MAX_CHILDREN_PER_SUMMARY)

    if (!children.length) return

    const text = this.formatChildren(children)
    if (this.config.dryRun) {
      logger.info(`[dry-run] ${level} 汇总 scope=${scopeId} 子记忆=${children.length} 字符=${text.length}`
        + ` 区间=${formatTime(children[0].periodStart, this.config.timezoneOffset)}`
        + `~${formatTime(children[children.length - 1].periodEnd, this.config.timezoneOffset)}`)
      return
    }

    const result = await this.api.auxiliaryChat(buildSummaryPrompt(level, text), user)
    if (result.error) {
      logger.warn(`${level} 汇总失败 scope=${scopeId}: ${result.content}`)
      return
    }

    const parsed = parseLlmJson<SummaryResult>(result.content)
    const summary = parsed?.summary?.trim()
    if (!summary) {
      logger.warn(`${level} 汇总解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return
    }

    const first = children[0]
    const last = children[children.length - 1]
    await this.repo.createMemory({
      scopeId,
      granularity: level,
      topic: '',
      content: summary,
      userState: (parsed.user_state || '').trim(),
      periodStart: new Date(first.periodStart),
      periodEnd: new Date(last.periodEnd),
      sourceCount: children.length,
      createdAt: new Date(),
    })

    logger.info(`${level} 汇总完成 scope=${scopeId} 子记忆=${children.length}`)

    // 日总结完成后顺带更新画像
    if (level === 'day') {
      await this.profile.summarize(scopeId, summary, children, user)
    }
  }

  // ---------- 工具 ----------

  private formatDialogues(rows: { userContent: string; aiContent: string; username: string; createdAt: Date }[]): string {
    return rows.map((row) => {
      const time = formatTime(row.createdAt, this.config.timezoneOffset)
      const user = row.username || '用户'
      const ai = row.aiContent && row.aiContent !== '…' ? `\nAI：${row.aiContent}` : ''
      return `[${time}] ${user}：${row.userContent}${ai}`
    }).join('\n')
  }

  private formatChildren(children: SatMemory[]): string {
    return children.map((child) => {
      const range = `${formatTime(child.periodStart, this.config.timezoneOffset)}`
        + ` ~ ${formatTime(child.periodEnd, this.config.timezoneOffset)}`
      const topic = child.topic ? `（${child.topic}）` : ''
      const state = child.userState ? `\n用户状态：${child.userState}` : ''
      return `[${range}]${topic} ${child.content}${state}`
    }).join('\n\n')
  }

  /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
  private async lookupUser(scopeId: string): Promise<User | null> {
    if (!this.config.resolveUser) return null
    try {
      return await this.config.resolveUser(scopeId)
    } catch (error) {
      logger.warn(`查询用户失败 scope=${scopeId}: ${error}`)
      return null
    }
  }

  private async runExclusive(scopeId: string, task: () => Promise<void>): Promise<void> {
    if (this.busy.has(scopeId)) {
      logger.debug(`scope=${scopeId} 已有汇总任务在运行，跳过本次`)
      return
    }
    this.busy.add(scopeId)
    try {
      await task()
    } catch (error) {
      logger.error(`汇总任务失败 scope=${scopeId}: ${error}`)
    } finally {
      this.busy.delete(scopeId)
    }
  }
}

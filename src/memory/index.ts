// src/memory/index.ts
// 记忆系统门面。src/index.tsx 只依赖这个文件。
import { Context, Logger, Session } from 'koishi'
import { APIClient } from '../api'
import { getUser } from '../database'
import { MemoryConfig } from '../types'
import { ContextBuilder, PromptContext } from './context'
import { Heartbeat } from './heartbeat'
import { Migrator } from './migrate'
import { ProfileManager } from './profile'
import { MemoryRepository } from './repository'
import { extendMemoryDatabase, Granularity } from './schema'
import { ShortTermMemory } from './short-term'
import { Summarizer, formatTime } from './summarizer'

const logger = new Logger('satori-memory')

export interface MemoryServiceConfig extends MemoryConfig {
  enable_layered_memory: boolean
  memory_timezone_offset: number
  memory_day_boundary_hour: number
  topic_switch_check: boolean
  summary_heartbeat_minutes: number
  summary_dry_run: boolean
  summary_max_scopes_per_tick: number
  summary_max_calls_per_tick: number
  memory_active_window_days: number
  memory_retention_days: number
  memory_context_max_chars: number
  memory_recall_topN: number
  profile_enabled: boolean
  profile_max_entries: number
  profile_context_entries: number
}

export interface TurnResponse {
  content: string
  error: boolean
}

export class MemoryService {
  private repo: MemoryRepository
  private shortTerm: ShortTermMemory
  private profile: ProfileManager
  private summarizer: Summarizer
  private contextBuilder: ContextBuilder
  private heartbeat: Heartbeat
  private migrator: Migrator

  constructor(
    private ctx: Context,
    private config: MemoryServiceConfig,
    api: APIClient,
  ) {
    extendMemoryDatabase(ctx)

    this.repo = new MemoryRepository(ctx)
    this.shortTerm = new ShortTermMemory(ctx)
    this.profile = new ProfileManager(ctx, this.repo, api, {
      enabled: config.profile_enabled,
      dryRun: config.summary_dry_run,
      maxEntries: config.profile_max_entries,
      contextEntries: config.profile_context_entries,
    })
    // 按人记忆时 scopeId 就是 userId；群级记忆无法唯一定位用户，保持默认辅助模型
    const resolveUser = config.personal_memory
      ? (scopeId: string) => getUser(ctx, scopeId)
      : undefined
    this.summarizer = new Summarizer(ctx, this.repo, api, this.profile, {
      dryRun: config.summary_dry_run,
      topicSwitchCheck: config.topic_switch_check,
      timezoneOffset: config.memory_timezone_offset,
      dayBoundaryHour: config.memory_day_boundary_hour,
      maxCallsPerTick: config.summary_max_calls_per_tick,
      resolveUser,
    })
    this.contextBuilder = new ContextBuilder(this.repo, this.shortTerm, this.profile, {
      enabled: config.enable_layered_memory,
      commonTopN: config.common_topN,
      dialogueTopN: config.dailogues_topN,
      recallTopN: config.memory_recall_topN,
      retentionDays: config.memory_retention_days,
      contextMaxChars: config.memory_context_max_chars,
      timezoneOffset: config.memory_timezone_offset,
      memoryConfig: config,
    })
    this.heartbeat = new Heartbeat(ctx, this.repo, this.summarizer, {
      intervalMinutes: config.summary_heartbeat_minutes,
      maxScopesPerTick: config.summary_max_scopes_per_tick,
      activeWindowDays: config.memory_active_window_days,
      retentionDays: config.memory_retention_days,
    })
    this.migrator = new Migrator(
      ctx, this.repo, config.dataDir, config.personal_memory, config.memory_timezone_offset,
    )
  }

  start(): void {
    if (!this.config.enable_layered_memory) {
      logger.info('分层记忆已关闭：仅保留短期记忆与知识库，不落库、不汇总')
      return
    }
    this.heartbeat.start()
  }

  stop(): void {
    this.heartbeat.stop()
  }

  // ---------- 作用域 ----------

  getScopeId(session: { userId?: string; channelId?: string }): string {
    return this.config.personal_memory
      ? (session.userId || session.channelId)
      : (session.channelId || session.userId)
  }

  // ---------- 短期记忆 ----------

  getChannelMemory(channelId: string) {
    return this.shortTerm.getChannelMemory(channelId)
  }

  getChannelContext(channelId: string) {
    return this.shortTerm.getChannelContext(channelId)
  }

  getChannelDialogue(session: Session): string {
    return this.shortTerm.getChannelDialogue(session, this.config)
  }

  updateChannelDialogue(session: Session, prompt: string, name: string): void {
    this.shortTerm.updateChannelDialogue(session, prompt, name, this.config)
  }

  clearChannelMemory(channelId: string): void {
    this.shortTerm.clearChannelMemory(channelId)
  }

  clearChannelDialogue(channelId: string): void {
    this.shortTerm.clearChannelDialogue(channelId)
  }

  clearAllMemories(): void {
    this.shortTerm.clearAll()
  }

  // ---------- 每轮对话 ----------

  async recordTurn(session: Session, prompt: string, response: TurnResponse): Promise<void> {
    if (response?.error) return

    const scopeId = this.getScopeId(session)
    // 短期记忆始终维护（包括关闭分层记忆时）
    this.shortTerm.updateChannelMemory(session, prompt, this.config, response?.content, scopeId)

    if (!this.config.enable_layered_memory) return
    if (this.isBlocked(prompt)) return

    const now = new Date()
    try {
      await this.repo.createDialogue({
        scopeId,
        userId: session.userId,
        username: session.username || '',
        kind: 'turn',
        userContent: prompt,
        aiContent: response?.content || '',
        createdAt: now,
      })
      await this.repo.touchMeta(scopeId, now)
    } catch (error) {
      logger.warn(`写入对话失败 scope=${scopeId}: ${error}`)
      return
    }

    // 不阻塞回复：话题切换判断放到后台
    void this.summarizer.maybeSwitchTopic(scopeId)
  }

  private isBlocked(content: string): boolean {
    if (!content) return false
    return this.config.memory_block_words.some(word => word && content.includes(word))
  }

  // ---------- 系统提示 ----------

  async getPromptContext(session: Session, query: string): Promise<PromptContext> {
    return this.contextBuilder.build(session, query)
  }

  // ---------- 知识 ----------

  async addCommonSense(content: string): Promise<void> {
    await this.repo.addKnowledgeIfAbsent('common', '*', content)
  }

  async addGroupCommonSense(content: string, channelId: string): Promise<void> {
    await this.repo.addKnowledgeIfAbsent('group', channelId, content)
  }

  // ---------- 画像 ----------

  async hasProfile(scopeId: string): Promise<boolean> {
    return this.profile.has(scopeId)
  }

  async getProfileById(scopeId: string): Promise<string> {
    return this.profile.formatById(scopeId)
  }

  // ---------- 迁移与运维 ----------

  async migrate(force = false) {
    return this.migrator.migrate(force)
  }

  async clearPersistent(scopeId?: string): Promise<void> {
    if (scopeId) await this.repo.clearScope(scopeId)
    else await this.repo.clearAll()
  }

  async view(scopeId: string): Promise<string> {
    const dialogueCount = await this.repo.countDialogues(scopeId)
    const memories = await this.repo.listMemories(scopeId, 20)
    const profile = await this.repo.getProfile(scopeId)
    const entries = profile?.data?.entries || []

    const lines: string[] = []
    lines.push(`作用域：${scopeId}`)
    lines.push(`原始对话：${dialogueCount} 条`)
    lines.push(`分层记忆：${memories.length} 条`)

    for (const memory of memories) {
      const range = `${formatTime(memory.periodStart, this.config.memory_timezone_offset)}`
        + ` ~ ${formatTime(memory.periodEnd, this.config.memory_timezone_offset)}`
      const topic = memory.topic ? `【${memory.topic}】` : ''
      lines.push(`  [${memory.granularity}] ${range} ${topic}${memory.content}`)
    }

    lines.push(`画像条目：${entries.length} 条`)
    for (const entry of entries.slice(0, 20)) {
      lines.push(`  - [${entry.category}] ${entry.content}`)
    }

    return lines.join('\n')
  }
}

export type { PromptContext }

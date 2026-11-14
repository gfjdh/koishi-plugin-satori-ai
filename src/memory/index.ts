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
import { extendMemoryDatabase } from './schema'
import { ShortTermMemory } from './short-term'
import { Summarizer } from './summarizer'
import { GroupRecorder } from './group-recorder'
import { GROUP_KINDS, groupScopeId, isGroupScope } from './group'
import {
  DIGEST_MAX_RAW_MESSAGES, clampDigest, formatDigestMaterials, selectDigestNodes,
} from './group-digest'
import { formatTime } from './summarizer'
import {
  GROUP_CATEGORY_LABELS, GROUP_CATEGORY_ORDER, buildGroupDigestPrompt, buildGroupProfilePrompt,
} from './prompts'

const logger = new Logger('satori-memory')

export interface MemoryServiceConfig extends MemoryConfig {
  enable_layered_memory: boolean
  /** 短期记忆空闲多久后清空（分钟），0 = 关闭 */
  short_term_ttl_minutes: number
  short_term_sweep_minutes: number
  memory_timezone_offset: number
  memory_day_boundary_hour: number
  /** 昵称列表：归档时从用户发言里抹掉，避免昵称被当成发言人 */
  nick_name_list: string[]
  /** 是否启用群聊记忆（按群建立独立的时间块金字塔，与按人记忆并存） */
  enable_group_memory: boolean
  topic_switch_check: boolean
  summary_heartbeat_minutes: number
  summary_dry_run: boolean
  summary_max_scopes_per_tick: number
  summary_max_calls_per_tick: number
  /** 同时处理的 scope 数；单 scope 内部仍串行 */
  summary_concurrency: number
  memory_active_window_days: number
  memory_retention_days: number
  memory_recall_topN: number
  dialogue_stats_enabled: boolean
  profile_enabled: boolean
  profile_max_entries: number
  profile_context_entries: number
  profile_update_window_days: number
}

export interface TurnResponse {
  content: string
  error: boolean
}

/** 群聊「省流」的结果 */
export interface GroupDigest {
  summary: string
  range: string
  nodeCount: number
  messageCount: number
}

export class MemoryService {
  private repo: MemoryRepository
  private shortTerm: ShortTermMemory
  private profile: ProfileManager
  private groupProfile: ProfileManager
  private groupRecorder: GroupRecorder
  private summarizer: Summarizer
  private contextBuilder: ContextBuilder
  private heartbeat: Heartbeat
  private migrator: Migrator
  private sweepDisposers: (() => void)[] = []

  constructor(
    private ctx: Context,
    private config: MemoryServiceConfig,
    private api: APIClient,
  ) {
    extendMemoryDatabase(ctx)

    this.repo = new MemoryRepository(ctx)
    this.shortTerm = new ShortTermMemory(ctx, {
      ttlMs: Math.max(0, config.short_term_ttl_minutes) * 60_000,
    })
    this.profile = new ProfileManager(ctx, this.repo, api, {
      enabled: config.profile_enabled,
      dryRun: config.summary_dry_run,
      maxEntries: config.profile_max_entries,
      contextEntries: config.profile_context_entries,
      updateWindowDays: config.profile_update_window_days,
    })
    // 群画像与个人画像走同一套增量合并，只是提示词、类别和标题不同
    this.groupProfile = new ProfileManager(ctx, this.repo, api, {
      enabled: config.enable_group_memory && config.profile_enabled,
      dryRun: config.summary_dry_run,
      maxEntries: config.profile_max_entries,
      contextEntries: config.profile_context_entries,
      updateWindowDays: config.profile_update_window_days,
      buildPrompt: buildGroupProfilePrompt,
      categoryLabels: GROUP_CATEGORY_LABELS,
      categoryOrder: GROUP_CATEGORY_ORDER,
      contextTitle: '以下是这个群的补充信息：',
      subjectLabel: '群',
      stateLabel: '群状态',
    })
    this.groupRecorder = new GroupRecorder(ctx, this.repo, {
      enabled: config.enable_group_memory,
      activeWindowDays: config.memory_active_window_days,
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
      nickNames: config.nick_name_list,
      maxCallsPerTick: config.summary_max_calls_per_tick,
      resolveUser,
      groupProfile: this.groupProfile,
    })
    this.contextBuilder = new ContextBuilder(this.repo, this.shortTerm, this.profile, {
      enabled: config.enable_layered_memory,
      commonTopN: config.common_topN,
      dialogueTopN: config.dailogues_topN,
      recallTopN: config.memory_recall_topN,
      retentionDays: config.memory_retention_days,
      timezoneOffset: config.memory_timezone_offset,
      dayBoundaryHour: config.memory_day_boundary_hour,
      dialogueStatsEnabled: config.dialogue_stats_enabled,
      memoryConfig: config,
      groupEnabled: config.enable_group_memory,
    }, this.groupProfile)
    this.heartbeat = new Heartbeat(ctx, this.repo, this.summarizer, {
      intervalMinutes: config.summary_heartbeat_minutes,
      maxScopesPerTick: config.summary_max_scopes_per_tick,
      concurrency: config.summary_concurrency,
      activeWindowDays: config.memory_active_window_days,
      retentionDays: config.memory_retention_days,
    })
    this.migrator = new Migrator(
      ctx, this.repo, config.dataDir, config.personal_memory, config.memory_timezone_offset,
    )
  }

  start(): void {
    // 短期记忆 TTL 与分层记忆无关，关闭分层记忆时同样生效
    this.startShortTermSweep()
    if (!this.config.enable_layered_memory) {
      logger.info('分层记忆已关闭：仅保留短期记忆与知识库，不落库、不汇总')
      return
    }
    this.groupRecorder.start()
    this.heartbeat.start()
  }

  stop(): void {
    for (const dispose of this.sweepDisposers) {
      try { dispose() } catch { /* ignore */ }
    }
    this.sweepDisposers = []
    this.groupRecorder.stop()
    this.heartbeat.stop()
  }

  private startShortTermSweep(): void {
    const ttlMinutes = Math.max(0, this.config.short_term_ttl_minutes)
    if (ttlMinutes <= 0) {
      logger.info('短期记忆 TTL 已关闭：对话记忆不会按时自动清空')
      return
    }
    const sweepMinutes = Math.max(1, this.config.short_term_sweep_minutes)
    this.sweepDisposers.push(this.ctx.setInterval(() => {
      const removed = this.shortTerm.sweep()
      if (removed) logger.info(`短期记忆已清理 ${removed} 个空闲超过 ${ttlMinutes} 分钟的作用域（剩余 ${this.shortTerm.getScopeCount()}）`)
    }, sweepMinutes * 60_000))
    logger.info(`短期记忆 TTL 已启用：空闲 ${ttlMinutes} 分钟清空，每 ${sweepMinutes} 分钟扫描一次`)
  }

  // ---------- 作用域 ----------

  getScopeId(session: { userId?: string; channelId?: string }): string {
    return this.config.personal_memory
      ? (session.userId || session.channelId)
      : (session.channelId || session.userId)
  }

  /** 群记忆的 scopeId；命令与运维查看用 */
  getGroupScopeId(channelId: string): string {
    return groupScopeId(channelId)
  }

  /**
   * 查看记忆时的 scope 解析：先按群号匹配（`sat_meta` 里有 `g:<id>` 才算群），
   * 匹配不到再当成用户 id。这样不用非要在对应的群里执行指令。
   */
  async resolveViewScope(input: string): Promise<string> {
    const value = (input || '').trim()
    if (!value) return value
    if (isGroupScope(value)) return value
    if (await this.repo.getMeta(groupScopeId(value))) return groupScopeId(value)
    return value
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

    // 群聊记忆：机器人自己的发言也进群 scope，群聊记录才是完整的
    if (response?.content) this.groupRecorder.recordBot(session, response.content)

    // 不阻塞回复：话题切换判断放到后台
    void this.summarizer.maybeSwitchTopic(scopeId)
  }

  private isBlocked(content: string): boolean {
    if (!content) return false
    return this.config.memory_block_words.some(word => word && content.includes(word))
  }

  /** 主动消息只进短期记忆，不写 sat_dialogue，避免污染对话统计与长期归档 */
  recordProactive(session: Session, content: string): void {
    this.shortTerm.recordAssistant(session, content, this.config, this.getScopeId(session))
  }

  /** 群友发言进群聊记忆缓冲（只对机器人参与过的群生效） */
  recordGroupMessage(session: Session, content: string): void {
    this.groupRecorder.record(session, content)
  }

  // ---------- 群聊省流 ----------

  /**
   * 汇总「用户上次在本群发言到现在」的群记忆。
   *
   * 选材粗粒度优先：年 → 季 → 月 → 周 → 日 → 话题。每取完一级就把游标
   * 推到该级最后一个节点的末尾，下一级只补最近的空档，因此同一时段不会
   * 同时出现粗、细两份。最早那个节点可以起点早于用户上次发言——粗粒度
   * 记忆本来就是整段整段的。最后剩下还没归档的消息直接给原文。
   *
   * 从没在本群说过话时按最近 24 小时算。
   */
  async buildGroupDigest(session: Session): Promise<GroupDigest | null> {
    const channelId = session.channelId
    if (!channelId) return null
    const scopeId = groupScopeId(channelId)
    const now = new Date()
    const last = await this.repo.getLastDialogueByUser(scopeId, session.userId, GROUP_KINDS)
    const from = last || new Date(now.getTime() - 24 * 3_600_000)

    const { nodes, cursor } = await selectDigestNodes(
      from,
      now,
      (level, after, to) => this.repo.getMemoriesInRange(scopeId, level, after, to),
    )

    const raw = await this.repo.getDialoguesAfter(scopeId, cursor, {
      kinds: GROUP_KINDS,
      limit: DIGEST_MAX_RAW_MESSAGES,
    })
    if (!nodes.length && !raw.length) return null

    const tz = this.config.memory_timezone_offset
    const range = `${formatTime(from, tz)} ~ ${formatTime(now, tz)}`
    const materials = formatDigestMaterials(nodes, raw, tz)
    const result = await this.api.auxiliaryChat(buildGroupDigestPrompt(materials, range), null)
    if (result.error) {
      logger.warn(`省流失败 scope=${scopeId}: ${result.content}`)
      return null
    }

    const summary = clampDigest(result.content || '')
    if (!summary) return null
    return { summary, range, nodeCount: nodes.length, messageCount: raw.length }
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
    return isGroupScope(scopeId)
      ? this.groupProfile.formatById(scopeId)
      : this.profile.formatById(scopeId)
  }

  // ---------- 迁移与运维 ----------

  async migrate(force = false) {
    return this.migrator.migrate(force)
  }

  async clearPersistent(scopeId?: string): Promise<void> {
    if (scopeId) await this.repo.clearScope(scopeId)
    else await this.repo.clearAll()
  }

  /** 与注入系统提示的分层记忆段落完全相同 */
  async view(scopeId: string): Promise<string> {
    const content = await this.contextBuilder.buildMemoryView(scopeId)
    return content || '该作用域暂无分层记忆。'
  }
}

export type { PromptContext }

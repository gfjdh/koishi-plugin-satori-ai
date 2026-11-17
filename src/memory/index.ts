// src/memory/index.ts
// 记忆系统门面。src/index.tsx 只依赖这个文件。
import { Context, Logger, Session } from 'koishi'
import { APIClient } from '../api'
import { getUser } from '../database'
import { MemoryConfig } from '../types'
import { ContextBuilder, PromptBuildOptions, PromptContext } from './context'
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
  DigestParticipant, DigestRange, digestRangeStart, formatDigestMaterials,
  hasDigestRange, resolvePeriodOfKind, resolveReportPeriod, selectDigestNodes,
} from './group-digest'
import { GROUP_REPORT_SPECS, GroupReportKind, GroupReportSpec } from './report-specs'
import { formatTime } from './summarizer'
import {
  GROUP_CATEGORY_LABELS, GROUP_CATEGORY_ORDER, buildGroupProfilePrompt,
} from './prompts'

const logger = new Logger('satori-memory')

/** 本地日期键（按零点切分），用于判断报告是否已经在同一天奖励过 */
function localDateKey(date: Date, timezoneOffset: number): string {
  const local = new Date(date.getTime() + timezoneOffset * 3_600_000)
  return `${local.getUTCFullYear()}-${local.getUTCMonth()}-${local.getUTCDate()}`
}

export interface MemoryServiceConfig extends MemoryConfig {
  enable_layered_memory: boolean
  /** 短期记忆空闲多久后清空（分钟），0 = 关闭 */
  short_term_ttl_minutes: number
  short_term_sweep_minutes: number
  memory_timezone_offset: number
  memory_day_boundary_hour: number
  /** 昵称列表：归档时从用户发言里抹掉，避免昵称被当成发言人 */
  nick_name_list: string[]
  /** 机器人名字（昵称列表第一个）：记忆提示词与归档标签里的自称 */
  bot_name: string
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

/** 群聊「省流」的选材结果。生成由调用方走正常对话链路 */
export interface GroupDigestContext {
  materials: string
  range: string
  nodeCount: number
  messageCount: number
}

/** 群聊日报/周报/月报/年报的选材结果 */
export interface GroupReportContext extends GroupDigestContext {
  /** 本期发言的群友，按条数降序（活跃榜用） */
  participants: DigestParticipant[]
  /** 去掉上一期最喜欢之后的候选列表（模型选人用） */
  favoriteCandidates: DigestParticipant[]
  /** 区间内群友的发言总条数（报头数据条用；messageCount 只是未归档原文条数） */
  totalMessages: number
  /** 最近 24 小时每小时消息数，索引 0-23（报头活跃轨迹） */
  hourly: number[]
  /** 本次报告的期号 */
  issue: number
  /** 本次报告的生成时刻 */
  now: Date
  /** 报告覆盖的终点；成功后写入日报游标，下一天从这里继续 */
  to: Date
  /** 当前记忆日还没出过报告时为 true：只有第一份报告能给「最喜欢」加好感度 */
  allowFavorite: boolean
  /** 上一份报告选中的群友；本期候选列表已排除此人 */
  previousFavorite: { userId: string, username: string } | null
  kind: GroupReportKind
  spec: GroupReportSpec
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
      botName: config.bot_name,
    })
    // 群画像与个人画像走同一套增量合并，只是提示词、类别和标题不同
    this.groupProfile = new ProfileManager(ctx, this.repo, api, {
      enabled: config.enable_group_memory && config.profile_enabled,
      dryRun: config.summary_dry_run,
      maxEntries: config.profile_max_entries,
      contextEntries: config.profile_context_entries,
      updateWindowDays: config.profile_update_window_days,
      botName: config.bot_name,
      buildPrompt: buildGroupProfilePrompt,
      categoryLabels: GROUP_CATEGORY_LABELS,
      categoryOrder: GROUP_CATEGORY_ORDER,
      // 群友条目的 key 是 "member:昵称"，只取 content 会把主语丢掉
      nameKeyCategories: ['member'],
      // 上次画像更新之后没有新的 topic 归档块时，不再发起画像调用
      requireNewMemoryOf: 'topic',
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
      botName: config.bot_name,
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

  getChannelDialogue(session: Session, options?: { excludeSelf?: boolean }): string {
    return this.shortTerm.getChannelDialogue(session, this.config, options)
  }

  updateChannelDialogue(session: Session, prompt: string, name: string, self = false): void {
    this.shortTerm.updateChannelDialogue(session, prompt, name, this.config, self)
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
  async buildGroupDigestContext(
    session: Session,
    range?: DigestRange,
  ): Promise<GroupDigestContext | null> {
    const channelId = session.channelId
    if (!channelId) return null
    const scopeId = groupScopeId(channelId)
    const now = new Date()

    // 给了 -d/-m/-y 就用「现在往前推 N」；否则从用户上次在本群发言算起
    let from: Date
    if (hasDigestRange(range)) {
      from = digestRangeStart(now, this.config.memory_timezone_offset, range)
    } else {
      const last = await this.repo.getLastDialogueByUser(scopeId, session.userId, GROUP_KINDS)
      from = last || new Date(now.getTime() - 24 * 3_600_000)
    }

    const { nodes, cursor } = await selectDigestNodes(
      from,
      now,
      (level, after, to) => this.repo.getMemoriesInRange(scopeId, level, after, to),
    )

    // 未归档原文全文召回，不设条数上限：省流要的就是这段时间里的全部内容
    const raw = await this.repo.getDialoguesAfter(scopeId, cursor, {
      kinds: GROUP_KINDS,
    })
    if (!nodes.length && !raw.length) return null

    const tz = this.config.memory_timezone_offset
    return {
      materials: formatDigestMaterials(nodes, raw, tz, { requesterId: session.userId }),
      range: `${formatTime(from, tz)} ~ ${formatTime(now, tz)}`,
      nodeCount: nodes.length,
      messageCount: raw.length,
    }
  }

  // ---------- 群聊日报/周报/月报/年报 ----------

  /**
   * 按执行时刻决定出日报还是周/月/年报，并选出材料。
   *
   * 自然周期（周/月/年）只取已闭合的时段，选材按各自的最高粒度往下补：
   * 周报 日→话题，月报 周→日→话题，年报 月→周→日→话题。日报仍从上次
   * 日报游标开始，没有游标时取最近 24 小时。
   */
  async buildGroupReportContext(
    session: Session,
    options: { kind?: GroupReportKind } = {},
  ): Promise<GroupReportContext | null> {
    const channelId = session.channelId
    if (!channelId) return null
    const scopeId = groupScopeId(channelId)
    const now = new Date()
    const tz = this.config.memory_timezone_offset
    const period = options.kind
      ? resolvePeriodOfKind(options.kind, now, tz)
      : resolveReportPeriod(now, tz)
    const spec = GROUP_REPORT_SPECS[period.kind]

    const last = await this.repo.getDailyDigestAt(scopeId)
    const from = period.kind === 'daily'
      ? (last || new Date(now.getTime() - 24 * 3_600_000))
      : period.from!

    const { nodes, cursor } = await selectDigestNodes(
      from,
      period.to,
      (level, after, to) => this.repo.getMemoriesInRange(scopeId, level, after, to),
      spec.levels,
    )

    // 多取一条用来判断是否被上限截断。截断时保留最近的若干条：
    // 报告要覆盖的是最近的空档，丢掉更早的积压比丢掉昨晚的发言合理。
    const fetched = await this.repo.getRecentDialoguesAfter(scopeId, cursor, {
      kinds: GROUP_KINDS,
      limit: spec.maxRawMessages + 1,
      before: period.to,
    })
    const truncated = fetched.length > spec.maxRawMessages
    // 查询是从新到旧，格式化需要从旧到新
    const raw = (truncated ? fetched.slice(0, spec.maxRawMessages) : fetched).reverse()
    if (!nodes.length && !raw.length) return null

    // 报告不标「提问者」：发起报告的人可能只是定时器用的账号，不是话题参与者
    let materials = formatDigestMaterials(nodes, raw, tz)
    if (truncated) {
      materials += `\n\n（未归档消息超过 ${spec.maxRawMessages} 条，更早的部分已省略）`
    }

    const participants = (await this.repo.getDialogueParticipants(scopeId, from, period.to, GROUP_KINDS))
      .filter(item => item.username)
    // 上一份报告选过的人，本期候选列表直接排除，避免模型重复选
    const previousFavorite = await this.repo.getLastFavorite(scopeId)
    const favoriteCandidates = previousFavorite
      ? participants.filter(item => item.userId !== previousFavorite.userId)
      : participants

    // 同一记忆日只奖励一次：同一天重复执行报告时只出正文
    const allowFavorite = !last || localDateKey(last, tz) !== localDateKey(now, tz)
    const issue = (await this.repo.getReportCount(scopeId)) + 1
    const totalMessages = participants.reduce((sum, item) => sum + item.count, 0)
    // 活跃轨迹固定看最近 24 小时，与报告类型无关
    const hourly = await this.repo.getHourlyMessageCounts(
      scopeId,
      new Date(now.getTime() - 24 * 3_600_000),
      now,
      tz,
      GROUP_KINDS,
    )

    return {
      materials,
      range: `${formatTime(from, tz)} ~ ${formatTime(period.to, tz)}`,
      nodeCount: nodes.length,
      messageCount: raw.length,
      participants,
      favoriteCandidates,
      totalMessages,
      hourly,
      issue,
      now,
      to: period.to,
      allowFavorite,
      previousFavorite,
      kind: period.kind,
      spec,
    }
  }

  /** 报告生成成功后推进日报游标：日报推到当前时刻，自然周期推到周期末尾 */
  async markDailyDigest(channelId: string, at: Date): Promise<void> {
    if (!channelId) return
    await this.repo.setDailyDigestAt(groupScopeId(channelId), at)
  }

  /** 记录本期的「最喜欢」，下一份报告不能再选同一个人 */
  async markFavorite(channelId: string, userId: string, username: string): Promise<void> {
    if (!channelId || !userId) return
    await this.repo.setLastFavorite(groupScopeId(channelId), userId, username)
  }

  /** 报告发出后记录期号，下一期的报头 +1 */
  async markReportIssued(channelId: string, issue: number): Promise<void> {
    if (!channelId || issue <= 0) return
    await this.repo.setReportCount(groupScopeId(channelId), issue)
  }

  // ---------- 系统提示 ----------

  async getPromptContext(
    session: Session,
    query: string,
    options?: PromptBuildOptions,
  ): Promise<PromptContext> {
    return this.contextBuilder.build(session, query, options)
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

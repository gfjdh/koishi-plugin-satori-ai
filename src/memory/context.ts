// src/memory/context.ts
// 组装注入系统提示的记忆片段：常识 / 群常识 / 群聊环境 / 分层金字塔 / 关键词召回 / 画像。
import { Logger, Session } from 'koishi'
import { getTimeOfDay } from '../utils'
import { MemoryRepository } from './repository'
import { ProfileManager } from './profile'
import { Granularity, SatKnowledge, SatMemory } from './schema'
import { rankDocuments, RetrievalDocument } from './retrieval'
import { ShortTermMemory } from './short-term'
import { buildDialogueStats } from './stats'
import { formatDay, formatTime, periodStart } from './summarizer'
import { groupScopeId, isGroupScope, isGroupSession } from './group'

const logger = new Logger('satori-recall')

/** 同一条记忆多少天内不重复提示 */
const RECALL_HINT_DAYS = 3

export interface PromptContext {
  common: string
  group: string
  ambient: string
  stats: string
  /** 每轮必变：由 index.tsx 拼在系统提示最末尾，避免它前面的内容无法命中前缀缓存 */
  datetime: string
  pyramid: string
  recalled: string
  /** 私聊主动消息的纯随机 day 记忆：建议模型以其为话题 */
  randomDayRecall: string
  profile: string
  /** 群聊记忆金字塔：与按人记忆并存，预算约为个人金字塔的一半 */
  groupPyramid: string
  /** 群画像：群特征、活跃群友、群友关系等 */
  groupProfile: string
}

export interface ContextConfig {
  enabled: boolean
  commonTopN: number
  dialogueTopN: number
  recallTopN: number
  retentionDays: number
  timezoneOffset: number
  /** 日界线小时，必须与汇总侧一致（periodStart/periodEnd 的边界） */
  dayBoundaryHour?: number
  dialogueStatsEnabled: boolean
  memoryConfig: any
  /** 是否启用群聊记忆注入（与群记忆开关一致） */
  groupEnabled?: boolean
  /** 可注入时钟，便于验证周期覆盖；生产环境不传 */
  now?: () => Date
}

/**
 * 一个金字塔段落：同一粒度下的多条记忆。
 * `entries` 按时间倒序保存（[0] 最新），预算裁剪从末尾丢弃最旧的一条；
 * 渲染时再翻转成时间正序，让新增的记忆追加在末尾而不是顶到段落开头。
 */
interface PyramidSection {
  header: string
  entries: string[]
}

interface PyramidResult {
  sections: PyramidSection[]
  ids: Set<number>
}

export interface PromptBuildOptions {
  /** 不注入金字塔（个人与群）。省流这类一次性任务只要画像和当前材料 */
  skipPyramid?: boolean
  /** 不注入关键词召回 */
  skipRecall?: boolean
  /** 群聊环境里不注入 bot 自己的发言（随机插话时避免复读） */
  excludeSelfDialogue?: boolean
  /** 不注入提问者的画像与对话统计（群日报这类群级任务） */
  skipUserContext?: boolean
  /** 不注入短期群聊环境（日报材料已覆盖同一时段） */
  skipAmbient?: boolean
  /** 私聊主动消息：额外注入一条纯随机的 day 记忆，建议模型以其为话题 */
  randomDayRecall?: boolean
  /** 正常对话：允许模型用主动沉默触发词（由 config.enable_silence 控制是否真的注入说明） */
  allowSilence?: boolean
}

export class ContextBuilder {
  constructor(
    private repo: MemoryRepository,
    private shortTerm: ShortTermMemory,
    private profile: ProfileManager,
    private config: ContextConfig,
    private groupProfileManager?: ProfileManager,
  ) {}

  async build(
    session: Session,
    query: string,
    options: PromptBuildOptions = {},
  ): Promise<PromptContext> {
    const scopeId = this.config.memoryConfig.personal_memory ? session.userId : session.channelId
    const groupScope = this.groupScopeFor(session)
    const pyramidEnabled = this.config.enabled && !options.skipPyramid

    const emptyPyramid: PyramidResult = { sections: [], ids: new Set() }
    const [common, group, stats, pyramid, profile, groupPyramid, groupProfile] = await Promise.all([
      this.buildKnowledge('common', '*', query, this.config.commonTopN),
      this.buildKnowledge('group', session.channelId, query, this.config.commonTopN),
      this.config.dialogueStatsEnabled && !options.skipUserContext
        ? buildDialogueStats(this.repo, scopeId)
        : Promise.resolve(''),
      pyramidEnabled ? this.buildPyramid(scopeId) : Promise.resolve(emptyPyramid),
      options.skipUserContext ? Promise.resolve('') : this.profile.getContext(scopeId),
      // 群记忆与按人记忆并存：群 scope 走独立的一棵金字塔，最高只注入最近一年
      pyramidEnabled && groupScope
        ? this.buildPyramid(groupScope, true)
        : Promise.resolve(emptyPyramid),
      groupScope && this.groupProfileManager
        ? this.groupProfileManager.getContext(groupScope)
        : Promise.resolve(''),
    ])

    // 召回依赖金字塔已经选中的节点，避免同一段记忆被注入两次
    const recall = this.config.enabled && !options.skipRecall
      ? await this.buildRecall(scopeId, query, pyramid.ids)
      : { text: '', ids: new Set<number>() }
    // 随机 day 记忆在召回之后取，排除刚注入的记忆，避免同一段旧事出现两次
    const randomDayRecall = options.randomDayRecall
      ? await this.buildRandomDayRecall(session, recall.ids)
      : ''

    const ambient = options.skipAmbient
      ? ''
      : this.shortTerm.getChannelDialogue(
        session, this.config.memoryConfig, { excludeSelf: options.excludeSelfDialogue },
      )
    return {
      common, group, ambient, stats,
      datetime: this.buildDateTime(),
      pyramid: this.renderPyramid(pyramid.sections),
      recalled: recall.text, profile,
      randomDayRecall,
      groupPyramid: this.renderPyramid(groupPyramid.sections),
      groupProfile,
    }
  }

  /** 群记忆只在群聊会话里注入；私聊没有「群」可言 */
  private groupScopeFor(session: Session): string {
    if (!this.config.groupEnabled) return ''
    if (!isGroupSession(session)) return ''
    return groupScopeId(session.channelId)
  }

  private now(): Date {
    return this.config.now ? this.config.now() : new Date()
  }

  private get boundaryHour(): number {
    return this.config.dayBoundaryHour ?? 4
  }

  /** 当前时间精确到秒，是整段提示里变化最快的内容，只能放在最后。 */
  private buildDateTime(): string {
    const now = this.now()
    // 与分层记忆的日界线/归档使用同一时区，避免提示里的日期和记忆节点对不上
    const shifted = new Date(now.getTime() + this.config.timezoneOffset * 3_600_000)
    const pad = (value: number) => String(value).padStart(2, '0')
    const date = `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`
    const time = `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}`
    return `当前日期和时间：${date} ${time} 时段：${getTimeOfDay(shifted.getUTCHours())}`
  }

  // ---------- 知识 ----------

  private async buildKnowledge(kind: string, targetId: string, query: string, topN: number): Promise<string> {
    const rows = await this.repo.getKnowledge(kind, targetId)
    if (!rows.length) {
      if (kind === 'common') return this.wrapCommon([])
      return ''
    }

    const matched = this.pickTop(rows, query, topN)
    if (kind === 'common') return this.wrapCommon(matched.map(row => row.content))
    if (!matched.length) return ''
    return `以下是本群聊你可能需要知道的信息：{\n${matched.map(row => row.content).join('\n')}\n}\n`
  }

  private wrapCommon(contents: string[]): string {
    if (!contents.length) return ''
    return `这是你可能需要知道的信息：{\n${contents.join('\n')} \n}\n`
  }

  private pickTop<T extends { id: number; content: string }>(rows: T[], query: string, topN: number): T[] {
    const docs: (RetrievalDocument & T)[] = rows.map(row => ({
      ...row,
      id: row.id,
      content: row.content,
    }))
    const ranked = rankDocuments(query, docs)
    if (ranked.length) return ranked.slice(0, topN).map(item => item.doc)
    return rows.slice(0, topN)
  }

  // ---------- 金字塔 ----------

  /**
   * 全时间范围覆盖：每一级都注入它所属父周期内的**全部**节点，而不是各级只取最新一条。
   *
   *   所有年份
   *   → 今年所有已闭合季度
   *   → 本季所有已闭合月份
   *   → 本月所有已闭合周
   *   → 本周所有已闭合天
   *   → 还没归入任何一天的话题
   *
   * 父周期尚未闭合时它本身没有节点，下一级正好补上这一段，因此时间轴上不会出现空洞。
   * 归属判定与汇总侧一致：子节点落在 (父起点, 父终点]，即 periodEnd - 1ms 所在周期。
   */
  private async buildPyramid(scopeId: string, latestYearOnly = false): Promise<PyramidResult> {
    const now = this.now()
    const tz = this.config.timezoneOffset
    const boundary = this.boundaryHour

    // 父周期尚未闭合时终点在未来，用 now 作上界：节点只会在周期闭合后产生，
    // 因此 (父起点, now] 恰好等于「父周期内已总结的全部子节点」。
    const yearStart = periodStart('year', now, tz, boundary)
    const seasonStart = periodStart('season', now, tz, boundary)
    const monthStart = periodStart('month', now, tz, boundary)
    const weekStart = periodStart('week', now, tz, boundary)

    // 群记忆不需要往年：只取最新一条年节点，避免多年前的群聊占上下文
    const yearsPromise = latestYearOnly
      ? this.repo.getLatestMemory(scopeId, 'year').then(node => (node ? [node] : []))
      : this.repo.getMemoriesInRange(scopeId, 'year', null, now)

    const [years, seasons, months, weeks, days, latestDay] = await Promise.all([
      yearsPromise,
      this.repo.getMemoriesInRange(scopeId, 'season', yearStart, now),
      this.repo.getMemoriesInRange(scopeId, 'month', seasonStart, now),
      this.repo.getMemoriesInRange(scopeId, 'week', monthStart, now),
      this.repo.getMemoriesInRange(scopeId, 'day', weekStart, now),
      // 只看已闭合的日节点：周期未闭合时不该有节点，这里再挡一次脏数据
      this.repo.getLatestMemoryBefore(scopeId, 'day', now),
    ])

    // 话题层没有父周期记录，最后一个日节点的终点就是「已归日」的边界
    const topics = await this.repo.getMemoriesInRange(
      scopeId, 'topic', latestDay ? new Date(latestDay.periodEnd) : null, now,
    )

    const sections: PyramidSection[] = []
    const ids = new Set<number>()
    const add = (header: string, granularity: Granularity, rows: SatMemory[]) => {
      if (!rows.length) return
      const ordered = rows
        .slice()
        .sort((a, b) => new Date(b.periodEnd).getTime() - new Date(a.periodEnd).getTime())
      sections.push({
        header,
        entries: ordered.map(row => this.formatMemory(granularity, row)),
      })
      for (const row of ordered) ids.add(row.id)
    }

    // 由粗到细排列。前缀缓存按字节比对，最稳定的内容必须放在最前面：
    // 年/季/月这些上层节点写完就不再变，话题和每日总结则在持续追加，
    // 把它们放在末尾，新增内容才不会顶掉前面整段已经缓存的前缀。
    add(latestYearOnly ? '### 最近一年总结' : '### 历年总结', 'year', years)
    add('### 今年各季总结', 'season', seasons)
    add('### 本季各月总结', 'month', months)
    add('### 本月各周总结', 'week', weeks)
    add('### 本周每日总结', 'day', days)
    add('### 尚未总结为日的话题', 'topic', topics)

    return { sections, ids }
  }

  /** 多条记忆必须带时间范围，否则模型无法区分哪条属于哪一段 */
  private formatMemory(granularity: Granularity, memory: SatMemory): string {
    const tz = this.config.timezoneOffset
    if (granularity === 'topic') {
      const topic = memory.topic ? `【${memory.topic}】` : ''
      return `[${formatTime(memory.periodStart, tz)} ~ ${formatTime(memory.periodEnd, tz)}] ${topic}${memory.content}`
    }
    return `[${formatDay(memory.periodStart, tz)} ~ ${formatDay(memory.periodEnd, tz)}] ${memory.content}`
  }

  private renderPyramid(sections: PyramidSection[]): string {
    return sections
      .filter(section => section.entries.length)
      // 段内按时间正序输出：新节点追加在末尾，前面已经渲染过的内容逐字节不变
      .map(section => `${section.header}\n${section.entries.slice().reverse().join('\n')}`)
      .join('\n\n')
  }

  /** 运维命令用：返回与注入系统提示完全一致的金字塔文本 */
  async buildMemoryView(scopeId: string): Promise<string> {
    if (!this.config.enabled) return ''
    const { sections } = await this.buildPyramid(scopeId, isGroupScope(scopeId))
    return this.renderPyramid(sections)
  }

  // ---------- 主动回忆 ----------

  /**
   * 较久之前的旧事：BM25 召回 + 3 天内不重复提示。
   * 提示词只给「可以主动提起」的许可，提不提、怎么提由模型判断。
   */
  private async buildRecall(scopeId: string, query: string, excluded: Set<number>): Promise<{ text: string, ids: Set<number> }> {
    if (!query) return { text: '', ids: new Set() }
    const now = this.now()
    const cutoff = new Date(now.getTime() - RECALL_HINT_DAYS * 86_400_000)
    // 0 = 永久保留：召回不受时间窗限制
    const since = this.config.retentionDays > 0
      ? new Date(now.getTime() - this.config.retentionDays * 86_400_000)
      : new Date(0)
    const [candidates, recentIds] = await Promise.all([
      this.repo.getRecallCandidates(scopeId, ['topic', 'day'], since),
      this.repo.getRecentRecallIds(scopeId, cutoff),
    ])
    if (!candidates.length) return { text: '', ids: new Set() }

    // 金字塔已注入的节点不重复召回；3 天内提示过的也不再重复
    const available = candidates.filter(memory => !excluded.has(memory.id))
    const docs = available
      .filter(memory => !recentIds.has(memory.id))
      .map(memory => ({
        id: memory.id,
        content: memory.content,
        timestamp: new Date(memory.periodEnd),
        memory,
      }))

    const ranked = rankDocuments(query, docs).slice(0, this.config.recallTopN)
    if (!ranked.length) {
      if (available.length > docs.length) {
        logger.debug(`[主动回忆] scope=${scopeId} 候选 ${available.length} 条均在 ${RECALL_HINT_DAYS} 天内提示过`)
      }
      return { text: '', ids: new Set() }
    }

    const ids = ranked.map(item => item.doc.memory.id)
    await this.repo.recordRecallHints(scopeId, ids, now, cutoff)
    logger.info(`[主动回忆] scope=${scopeId} 注入 ${ranked.length} 条`
      + ` ids=[${ids.join(',')}]`
      + ` 分数=[${ranked.map(item => item.score.toFixed(3)).join(',')}]`
      + (available.length > docs.length
        ? `，${RECALL_HINT_DAYS} 天内已提示跳过 ${available.length - docs.length} 条`
        : ''))

    const lines = ranked.map(({ doc }) => {
      const time = formatTime(doc.memory.periodStart, this.config.timezoneOffset)
      return `[${time}] ${doc.content}`
    })
    return {
      text: `以下是较久之前用户说过的话和对话时间（如果和当前话题自然相关，可以主动提起；不相关就忽略，不要生硬复述）：{\n${lines.join('\n')}\n}\n`,
      ids: new Set(ids),
    }
  }

  /**
   * 私聊主动消息：额外随机取一条 day 记忆，建议模型以其为话题。
   * 只用于私聊；群聊的主动发言不做随机 day 召回。
   */
  private async buildRandomDayRecall(session: Session, excludeIds: Set<number>): Promise<string> {
    if (!this.config.enabled) return ''
    if (isGroupSession(session)) return ''
    const scopeId = this.config.memoryConfig.personal_memory ? session.userId : session.channelId
    if (!scopeId) return ''

    const now = this.now()
    const cutoff = new Date(now.getTime() - RECALL_HINT_DAYS * 86_400_000)
    const since = this.config.retentionDays > 0
      ? new Date(now.getTime() - this.config.retentionDays * 86_400_000)
      : new Date(0)
    const recentIds = await this.repo.getRecentRecallIds(scopeId, cutoff)
    // 本轮召回刚注入的记忆也不重复
    const blocked = new Set([...recentIds, ...excludeIds])
    const memory = await this.repo.getRandomDayMemory(scopeId, since, blocked)
    if (!memory) return ''

    await this.repo.recordRecallHints(scopeId, [memory.id], now, cutoff)
    const time = formatDay(memory.periodStart, this.config.timezoneOffset)
    logger.info(`[主动回忆] scope=${scopeId} 随机 day 记忆 id=${memory.id} 日期=${time}`)
    return `以下是你记得的一件旧事（可以自然地以它为话题，和当前情况不相关就不要硬提）：{\n[${time}] ${memory.content}\n}\n`
  }
}

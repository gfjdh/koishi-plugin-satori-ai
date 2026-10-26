// src/memory/context.ts
// 组装注入系统提示的记忆片段：常识 / 群常识 / 群聊环境 / 分层金字塔 / 关键词召回 / 画像。
import { Session } from 'koishi'
import { getTimeOfDay } from '../utils'
import { MemoryRepository } from './repository'
import { ProfileManager } from './profile'
import { Granularity, SatKnowledge, SatMemory } from './schema'
import { rankDocuments, RetrievalDocument, truncate } from './retrieval'
import { ShortTermMemory } from './short-term'
import { buildDialogueStats } from './stats'
import { formatDay, formatTime, periodStart } from './summarizer'

export interface PromptContext {
  common: string
  group: string
  ambient: string
  stats: string
  /** 每轮必变：由 index.tsx 拼在系统提示最末尾，避免它前面的内容无法命中前缀缓存 */
  datetime: string
  pyramid: string
  recalled: string
  profile: string
}

export interface ContextConfig {
  enabled: boolean
  commonTopN: number
  dialogueTopN: number
  recallTopN: number
  retentionDays: number
  contextMaxChars: number
  timezoneOffset: number
  /** 日界线小时，必须与汇总侧一致（periodStart/periodEnd 的边界） */
  dayBoundaryHour?: number
  dialogueStatsEnabled: boolean
  memoryConfig: any
  /** 可注入时钟，便于验证周期覆盖；生产环境不传 */
  now?: () => Date
}

/** 一个金字塔段落：同一粒度下按时间倒序的多条记忆 */
interface PyramidSection {
  header: string
  entries: string[]
}

interface PyramidResult {
  sections: PyramidSection[]
  ids: Set<number>
}

export class ContextBuilder {
  constructor(
    private repo: MemoryRepository,
    private shortTerm: ShortTermMemory,
    private profile: ProfileManager,
    private config: ContextConfig,
  ) {}

  async build(session: Session, query: string): Promise<PromptContext> {
    const scopeId = this.config.memoryConfig.personal_memory ? session.userId : session.channelId

    const emptyPyramid: PyramidResult = { sections: [], ids: new Set() }
    const [common, group, stats, pyramid, profile] = await Promise.all([
      this.buildKnowledge('common', '*', query, this.config.commonTopN),
      this.buildKnowledge('group', session.channelId, query, this.config.commonTopN),
      this.config.dialogueStatsEnabled ? buildDialogueStats(this.repo, scopeId) : Promise.resolve(''),
      this.config.enabled ? this.buildPyramid(scopeId) : Promise.resolve(emptyPyramid),
      this.profile.getContext(scopeId),
    ])

    // 召回依赖金字塔已经选中的节点，避免同一段记忆被注入两次
    const recalled = this.config.enabled
      ? await this.buildRecall(scopeId, query, pyramid.ids)
      : ''

    const ambient = this.shortTerm.getChannelDialogue(session, this.config.memoryConfig)
    return this.applyBudget({
      common, group, ambient, stats,
      datetime: this.buildDateTime(),
      pyramid: this.renderPyramid(pyramid.sections),
      recalled, profile,
    }, pyramid.sections)
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
  private async buildPyramid(scopeId: string): Promise<PyramidResult> {
    const now = this.now()
    const tz = this.config.timezoneOffset
    const boundary = this.boundaryHour

    // 父周期尚未闭合时终点在未来，用 now 作上界：节点只会在周期闭合后产生，
    // 因此 (父起点, now] 恰好等于「父周期内已总结的全部子节点」。
    const yearStart = periodStart('year', now, tz, boundary)
    const seasonStart = periodStart('season', now, tz, boundary)
    const monthStart = periodStart('month', now, tz, boundary)
    const weekStart = periodStart('week', now, tz, boundary)

    const [years, seasons, months, weeks, days, latestDay] = await Promise.all([
      this.repo.getMemoriesInRange(scopeId, 'year', null, now),
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

    // 由近到远排列：预算不足时优先保留靠前的段落，硬截断也会先丢掉最旧的内容
    add('### 尚未总结为日的话题', 'topic', topics)
    add('### 本周每日总结', 'day', days)
    add('### 本月各周总结', 'week', weeks)
    add('### 本季各月总结', 'month', months)
    add('### 今年各季总结', 'season', seasons)
    add('### 历年总结', 'year', years)

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
      .map(section => `${section.header}\n${section.entries.join('\n')}`)
      .join('\n\n')
  }

  /** 运维命令用：返回与注入系统提示完全一致的金字塔文本 */
  async buildMemoryView(scopeId: string): Promise<string> {
    if (!this.config.enabled) return ''
    const { sections } = await this.buildPyramid(scopeId)
    return this.renderPyramid(sections)
  }

  // ---------- 召回 ----------

  private async buildRecall(scopeId: string, query: string, excluded: Set<number>): Promise<string> {
    if (!query) return ''
    const since = new Date(this.now().getTime() - this.config.retentionDays * 86_400_000)
    const candidates = await this.repo.getRecallCandidates(scopeId, ['topic', 'day'], since)
    if (!candidates.length) return ''

    // 金字塔已注入的节点不重复召回
    const docs = candidates
      .filter(memory => !excluded.has(memory.id))
      .map(memory => ({
        id: memory.id,
        content: memory.content,
        timestamp: new Date(memory.periodEnd),
        memory,
      }))

    const ranked = rankDocuments(query, docs).slice(0, this.config.recallTopN)
    if (!ranked.length) return ''

    const lines = ranked.map(({ doc }) => {
      const time = formatTime(doc.memory.periodStart, this.config.timezoneOffset)
      return `[${time}] ${doc.content}`
    })
    return `以下是较久之前用户说过的话和对话时间：{\n${lines.join('\n')}\n}\n`
  }

  // ---------- 预算 ----------

  /**
   * 超出预算时按“越近越优先”的顺序削减：
   * ① 每层先只保留最新的一条（尽量维持每一级的覆盖）；
   * ② 再从最粗的层级开始整段丢弃：历年 → 今年各季 → 本季各月 → 本月各周 → 本周每日；
   * ③ 仍超限时硬截断，保留开头（最新的话题）。
   * 召回最先整体移除。常识、群常识、群聊环境与画像保持完整（它们通常很短且高频有用）。
   */
  private applyBudget(context: PromptContext, sections: PyramidSection[]): PromptContext {
    const max = this.config.contextMaxChars
    if (max <= 0) return context

    const otherLength = () =>
      context.common.length + context.group.length + context.ambient.length
      + context.stats.length + context.datetime.length + context.recalled.length
      + context.profile.length
    const total = () => otherLength() + context.pyramid.length
    const rerender = () => { context.pyramid = this.renderPyramid(sections) }

    if (total() <= max) return context

    // 先整体移除召回
    context.recalled = ''
    if (total() <= max) return context

    // ① 每层保留最新一条
    for (let i = sections.length - 1; i >= 0; i--) {
      while (sections[i].entries.length > 1 && total() > max) {
        sections[i].entries.pop()
        rerender()
      }
      if (total() <= max) return context
    }

    // ② 从最粗（数组末尾）开始整段丢弃
    for (let i = sections.length - 1; i >= 0; i--) {
      while (sections[i].entries.length && total() > max) {
        sections[i].entries.pop()
        rerender()
      }
      if (total() <= max) return context
    }

    // ③ 仍然超限：按剩余长度硬截断，保留最新的内容
    context.pyramid = truncate(context.pyramid, Math.max(0, max - otherLength()))
    return context
  }
}

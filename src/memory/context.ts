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
import { formatTime } from './summarizer'

export interface PromptContext {
  common: string
  group: string
  ambient: string
  stats: string
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
  dialogueStatsEnabled: boolean
  memoryConfig: any
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

    const [common, group, stats, pyramid, recalled, profile] = await Promise.all([
      this.buildKnowledge('common', '*', query, this.config.commonTopN),
      this.buildKnowledge('group', session.channelId, query, this.config.commonTopN),
      this.config.dialogueStatsEnabled ? buildDialogueStats(this.repo, scopeId) : Promise.resolve(''),
      this.config.enabled ? this.buildPyramid(scopeId) : Promise.resolve(''),
      this.config.enabled ? this.buildRecall(scopeId, query) : Promise.resolve(''),
      this.profile.getContext(scopeId),
    ])

    const ambient = this.shortTerm.getChannelDialogue(session, this.config.memoryConfig)
    return this.applyBudget({ common, group, ambient, stats, pyramid, recalled, profile })
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
    const time = `时段：${getTimeOfDay(new Date().getHours())}`
    const date = `当前日期和时间：${new Date().toLocaleString()} ${time}`
    if (!contents.length) return '这是你可能用到的信息：{\n' + date + '\n}\n'
    return `这是你可能需要知道的信息：{\n${contents.join('\n')} \n${date}\n}\n`
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

  private async buildPyramid(scopeId: string): Promise<string> {
    const sections: { header: string; content: string; droppable: boolean }[] = []

    const latestTopic = await this.repo.getLatestMemory(scopeId, 'topic')
    if (latestTopic) {
      sections.push({
        header: '### 近期话题',
        content: `${latestTopic.topic ? `【${latestTopic.topic}】` : ''}${latestTopic.content}`,
        droppable: false,
      })
    }

    const levels: { level: Granularity; header: string }[] = [
      { level: 'day', header: '### 近日总结' },
      { level: 'week', header: '### 近周总结' },
      { level: 'month', header: '### 近月总结' },
      { level: 'season', header: '### 近季总结' },
      { level: 'year', header: '### 年度总结' },
    ]

    for (const { level, header } of levels) {
      const memory = await this.repo.getLatestMemory(scopeId, level)
      if (!memory) continue
      sections.push({
        header,
        content: memory.content,
        droppable: level !== 'day',
      })
    }

    return sections.map(section => `${section.header}\n${section.content}`).join('\n\n')
  }

  // ---------- 召回 ----------

  private async buildRecall(scopeId: string, query: string): Promise<string> {
    if (!query) return ''
    const since = new Date(Date.now() - this.config.retentionDays * 86_400_000)
    const candidates = await this.repo.getRecallCandidates(scopeId, ['topic', 'day'], since)
    if (!candidates.length) return ''

    // 金字塔已经注入了最新的 topic/day，不重复召回
    const [latestTopic, latestDay] = await Promise.all([
      this.repo.getLatestMemory(scopeId, 'topic'),
      this.repo.getLatestMemory(scopeId, 'day'),
    ])
    const excluded = new Set([latestTopic?.id, latestDay?.id].filter(Boolean))

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
   * 年度 → 近季 → 近月 → 召回 → 近周 → 近日 → 近期话题。
   * 常识、群常识、群聊环境与画像保持完整（它们通常很短且高频有用）。
   */
  private applyBudget(context: PromptContext): PromptContext {
    const max = this.config.contextMaxChars
    if (max <= 0) return context

    const total = () =>
      context.common.length + context.group.length + context.ambient.length
      + context.stats.length + context.pyramid.length + context.recalled.length + context.profile.length

    if (total() <= max) return context

    // 先整体移除召回，再逐段截断金字塔
    context.recalled = ''
    if (total() <= max) return context

    const dropOrder = ['### 年度总结', '### 近季总结', '### 近月总结', '### 近周总结', '### 近日总结']
    let sections = context.pyramid.split('\n\n')

    for (const header of dropOrder) {
      const index = sections.findIndex(section => section.startsWith(header))
      if (index >= 0) sections.splice(index, 1)
      context.pyramid = sections.join('\n\n')
      if (total() <= max) return context
    }

    // 仍然超限：按剩余长度硬截断金字塔，保留最新的“近期话题”
    const otherLength = () =>
      context.common.length + context.group.length + context.ambient.length
      + context.stats.length + context.recalled.length + context.profile.length
    const allowed = Math.max(0, max - otherLength())
    context.pyramid = truncate(context.pyramid, allowed)
    return context
  }
}

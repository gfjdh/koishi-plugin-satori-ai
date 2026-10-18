// src/memory/profile.ts
// 增量式用户画像：LLM 返回 {added, modified, deleted}，本地合并、去重、按重要度淘汰。
import { Context, Logger } from 'koishi'
import { APIClient } from '../api'
import { User } from '../types'
import { MemoryRepository } from './repository'
import { ProfileData, ProfileEntry, SatMemory } from './schema'
import { parseLlmJson } from './json'
import { buildProfilePrompt } from './prompts'
import { applyProfileDelta, ProfileDelta } from './delta'

const logger = new Logger('satori-profile')

const CATEGORY_LABELS: Record<string, string> = {
  identity: '身份信息',
  preference: '喜好',
  aversion: '厌恶',
  requirement: '长期要求',
  habit: '习惯',
  fact: '其他',
}

const CATEGORY_ORDER = ['identity', 'preference', 'aversion', 'requirement', 'habit', 'fact']

export interface ProfileConfig {
  enabled: boolean
  dryRun: boolean
  maxEntries: number
  contextEntries: number
}

export class ProfileManager {
  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private api: APIClient,
    private config: ProfileConfig,
  ) {}

  /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致） */
  async summarize(
    scopeId: string,
    summary: string,
    memories: SatMemory[],
    user: User | null = null,
  ): Promise<void> {
    if (!this.config.enabled) return
    if (!summary && !memories.length) return

    if (this.config.dryRun) {
      logger.info(`[dry-run] 画像更新跳过 scope=${scopeId} 输入长度=${summary.length + memories.length}`)
      return
    }

    const profile = await this.repo.getProfile(scopeId)
    const entries = profile?.data?.entries || []

    const input = [
      summary ? `【总结】\n${summary}` : '',
      ...memories.map(memory => `【记忆】${memory.content}${memory.userState ? `（用户状态：${memory.userState}）` : ''}`),
    ].filter(Boolean).join('\n\n')

    if (!input) return

    const result = await this.api.auxiliaryChat(buildProfilePrompt(entries, input), user)
    if (result.error) {
      logger.warn(`画像更新失败 scope=${scopeId}: ${result.content}`)
      return
    }

    const delta = parseLlmJson<ProfileDelta>(result.content)
    if (!delta) {
      logger.warn(`画像 delta 解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return
    }

    const now = new Date().toISOString()
    const next = applyProfileDelta(entries, delta, now, this.config.maxEntries)
    const data: ProfileData = { entries: next, lastSummarizedAt: now }
    await this.repo.saveProfile(scopeId, data)

    const added = (delta.added || []).length
    const modified = (delta.modified || []).length
    const deleted = (delta.deleted || []).length
    logger.info(`画像已更新 scope=${scopeId} (+${added} ~${modified} -${deleted}, 共 ${next.length} 条)`)
  }

  async getContext(scopeId: string): Promise<string> {
    if (!this.config.enabled) return ''
    const profile = await this.repo.getProfile(scopeId)
    const entries = profile?.data?.entries || []
    if (!entries.length) return ''

    const selected = [...entries]
      .sort((a, b) => b.importance - a.importance || b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, this.config.contextEntries)

    const grouped = new Map<string, string[]>()
    for (const entry of selected) {
      const category = CATEGORY_LABELS[entry.category] ? entry.category : 'fact'
      const list = grouped.get(category) || []
      list.push(entry.content)
      grouped.set(category, list)
    }

    const lines: string[] = []
    for (const category of CATEGORY_ORDER) {
      const list = grouped.get(category)
      if (!list?.length) continue
      lines.push(`${CATEGORY_LABELS[category]}：`)
      for (const content of list) lines.push(`· ${content}`)
    }

    return `以下是当前用户的补充信息：{\n${lines.join('\n')}\n}\n`
  }

  async has(scopeId: string): Promise<boolean> {
    const profile = await this.repo.getProfile(scopeId)
    return !!profile?.data?.entries?.length
  }

  async formatById(scopeId: string): Promise<string> {
    if (!this.config.enabled) return '当前未启用用户画像功能'
    const profile = await this.repo.getProfile(scopeId)
    const entries = profile?.data?.entries || []
    if (!entries.length) return `用户${scopeId}没有画像`
    const lines = entries.map(entry =>
      `- [${CATEGORY_LABELS[entry.category] || entry.category}] ${entry.content}`)
    return `以下是用户${scopeId}的画像：{\n${lines.join('\n')}\n}`
  }
}

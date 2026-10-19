// src/memory/profile.ts
// 增量式用户画像：LLM 返回 {added, modified, deleted}，本地合并、去重、按重要度淘汰。
import { Context, Logger } from 'koishi'
import { APIClient } from '../api'
import { User } from '../types'
import { MemoryRepository } from './repository'
import { ProfileData, ProfileEntry, SatMemory } from './schema'
import { parseLlmJson } from './json'
import { buildProfilePrompt } from './prompts'
import { applyProfileDelta, sanitizeProfileDelta, ProfileDelta } from './delta'
import { isRejectedContent } from './reject'
import { redactSensitiveText } from './redact'

const logger = new Logger('satori-profile')

/** 画像输入被内容审核拒绝后该 scope 的冷却：重试同一段文本不会有不同结果。
 *  不永久放弃，是因为地灵殿通行证一旦充值恢复，辅助线路换了 provider，
 *  审核策略可能完全不同，那时应该重新尝试。 */
export const PROFILE_REJECT_COOLDOWN_MS = 6 * 3_600_000
/** 历史回填被拒后的冷却更长：它只在积压追平后触发，本身不是高频路径 */
export const BACKFILL_REJECT_COOLDOWN_MS = 12 * 3_600_000

export type ProfileOutcome = 'ok' | 'failed' | 'rejected' | 'skipped'

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
  /** 只对最近 N 天内结束的日节点更新画像；<=0 表示不限制 */
  updateWindowDays?: number
}

export class ProfileManager {
  /** 曾经被内容审核拒绝的 scope：之后直接用脱敏副本，不再白花一次调用 */
  private redactScopes = new Set<string>()
  /** 审核拒绝后的冷却截止时刻（内存态，重启后重新探测一次） */
  private cooldownUntil = new Map<string, number>()

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private api: APIClient,
    private config: ProfileConfig,
    /** 可注入的时钟，便于测试冷却窗口 */
    private now: () => number = () => Date.now(),
  ) {}

  isEnabled(): boolean {
    return this.config.enabled
  }

  /** 该 scope 是否处于审核拒绝的冷却期；过期即清除 */
  isCoolingDown(scopeId: string): boolean {
    const until = this.cooldownUntil.get(scopeId)
    if (!until) return false
    if (until <= this.now()) {
      this.cooldownUntil.delete(scopeId)
      return false
    }
    return true
  }

  private cooldown(scopeId: string, ms: number, reason: string): void {
    this.cooldownUntil.set(scopeId, this.now() + ms)
    logger.warn(`画像更新冷却 scope=${scopeId} ${Math.round(ms / 3_600_000)} 小时：${reason}`)
  }

  /**
   * 该日节点是否还在画像更新窗口内。历史回填的日节点动辄是几个月前的，
   * 从中反复抽画像既浪费调用，也会让画像停留在过去；默认只认最近 7 天。
   */
  shouldUpdate(periodEnd: Date | null): boolean {
    if (!this.config.enabled) return false
    const windowDays = this.config.updateWindowDays ?? 7
    if (!periodEnd || windowDays <= 0) return true
    return Date.now() - periodEnd.getTime() <= windowDays * 86_400_000
  }

  /** 画像更新窗口的起点；null 表示不限制（窗口 <= 0） */
  windowStart(now = Date.now()): Date | null {
    const windowDays = this.config.updateWindowDays ?? 7
    return windowDays > 0 ? new Date(now - windowDays * 86_400_000) : null
  }

  /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致）。 */
  async summarize(
    scopeId: string,
    summary: string,
    memories: SatMemory[],
    user: User | null = null,
    periodEnd: Date | null = null,
  ): Promise<ProfileOutcome> {
    if (!this.config.enabled) return 'skipped'
    if (!summary && !memories.length) return 'skipped'
    if (!this.shouldUpdate(periodEnd)) return 'skipped'
    if (this.isCoolingDown(scopeId)) return 'skipped'

    if (this.config.dryRun) {
      logger.info(`[dry-run] 画像更新跳过 scope=${scopeId} 输入长度=${summary.length + memories.length}`)
      return 'skipped'
    }

    const input = [
      summary ? `【总结】\n${summary}` : '',
      ...memories.map(memory => `【记忆】${memory.content}${memory.userState ? `（用户状态：${memory.userState}）` : ''}`),
    ].filter(Boolean).join('\n\n')

    if (!input) return 'skipped'

    const profile = await this.repo.getProfile(scopeId)
    return this.applyUpdate(scopeId, profile?.data, input, user, PROFILE_REJECT_COOLDOWN_MS)
  }

  async isBackfilled(scopeId: string): Promise<boolean> {
    const profile = await this.repo.getProfile(scopeId)
    return !!profile?.data?.backfilledAt
  }

  /**
   * 历史回填：积压追平后，用金字塔里的高层汇总补一次画像，每个 scope 只做一次。
   * 这样既不必为每个旧日子调用模型，也不会把旧历史里的长期信息整个丢掉。
   */
  async backfill(
    scopeId: string,
    sections: { label: string, content: string }[],
    user: User | null = null,
  ): Promise<ProfileOutcome> {
    if (!this.config.enabled) return 'skipped'
    if (this.isCoolingDown(scopeId)) return 'skipped'

    const input = sections
      .filter(section => section.content)
      .map(section => `【${section.label}】\n${section.content}`)
      .join('\n\n')
    if (!input) return 'skipped'

    const profile = await this.repo.getProfile(scopeId)
    if (profile?.data?.backfilledAt) return 'skipped'

    if (this.config.dryRun) {
      logger.info(`[dry-run] 画像历史回填跳过 scope=${scopeId} 输入长度=${input.length}`)
      return 'skipped'
    }

    return this.applyUpdate(scopeId, profile?.data, input, user, BACKFILL_REJECT_COOLDOWN_MS, {
      backfilledAt: new Date().toISOString(),
    })
  }

  /** 调模型、清洗 delta、合并落库。 */
  private async applyUpdate(
    scopeId: string,
    existing: ProfileData | undefined,
    input: string,
    user: User | null,
    cooldownMs: number,
    extra: Partial<ProfileData> = {},
  ): Promise<ProfileOutcome> {
    const entries = existing?.entries || []
    const redact = this.redactScopes.has(scopeId)

    let result = await this.api.auxiliaryChat(
      buildProfilePrompt(...this.promptInput(entries, input, redact)), user,
    )

    if (result.error && isRejectedContent(result.content)) {
      // 内容审核拒绝：同一段文本原样重发没有意义。先用脱敏副本试一次，
      // 仍被拒就进入冷却，避免每分钟重试一次把调用额度和日志全烧光。
      if (redact) {
        this.cooldown(scopeId, cooldownMs, '脱敏后仍被内容审核拒绝')
        return 'rejected'
      }
      this.redactScopes.add(scopeId)
      logger.warn(`画像更新被内容审核拒绝，改用脱敏输入重试 scope=${scopeId}`)
      result = await this.api.auxiliaryChat(
        buildProfilePrompt(...this.promptInput(entries, input, true)), user,
      )
      if (result.error) {
        if (isRejectedContent(result.content)) {
          this.cooldown(scopeId, cooldownMs, '脱敏后仍被内容审核拒绝')
          return 'rejected'
        }
        logger.warn(`画像更新失败 scope=${scopeId}: ${result.content}`)
        return 'failed'
      }
    } else if (result.error) {
      logger.warn(`画像更新失败 scope=${scopeId}: ${result.content}`)
      return 'failed'
    }

    const delta = parseLlmJson<ProfileDelta>(result.content)
    if (!delta) {
      logger.warn(`画像 delta 解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return 'failed'
    }

    // 模型偶尔会把“删除/修改说明”写进 content，或对 legacy_portrait 直接改写。
    // 在合并前清洗，避免把编辑意图存成画像。
    const { delta: cleanDelta, rejected } = sanitizeProfileDelta(delta)
    if (rejected.length) {
      logger.warn(`画像 delta 丢弃无效条目 scope=${scopeId}: ${rejected.join(', ')}`)
    }

    const stamp = new Date().toISOString()
    const next = applyProfileDelta(entries, cleanDelta, stamp, this.config.maxEntries)
    // 保留 backfilledAt 等既有字段，避免普通日更新把它冲掉
    const data: ProfileData = { ...(existing || {}), entries: next, lastSummarizedAt: stamp, ...extra }
    await this.repo.saveProfile(scopeId, data)

    const added = (cleanDelta.added || []).length
    const modified = (cleanDelta.modified || []).length
    const deleted = (cleanDelta.deleted || []).length
    logger.info(`画像已更新 scope=${scopeId} (+${added} ~${modified} -${deleted}, 共 ${next.length} 条)`)
    return 'ok'
  }

  /** 需要脱敏时给出替换后的条目与输入；否则原样返回，避免无谓改动模型看到的文本 */
  private promptInput(
    entries: ProfileEntry[],
    input: string,
    redact: boolean,
  ): [ProfileEntry[], string] {
    if (!redact) return [entries, input]
    return [
      entries.map(entry => ({ ...entry, content: redactSensitiveText(entry.content) })),
      redactSensitiveText(input),
    ]
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

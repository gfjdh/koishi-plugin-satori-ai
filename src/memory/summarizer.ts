// src/memory/summarizer.ts
// 话题归档 + 分层汇总（topic -> day -> week -> month -> season -> year）。
//
// 金字塔的两条硬规则（2026-10-18 修正）：
// 1. topic 记忆不跨自然日（日界线默认 04:00，可配）。历史积压按自然日切块，
//    单日超过 200 条则同一天拆成多块；这样 day 级才有确定的边界。
// 2. 上一层只在一个「已闭合且下层已齐」的周期上生成，且每个周期最多一条。
//    周期闭合的判据是归档游标（sat_meta.topicStart）已经越过周期末尾——
//    游标之前的对话全部归档完毕，等价于该周期的 topic 全部产出。
//    这就是「先做完一个周期里所有 topic，再逐级上升」。
import { Context, Logger } from 'koishi'
import { APIClient } from '../api'
import { User } from '../types'
import { MemoryRepository } from './repository'
import { Granularity, SatDialogue, SatMemory } from './schema'
import { parseLlmJson } from './json'
import {
  buildGroupArchivePrompt, buildGroupSummaryPrompt, buildSummaryPrompt,
  buildTopicArchivePrompt, buildTopicBatchPrompt, buildTopicSwitchPrompt,
  resolveBotName,
  ArchiveDayResult, ArchiveResult, GroupArchiveResult, GroupSummaryResult,
  ROLE_USER, SummaryResult,
} from './prompts'
import {
  GROUP_BOT_KIND, GROUP_KINDS, GROUP_MAX_MESSAGES, GROUP_MIN_BLOCK_MESSAGES,
  compressGroupRows, isGroupScope, selectGroupBlock,
} from './group'
import { oneLine } from './text'
import { ProfileManager } from './profile'
import { redactSensitiveText } from './redact'
import { isRejectedContent } from './reject'
import { lastBoundary } from './retrieval'

const logger = new Logger('satori-summary')

export const TOPIC_MIN_TURNS = 5
export const TOPIC_MAX_TURNS = 20
export const TOPIC_MAX_AGE_HOURS = 24
export const MAX_ARCHIVE_DIALOGUES = 200
/**
 * 合并归档：一次调用最多覆盖多少个自然日。
 * 实测 5 天是吞吐拐点：再往上模型输出变长、单次延迟上升，
 * 每天摊到的耗时反而增加（10 天实测约 47 scope-day/分，5 天约 80）。
 */
export const MAX_BATCH_DAYS = 5
/** 收集时最多向前走多少个自然日（中间可能有空白日期） */
export const MAX_BATCH_WALK_DAYS = MAX_BATCH_DAYS * 4
/** 参与合并的单日对话数上限；超过的日子单独走单日归档 */
export const BATCH_DAY_MAX_DIALOGUES = 30
/** 一次合并归档的对话总数上限 */
export const BATCH_TOTAL_MAX_DIALOGUES = 80
/** 同一天连续失败多少次后跳过，避免一个坏日堵死整个 scope */
export const TOPIC_SKIP_AFTER_FAILURES = 3
/** 合并归档失败后暂停批处理的时间，避免每轮多花一次无效调用 */
const BATCH_COOLDOWN_MS = 5 * 60_000
export const MAX_CHILDREN_PER_SUMMARY = 100
/** 子记忆正文总和不超过这么多字时，直接拼成父节点，不再调用模型 */
export const PROMOTE_DIRECT_MAX_CHARS = 300
/** 单个 scope 一次心跳里最多建立多少个层级节点，防止历史积压把 tick 拖死 */
export const MAX_LEVEL_NODES_PER_TICK = 10
/** 每次心跳默认的辅助模型调用上限（归档 + 多子节点汇总 + 日画像） */
export const DEFAULT_MAX_CALLS_PER_TICK = 8

const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000

const LEVEL_ORDER = ['day', 'week', 'month', 'season', 'year'] as const
type Level = typeof LEVEL_ORDER[number]

const CHILD_OF: Record<Level, Granularity> = {
  day: 'topic',
  week: 'day',
  month: 'week',
  season: 'month',
  year: 'season',
}

const DIALOGUE_KINDS = ['turn', 'legacy']

export interface SummarizerConfig {
  dryRun: boolean
  topicSwitchCheck: boolean
  timezoneOffset: number
  dayBoundaryHour: number
  /** 昵称列表；归档时从用户发言里抹掉，避免昵称被当成发言人 */
  nickNames?: string[]
  /** 机器人名字（昵称列表第一个）：归档输入与提示词里的发言人标签 */
  botName?: string
  /** 每个 scope 每次汇总最多发起多少次辅助模型调用 */
  maxCallsPerTick?: number
  /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
  resolveUser?: (scopeId: string) => Promise<User | null>
  /** 群画像。群 scope 的日总结驱动它，而不是个人画像 */
  groupProfile?: ProfileManager
}

interface CallBudget {
  calls: number
}

/** 单次归档尝试的结果：ok 成功；empty 没有可归档内容；rejected 内容被模型审核拒绝；failed 其他失败 */
export type ArchiveOutcome = 'ok' | 'empty' | 'rejected' | 'failed'

interface ArchiveBlock {
  from: Date
  to: Date
  dialogues: SatDialogue[]
}

/** 合并归档时模型返回的日期归一化为 YYYY/MM/DD */
export function normalizeDayKey(value?: string): string | null {
  const match = (value || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (!match) return null
  return `${match[1]}/${match[2].padStart(2, '0')}/${match[3].padStart(2, '0')}`
}

/** 模型侧的内容审核拒绝：这类错误重试同一段文本没有意义，直接跳过当天 */
export { isRejectedContent } from './reject'

export function formatTime(date: Date, timezoneOffsetHours: number): string {
  const shifted = new Date(new Date(date).getTime() + timezoneOffsetHours * 3_600_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

/** 只到日期的格式，日/周/月等周期节点不需要分钟 */
export function formatDay(date: Date, timezoneOffsetHours: number): string {
  return formatTime(date, timezoneOffsetHours).slice(0, 10)
}

// ---------- 归档输入 ----------

export interface DialogueRow {
  userContent: string
  aiContent: string
  username?: string
  createdAt: Date
}

/**
 * 归档时要抹掉的昵称：昵称列表 + 「情侣合照」里存的专属昵称（用户的和 AI 的）。
 * 长名排前面，避免短名先替换后把长名拆碎。
 */
export function collectArchiveNickNames(
  baseNames: string[],
  user: Pick<User, 'items'> | null,
): string[] {
  const names = [...(baseNames || [])]
  const metadata = user?.items?.['情侣合照']?.metadata
  if (metadata) {
    if (typeof metadata.userNickName === 'string') names.push(metadata.userNickName)
    if (typeof metadata.botNickName === 'string') names.push(metadata.botNickName)
  }
  return [...new Set(names.map(name => (name || '').trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
}

/** 整段抹掉昵称：归档只关心内容，发言人的称呼由固定标签承担 */
function stripNames(content: string, names: string[]): string {
  if (!names.length) return content
  let result = content
  for (const name of names) result = result.split(name).join('')
  return result
}

/**
 * 把对话记录渲染成归档输入。
 *
 * 发言人只用固定标签标注，不用昵称：昵称在东方同人语境里常与角色同名，
 * 用户也可能在消息里用“名字：台词”的格式扮演角色或直接称呼 AI，
 * 靠识别名字判断身份是穷举不完的。这里让「行首标签」成为唯一判据，
 * 原话一律放进「」，内容里出现什么名字都不改变发言人。
 *
 * 在标签之外再加一层：用户发言里出现的昵称（昵称列表与「情侣合照」里的）
 * 直接抹掉，免得总结器把它们当成别的发言人写进记忆。
 *
 * 一个作用域里出现多个昵称时（按群记忆）才把昵称补在标签后面，
 * 只用来区分不同的人，不承担身份判断。
 */
export function formatDialogueRows(
  rows: DialogueRow[],
  timezoneOffset: number,
  names: string[] = [],
  botName?: string,
): string {
  const userNames = new Set(rows.map(row => (row.username || '').trim()).filter(Boolean))
  const showName = userNames.size > 1
  const bot = resolveBotName(botName)
  return rows.map((row) => {
    const time = formatTime(row.createdAt, timezoneOffset)
    const name = showName ? (row.username || '').trim() : ''
    const speaker = name ? `${ROLE_USER}（${name}）` : ROLE_USER
    const content = stripNames(oneLine(row.userContent), names)
    const lines = [`[${time}] ${speaker}说「${content}」`]
    // '…' 是关闭模型自发言记忆时的占位，不代表真的说了这句话
    const reply = row.aiContent && row.aiContent !== '…' ? oneLine(row.aiContent) : ''
    if (reply) lines.push(`[${time}] ${bot}说「${reply}」`)
    return lines.join('\n')
  }).join('\n')
}

export interface GroupRowFormatOptions {
  /** 机器人发言的标签：归档默认用昵称列表第一个，省流材料用「你」 */
  botLabel?: string
  /** 提问者的 userId；他的发言会额外标注，避免模型把别人的话当成他说的 */
  requesterId?: string
}

/**
 * 群聊时间块的归档输入。
 *
 * 发言人由消息的 kind 决定，不从内容里猜：`ambient-bot` 是机器人，
 * 其余是群友，昵称只用来区分不同的人。群友之间本来就互相称呼，
 * 这里不做昵称抹除，否则「A 说 B 怎么样」会被删成残句。
 */
export function formatGroupRows(
  rows: SatDialogue[],
  timezoneOffset: number,
  options: GroupRowFormatOptions = {},
): string {
  const botLabel = options.botLabel || resolveBotName()
  return rows.map((row) => {
    const time = formatTime(row.createdAt, timezoneOffset)
    const name = (row.username || '').trim()
    const isRequester = !!options.requesterId
      && row.kind !== GROUP_BOT_KIND
      && row.userId === options.requesterId
    const memberLabel = name
      ? `${ROLE_USER}（${name}${isRequester ? '/提问者' : ''}）`
      : (isRequester ? `${ROLE_USER}（提问者）` : ROLE_USER)
    const speaker = row.kind === GROUP_BOT_KIND ? botLabel : memberLabel
    return `[${time}] ${speaker}说「${oneLine(row.userContent)}」`
  }).join('\n')
}

// ---------- 周期边界（输入输出都是真实 UTC 时刻，宿主时区无关） ----------

/** date 所在自然日的起点：最近一个已过的日界线 */
export function dayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date {
  return lastBoundary(date, timezoneOffset, boundaryHour)
}

/** date 所在自然日的终点（下一条日界线） */
export function nextDayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date {
  return new Date(lastBoundary(date, timezoneOffset, boundaryHour).getTime() + DAY_MS)
}

/** date 所属的 level 周期起点：日 / 周一 / 月 / 季 / 年，均落在日界线上 */
export function periodStart(
  level: Level,
  date: Date,
  timezoneOffset: number,
  boundaryHour: number,
): Date {
  const start = lastBoundary(date, timezoneOffset, boundaryHour)
  if (level === 'day') return start

  const offsetMs = timezoneOffset * HOUR_MS
  const local = new Date(start.getTime() + offsetMs)
  const year = local.getUTCFullYear()
  const month = local.getUTCMonth()

  if (level === 'week') {
    // getUTCDay(): 0=周日；换算成「距离本周一几天」
    const back = (local.getUTCDay() + 6) % 7
    return new Date(start.getTime() - back * DAY_MS)
  }
  if (level === 'month') {
    return new Date(Date.UTC(year, month, 1, boundaryHour) - offsetMs)
  }
  if (level === 'season') {
    return new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1, boundaryHour) - offsetMs)
  }
  return new Date(Date.UTC(year, 0, 1, boundaryHour) - offsetMs)
}

/** level 周期的下一个起点（= 当前周期的终点） */
export function periodEnd(
  level: Level,
  start: Date,
  timezoneOffset: number,
  boundaryHour: number,
): Date {
  if (level === 'day') return new Date(start.getTime() + DAY_MS)
  if (level === 'week') return new Date(start.getTime() + 7 * DAY_MS)

  const offsetMs = timezoneOffset * HOUR_MS
  const local = new Date(start.getTime() + offsetMs)
  let year = local.getUTCFullYear()
  let month = local.getUTCMonth()
  if (level === 'month') month += 1
  else if (level === 'season') month += 3
  else year += 1
  year += Math.floor(month / 12)
  month = ((month % 12) + 12) % 12
  return new Date(Date.UTC(year, month, 1, boundaryHour) - offsetMs)
}

export class Summarizer {
  /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
  private busy = new Set<string>()
  /** scope:day -> 连续失败次数，成功或跳过后清除 */
  private topicFailures = new Map<string, number>()
  /** scope -> 合并归档冷却截止时间 */
  private batchCooldown = new Map<string, number>()

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private api: APIClient,
    private profile: ProfileManager,
    private config: SummarizerConfig,
  ) {}

  private get tz() { return this.config.timezoneOffset }
  private get boundaryHour() { return this.config.dayBoundaryHour }
  private get botName() { return resolveBotName(this.config.botName) }

  // ---------- 话题 ----------

  /**
   * 每轮对话后调用：必要时归档当前话题。
   * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
   */
  async maybeSwitchTopic(scopeId: string): Promise<void> {
    if (!this.config.topicSwitchCheck) return
    // 群聊按时间块归档，热路径上不做任何模型调用
    if (isGroupScope(scopeId)) return
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId)
      const meta = await this.repo.ensureMeta(scopeId)
      const dialogues = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: DIALOGUE_KINDS,
        // 只需要判断是否达到阈值，不把迁移后的全部历史读进内存
        limit: TOPIC_MAX_TURNS,
      })
      if (dialogues.length <= TOPIC_MIN_TURNS) return

      let shouldSwitch = dialogues.length >= TOPIC_MAX_TURNS
      if (!shouldSwitch) {
        const text = this.formatDialogues(dialogues, user)
        const result = await this.api.auxiliaryChat(
          buildTopicSwitchPrompt(text, formatTime(meta.topicStart, this.tz)),
          user,
        )
        if (result.error) return
        const answer = (result.content || '').replace(/[\s。，,.!！?？]/g, '')
        shouldSwitch = answer.startsWith('是')
      }

      if (shouldSwitch) await this.archiveTopicLocked(scopeId, user)
    })
  }

  /**
   * 把游标所在自然日内、尚未归档的对话归档为一条 topic 记忆。
   * 超过 MAX_ARCHIVE_DIALOGUES 时只取前 200 条（同一天拆成多块）。
   * 返回是否真的发起并完成了归档。
   */
  private async archiveTopicLocked(scopeId: string, user: User | null): Promise<ArchiveOutcome> {
    const meta = await this.repo.ensureMeta(scopeId)
    const cursor = new Date(meta.topicStart)
    // 关键：只看游标所在的那一天，topic 记忆绝不跨日
    const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour)

    const dialogues = await this.repo.getDialoguesAfter(scopeId, cursor, {
      kinds: DIALOGUE_KINDS,
      limit: MAX_ARCHIVE_DIALOGUES,
      before: dayEnd,
    })
    if (!dialogues.length) return 'empty'

    const text = this.formatDialogues(dialogues, user)
    if (this.config.dryRun) {
      logger.info(`[dry-run] topic 归档 scope=${scopeId} 对话=${dialogues.length} 字符=${text.length}`
        + ` 日=${formatTime(cursor, this.tz)}`)
      return 'empty'
    }

    let result = await this.api.auxiliaryChat(buildTopicArchivePrompt(text, this.botName), user)
    if (result.error && isRejectedContent(result.content)) {
      // 被审核拒绝时用脱敏副本再试一次：少一点细节，也好过整天不归档
      logger.warn(`topic 归档被内容审核拒绝，改用脱敏输入重试 scope=${scopeId}`)
      result = await this.api.auxiliaryChat(buildTopicArchivePrompt(redactSensitiveText(text), this.botName), user)
    }
    if (result.error) {
      logger.warn(`topic 归档失败 scope=${scopeId}: ${result.content}`)
      return isRejectedContent(result.content) ? 'rejected' : 'failed'
    }

    const parsed = parseLlmJson<ArchiveResult>(result.content)
    const summary = parsed?.summary?.trim()
    if (!summary) {
      logger.warn(`topic 归档解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return 'failed'
    }

    const periodStart = dialogues[0].createdAt
    const last = dialogues[dialogues.length - 1]
    // 记忆与游标一次写入：只推进到本批对话的末尾，不跳到 now，
    // 避免丢掉归档期间新到的消息。若这一天已经关闭且没有剩余对话，
    // 直接把游标推到日界——day 级据此判定「该自然日已归档完整」。
    let nextCursor = new Date(last.createdAt)
    if (dayEnd.getTime() <= Date.now()) {
      const remaining = await this.repo.countDialoguesInRange(
        scopeId, nextCursor, dayEnd, DIALOGUE_KINDS,
      )
      if (!remaining) nextCursor = dayEnd
    }

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
    }, scopeId, nextCursor)

    const remaining = await this.repo.countDialoguesAfter(scopeId, nextCursor)
    logger.info(`topic 归档完成 scope=${scopeId} 对话=${dialogues.length}`
      + ` 日=${formatTime(dayStart(cursor, this.tz, this.boundaryHour), this.tz)}`
      + (remaining ? ` 剩余${remaining}条待处理` : ''))
    return 'ok'
  }

  /**
   * 收集从游标开始的连续稀疏日，最多 MAX_BATCH_DAYS 天。
   * 只有收集到 2 天以上才值得合并（否则单日路径更直接）：
   * 遇到对话数超过 BATCH_DAY_MAX_DIALOGUES 的日子、未闭合的当天或总量超限就停。
   */
  private async collectArchiveBlocks(scopeId: string, cursor: Date): Promise<ArchiveBlock[]> {
    const blocks: ArchiveBlock[] = []
    let from = new Date(cursor)
    let total = 0

    for (let i = 0; i < MAX_BATCH_WALK_DAYS && blocks.length < MAX_BATCH_DAYS; i++) {
      const to = nextDayStart(from, this.tz, this.boundaryHour)
      // 当天还没闭合，不能合并：之后还会有新对话落进这一天
      if (to.getTime() > Date.now()) break

      const count = await this.repo.countDialoguesInRange(scopeId, from, to, DIALOGUE_KINDS)
      if (count === 0) {
        from = to
        continue
      }
      if (count > BATCH_DAY_MAX_DIALOGUES) break
      if (total + count > BATCH_TOTAL_MAX_DIALOGUES) break

      const dialogues = await this.repo.getDialoguesAfter(scopeId, from, {
        kinds: DIALOGUE_KINDS,
        limit: BATCH_DAY_MAX_DIALOGUES,
        before: to,
      })
      if (dialogues.length !== count) {
        logger.warn(`topic 合并归档取样不一致 scope=${scopeId} 预期=${count} 实得=${dialogues.length}`)
        break
      }
      blocks.push({ from, to, dialogues })
      total += dialogues.length
      from = to
    }

    return blocks.length >= 2 ? blocks : []
  }

  /**
   * 一次调用归档多个稀疏日，模型按 date 返回每天的结果。
   * 任何一天缺失都视为整批失败：调用方会退回单日路径，
   * 宁可慢一点，也不能把某天的内容写进别的日期。
   */
  private async archiveBlocksLocked(
    scopeId: string,
    user: User | null,
    blocks: ArchiveBlock[],
  ): Promise<ArchiveOutcome> {
    const groups = blocks.map(block => ({
      date: formatTime(block.from, this.tz).slice(0, 10),
      dialogues: this.formatDialogues(block.dialogues, user),
    }))
    let result = await this.api.auxiliaryChat(buildTopicBatchPrompt(groups, this.botName), user)
    if (result.error && isRejectedContent(result.content)) {
      logger.warn(`topic 合并归档被内容审核拒绝，改用脱敏输入重试 scope=${scopeId} 天数=${blocks.length}`)
      result = await this.api.auxiliaryChat(buildTopicBatchPrompt(groups.map(group => ({
        date: group.date,
        dialogues: redactSensitiveText(group.dialogues),
      })), this.botName), user)
    }
    if (result.error) {
      logger.warn(`topic 合并归档失败 scope=${scopeId} 天数=${blocks.length}: ${result.content}`)
      return isRejectedContent(result.content) ? 'rejected' : 'failed'
    }

    const parsed = parseLlmJson<{ days?: ArchiveDayResult[] }>(result.content)
    const days = parsed?.days
    const entries = Array.isArray(days) ? days : []
    const byDate = new Map<string, ArchiveDayResult>()
    for (const entry of entries) {
      const key = normalizeDayKey(entry?.date)
      if (!key || !(entry.summary || '').trim()) continue
      byDate.set(key, entry)
    }

    const memories: Omit<SatMemory, 'id'>[] = []
    for (const [index, block] of blocks.entries()) {
      const key = normalizeDayKey(groups[index].date)
      const entry = key ? byDate.get(key) : null
      if (!entry?.summary?.trim()) {
        logger.warn(`topic 合并归档缺少某天 scope=${scopeId} 日=${groups[index].date}`
          + ` 返回=${(result.content || '').slice(0, 200)}`)
        return 'failed'
      }
      memories.push({
        scopeId,
        granularity: 'topic',
        topic: (entry.topic || '').trim(),
        content: entry.summary.trim(),
        userState: (entry.user_state || '').trim(),
        periodStart: block.dialogues[0].createdAt,
        periodEnd: block.dialogues[block.dialogues.length - 1].createdAt,
        sourceCount: block.dialogues.length,
        createdAt: new Date(),
      })
    }

    // 只推进到最后一天结束，且这几天都已闭合，不会吃掉新消息
    await this.repo.commitTopicArchives(memories, scopeId, blocks[blocks.length - 1].to)
    logger.info(`topic 合并归档完成 scope=${scopeId} 天数=${blocks.length}`
      + ` 对话=${blocks.reduce((sum, block) => sum + block.dialogues.length, 0)}`
      + ` 起=${groups[0].date} 止=${groups[groups.length - 1].date}`)
    return 'ok'
  }

  private dayKey(scopeId: string, cursor: Date): string {
    return `${scopeId}:${dayStart(cursor, this.tz, this.boundaryHour).getTime()}`
  }

  /**
   * 跳过游标所在的日子（模型审核拒绝或连续失败）。
   * 当天还没结束时只跳到本批最后一条对话之后，绝不把游标推到未来。
   */
  private async skipDay(
    scopeId: string,
    cursor: Date,
    dayEnd: Date,
    reason: string,
  ): Promise<void> {
    let next = dayEnd
    if (dayEnd.getTime() > Date.now()) {
      const last = await this.repo.getLastDialogueInRange(scopeId, cursor, dayEnd, DIALOGUE_KINDS)
      next = last ? new Date(last.getTime() + 1) : new Date(cursor.getTime() + 1)
    }
    if (next.getTime() <= cursor.getTime()) return
    logger.warn(`topic 归档跳过 scope=${scopeId} 日=${formatTime(cursor, this.tz)}`
      + ` 原因=${reason} 跳过至=${formatTime(next, this.tz)}`)
    await this.repo.setTopicStart(scopeId, next)
  }

  /**
   * 按自然日消费积压：每次归档一个日块，直到预算用完。
   * - 全是空白的日期用一次查询跨过去，不逐天循环；
   * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
   * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
   */
  private async drainTopics(scopeId: string, user: User | null, budget: CallBudget): Promise<boolean> {
    if (isGroupScope(scopeId)) return this.drainGroupBlocks(scopeId, budget)
    if (this.config.dryRun) {
      const meta = await this.repo.ensureMeta(scopeId)
      const [next] = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: DIALOGUE_KINDS, limit: 1,
      })
      if (next) logger.info(`[dry-run] 将归档 scope=${scopeId} 起点=${formatTime(next.createdAt, this.tz)}`)
      return false
    }

    while (budget.calls > 0) {
      const meta = await this.repo.ensureMeta(scopeId)
      const cursor = new Date(meta.topicStart)
      const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour)

      // 一次查询跨过整段没有对话的日期
      const [next] = await this.repo.getDialoguesAfter(scopeId, cursor, {
        kinds: DIALOGUE_KINDS, limit: 1,
      })
      if (!next) {
        const todayStart = dayStart(new Date(), this.tz, this.boundaryHour)
        if (todayStart.getTime() > cursor.getTime()) {
          await this.repo.setTopicStart(scopeId, todayStart)
        }
        return true
      }
      const nextDay = dayStart(new Date(next.createdAt), this.tz, this.boundaryHour)
      if (nextDay.getTime() > cursor.getTime()) {
        await this.repo.setTopicStart(scopeId, nextDay)
        continue
      }

      if (dayEnd.getTime() > Date.now()) {
        const ageHours = (Date.now() - cursor.getTime()) / HOUR_MS
        if (ageHours < TOPIC_MAX_AGE_HOURS) return true
      }

      // 1) 连续稀疏日合并成一次调用：大量历史日每天只有几条对话，
      //    逐日请求单次延迟约 20 秒，合并后能省下 3–5 倍调用。
      if ((this.batchCooldown.get(scopeId) || 0) <= Date.now()) {
        const blocks = await this.collectArchiveBlocks(scopeId, cursor)
        if (blocks.length >= 2) {
          const outcome = await this.archiveBlocksLocked(scopeId, user, blocks)
          budget.calls -= 1
          if (outcome === 'ok') {
            this.topicFailures.delete(this.dayKey(scopeId, cursor))
            continue
          }
          // 合并归档不可用时退回单日路径：一次格式错误或某个坏日
          // 不该让整条归档链停在这里。
          this.batchCooldown.set(scopeId, Date.now() + BATCH_COOLDOWN_MS)
          if (budget.calls <= 0) return false
        }
      }

      // 2) 单日归档：重日、稀疏日不足两天以及合并失败时的兜底
      const outcome = await this.archiveTopicLocked(scopeId, user)
      budget.calls -= 1
      if (outcome === 'ok') {
        this.topicFailures.delete(this.dayKey(scopeId, cursor))
        continue
      }
      if (outcome === 'empty') return false

      // 内容审核拒绝重试无意义，立即跳过；其他错误连续失败到阈值再跳过，
      // 避免某一天把整个 scope 的积压永久堵住。
      const key = this.dayKey(scopeId, cursor)
      const failures = (this.topicFailures.get(key) || 0) + 1
      if (outcome === 'rejected' || failures >= TOPIC_SKIP_AFTER_FAILURES) {
        await this.skipDay(scopeId, cursor, dayEnd, outcome === 'rejected'
          ? '内容被模型审核拒绝'
          : `连续失败 ${failures} 次`)
        this.topicFailures.delete(key)
        continue
      }
      this.topicFailures.set(key, failures)
      logger.debug(`topic 归档失败 scope=${scopeId} 日=${formatTime(cursor, this.tz)}`
        + ` 第 ${failures}/${TOPIC_SKIP_AFTER_FAILURES} 次`)
      return false
    }
    return false
  }

  // ---------- 群聊时间块 ----------

  /**
   * 群聊的归档游标推进：块尾之后 1ms。
   * 群里同一毫秒可能有多条消息，用 `$gt` 时不能停在块尾的时间戳上，
   * 否则会把同一毫秒里排在后面的消息漏掉。
   */
  private async groupNextCursor(
    scopeId: string,
    block: SatDialogue[],
    dayEnd: Date,
  ): Promise<Date> {
    const last = block[block.length - 1]
    let next = new Date(new Date(last.createdAt).getTime() + 1)
    // 这一天已经结束且没有剩余消息时直接推到日界线，day 级据此判定该日已归档完整
    if (dayEnd.getTime() <= Date.now()) {
      const remaining = await this.repo.countDialoguesInRange(scopeId, next, dayEnd, GROUP_KINDS)
      if (!remaining) next = dayEnd
    }
    return next
  }

  /**
   * 按时间块消费群聊积压。每块一次模型调用，热路径上没有任何判断调用。
   * 未闭合的块（还在沉默阈值内）留到下一轮心跳。
   */
  private async drainGroupBlocks(scopeId: string, budget: CallBudget): Promise<boolean> {
    if (this.config.dryRun) {
      const meta = await this.repo.ensureMeta(scopeId)
      const [next] = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: GROUP_KINDS, limit: 1,
      })
      if (next) {
        logger.info(`[dry-run] 将归档群聊 scope=${scopeId} 起点=${formatTime(next.createdAt, this.tz)}`)
      }
      return false
    }

    while (budget.calls > 0) {
      const meta = await this.repo.ensureMeta(scopeId)
      const cursor = new Date(meta.topicStart)
      const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour)

      // 跨过整段没有消息的日期
      const [next] = await this.repo.getDialoguesAfter(scopeId, cursor, {
        kinds: GROUP_KINDS, limit: 1,
      })
      if (!next) {
        const todayStart = dayStart(new Date(), this.tz, this.boundaryHour)
        if (todayStart.getTime() > cursor.getTime()) {
          await this.repo.setTopicStart(scopeId, todayStart)
        }
        return true
      }
      const nextDay = dayStart(new Date(next.createdAt), this.tz, this.boundaryHour)
      if (nextDay.getTime() > cursor.getTime()) {
        await this.repo.setTopicStart(scopeId, nextDay)
        continue
      }

      // 多取一条用来判断块尾之后是否还有消息
      const rows = await this.repo.getDialoguesAfter(scopeId, cursor, {
        kinds: GROUP_KINDS,
        limit: GROUP_MAX_MESSAGES + 1,
        before: dayEnd,
      })
      const { block, closed } = selectGroupBlock(rows, dayEnd, new Date(), {
        minMessages: GROUP_MIN_BLOCK_MESSAGES,
      })
      if (!block.length) return false
      if (!closed) return true

      const key = `${scopeId}:${block[0].id}`
      const nextCursor = await this.groupNextCursor(scopeId, block, dayEnd)
      // 不足最小条数的块不归档，也不花模型调用：直接推进游标，等更密的消息攒成下一块
      if (block.length < GROUP_MIN_BLOCK_MESSAGES) {
        await this.repo.setTopicStart(scopeId, nextCursor)
        logger.info(`群聊时间块不足 ${GROUP_MIN_BLOCK_MESSAGES} 条，跳过 scope=${scopeId}`
          + ` 消息=${block.length}`
          + ` 起=${formatTime(block[0].createdAt, this.tz)}`
          + ` 止=${formatTime(block[block.length - 1].createdAt, this.tz)}`)
        continue
      }
      const outcome = await this.archiveGroupBlock(scopeId, block, nextCursor)
      budget.calls -= 1
      if (outcome === 'ok' || outcome === 'empty') {
        this.topicFailures.delete(key)
        continue
      }

      // 与按人记忆同一套容错：审核拒绝立即跳过，其他错误连续失败到阈值再跳过，
      // 避免一个坏块把整个群的归档永久堵住。
      const failures = (this.topicFailures.get(key) || 0) + 1
      if (outcome === 'rejected' || failures >= TOPIC_SKIP_AFTER_FAILURES) {
        await this.repo.setTopicStart(scopeId, nextCursor)
        this.topicFailures.delete(key)
        logger.warn(`群聊时间块跳过 scope=${scopeId} 起点=${formatTime(block[0].createdAt, this.tz)}`
          + ` 原因=${outcome === 'rejected' ? '内容被模型审核拒绝' : `连续失败 ${failures} 次`}`)
        continue
      }
      this.topicFailures.set(key, failures)
      return false
    }
    return false
  }

  /** 一个时间块归档为一条 topic 记忆 */
  private async archiveGroupBlock(
    scopeId: string,
    rows: SatDialogue[],
    nextCursor: Date,
  ): Promise<ArchiveOutcome> {
    const compact = compressGroupRows(rows)
    if (!compact.length) {
      // 全是被过滤掉的短句或长文：不花调用，直接把游标推过去
      await this.repo.setTopicStart(scopeId, nextCursor)
      logger.debug(`群聊时间块没有可归档内容 scope=${scopeId} 消息=${rows.length}`)
      return 'empty'
    }

    const text = formatGroupRows(compact, this.tz, { botLabel: this.botName })
    let result = await this.api.auxiliaryChat(buildGroupArchivePrompt(text, this.botName), null)
    if (result.error && isRejectedContent(result.content)) {
      logger.warn(`群聊归档被内容审核拒绝，改用脱敏输入重试 scope=${scopeId}`)
      result = await this.api.auxiliaryChat(buildGroupArchivePrompt(redactSensitiveText(text), this.botName), null)
    }
    if (result.error) {
      logger.warn(`群聊归档失败 scope=${scopeId}: ${result.content}`)
      return isRejectedContent(result.content) ? 'rejected' : 'failed'
    }

    const parsed = parseLlmJson<GroupArchiveResult>(result.content)
    const summary = parsed?.summary?.trim()
    if (!summary) {
      logger.warn(`群聊归档解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return 'failed'
    }

    const first = rows[0]
    const last = rows[rows.length - 1]
    await this.repo.commitTopicArchive({
      scopeId,
      granularity: 'topic',
      topic: (parsed.topic || '').trim(),
      content: summary,
      userState: (parsed.group_state || '').trim(),
      periodStart: new Date(first.createdAt),
      periodEnd: new Date(last.createdAt),
      sourceCount: rows.length,
      createdAt: new Date(),
    }, scopeId, nextCursor)

    logger.info(`群聊时间块归档完成 scope=${scopeId} 消息=${rows.length} 压缩后=${compact.length}`
      + ` 起=${formatTime(first.createdAt, this.tz)} 止=${formatTime(last.createdAt, this.tz)}`)
    return 'ok'
  }

  // ---------- 分层汇总 ----------

  async summarizeScope(scopeId: string): Promise<void> {
    return this.runExclusive(scopeId, async () => {
      const user = await this.lookupUser(scopeId)
      await this.repo.touchMeta(scopeId)

      const total = Math.max(2, this.config.maxCallsPerTick ?? DEFAULT_MAX_CALLS_PER_TICK)
      // 归档与层级各分一半预算：否则积压时 topic 会把预算吃光，层级永远不前进
      const archiveQuota = Math.max(1, Math.floor(total / 2))
      const archiveBudget: CallBudget = { calls: archiveQuota }
      const drained = await this.drainTopics(scopeId, user, archiveBudget)

      const levelBudget: CallBudget = {
        calls: Math.max(1, total - (archiveQuota - archiveBudget.calls)),
      }
      const levelsDone = await this.buildLevels(scopeId, user, levelBudget)

      // 只有「话题归档完 + 各层追平」才算积压结束：这时用高层汇总补一次画像，
      // 把被窗口跳过的旧历史一次性归纳进来，每个 scope 只多花一次调用。
      if (drained && levelsDone) {
        await this.backfillProfile(scopeId, user, levelBudget)
      }
    })
  }

  /** 群 scope 用群画像，按人 scope 用个人画像；群画像未启用时返回 null */
  private profileFor(scopeId: string): ProfileManager | null {
    return isGroupScope(scopeId) ? (this.config.groupProfile ?? null) : this.profile
  }

  /** 用金字塔里的高层汇总做一次性画像回填 */
  private async backfillProfile(scopeId: string, user: User | null, budget: CallBudget): Promise<void> {
    if (this.config.dryRun) return
    const profile = this.profileFor(scopeId)
    if (!profile?.isEnabled() || budget.calls <= 0) return
    if (await profile.isBackfilled(scopeId)) return
    // 被内容审核拒绝过的 scope 在冷却期内不再发起回填，也不打日志
    if (profile.isCoolingDown(scopeId)) return

    const windowStart = profile.windowStart()
    // 窗口不限制时没有「被跳过的旧历史」，不需要回填
    if (!windowStart) return

    const sections = await this.collectBackfillSections(scopeId, windowStart)
    if (!sections.length) return

    logger.info(`画像历史回填 scope=${scopeId} 选材=${sections[0].label}`)
    budget.calls -= 1
    await profile.backfill(scopeId, sections, isGroupScope(scopeId) ? null : user)
  }

  /**
   * 选材：优先用最近的一季汇总（覆盖约三个月），没有就退到月、周。
   * 年汇总刻意不用：它通常只覆盖上一个完整自然年，信息过旧。
   */
  private async collectBackfillSections(
    scopeId: string,
    before: Date,
  ): Promise<{ label: string, content: string }[]> {
    const levels: { level: Granularity, label: string }[] = [
      { level: 'season', label: '最近一季总结' },
      { level: 'month', label: '最近一月总结' },
      { level: 'week', label: '最近一周总结' },
    ]
    for (const { level, label } of levels) {
      const node = await this.repo.getLatestMemoryBefore(scopeId, level, before)
      if (node?.content) return [{ label, content: node.content }]
    }
    return []
  }

  /**
   * 自下而上补齐已闭合的周期，每个周期最多一条节点。
   *
   * 起算点来自该层最新节点的 periodEnd（没有则取最早子节点所在周期），
   * 因此不会重复生成同一周期；空周期没有子节点，会被自然跳过。
   * 周期末尾晚于归档游标时说明周期内的对话还没归档完，立即停止该层。
   */
  private async buildLevels(scopeId: string, user: User | null, budget: CallBudget): Promise<boolean> {
    const meta = await this.repo.ensureMeta(scopeId)
    const frontier = new Date(meta.topicStart)
    const group = isGroupScope(scopeId)
    const profile = this.profileFor(scopeId)

    for (const level of LEVEL_ORDER) {
      let nodes = 0
      // 本层是否已经「追平」归档游标。只有追平了才允许上一层继续：
      // 否则预算/节点上限可能让某一层只建了一半子节点，上一层会把
      // 缺了子记忆的周期当成完整周期汇总（周少一天、月少一周）。
      let reached = false
      while (nodes < MAX_LEVEL_NODES_PER_TICK) {
        const parent = await this.repo.getLatestMemory(scopeId, level)
        const from = parent ? new Date(parent.periodEnd) : null

        const [child] = await this.repo.getMemoriesInRange(
          scopeId, CHILD_OF[level], from, frontier, 1,
        )
        if (!child) {
          reached = true
          break
        }

        // 子项按 periodEnd 归入周期：自然周可能跨月/跨季/跨年（例如 8/31~9/7
        // 的周节点属于 9 月），它恰好只落入一个父周期，不会重复。
        // 用 periodEnd - 1ms 判定：结束时间正好落在周期边界上的子项属于
        // 前一个周期（区间是左开右闭）。
        const start = periodStart(level, new Date(new Date(child.periodEnd).getTime() - 1), this.tz, this.boundaryHour)
        const end = periodEnd(level, start, this.tz, this.boundaryHour)
        // 周期还没闭合：周期内可能还有没归档的对话，等下一轮
        if (end.getTime() > frontier.getTime()) {
          reached = true
          break
        }

        // left open / right closed：结束于周期起点的子项属于上一个周期
        const children = await this.repo.getMemoriesInRange(
          scopeId, CHILD_OF[level], start, end,
        )
        if (!children.length) break

        // topic -> day 是唯一需要额外校验的一层：topic 必须完全落在同一个
        // 自然日内，旧版按 200 条切块会跨日，遇到时宁可停下也不生成错误边界。
        if (level === 'day') {
          const stray = children.find(row => dayStart(new Date(row.periodStart), this.tz, this.boundaryHour).getTime()
            !== dayStart(new Date(new Date(row.periodEnd).getTime() - 1), this.tz, this.boundaryHour).getTime())
          if (stray) {
            logger.warn(`day 汇总暂停：存在跨日 topic 记忆 scope=${scopeId}`
              + ` 记忆区间=${formatTime(stray.periodStart, this.tz)} ~ ${formatTime(stray.periodEnd, this.tz)}`)
            break
          }
        }

        const range = `${formatTime(start, this.tz)} ~ ${formatTime(end, this.tz)}`
        const totalChars = children.reduce((sum, child) => sum + (child.content || '').length, 0)
        // 单条子记忆，或正文总和很短时，直接拼成父节点，不必再花一次模型调用
        const promoteDirectly = children.length === 1 || totalChars <= PROMOTE_DIRECT_MAX_CHARS
        // 历史回填的旧日节点不更新画像：既省下大量模型调用，也避免把
        // 几个月前的信息当成用户近况反复写回。
        const profileUpdate = level === 'day' && !!profile?.shouldUpdate(end)

        if (promoteDirectly) {
          const content = children.map(child => child.content || '').join('\n')
          if (this.config.dryRun) {
            logger.info(`[dry-run] ${level} 晋升 scope=${scopeId} 周期=${range}`
              + ` 子记忆=${children.length} 正文=${totalChars}`)
            return false
          }
          if (profileUpdate && profile) {
            if (budget.calls <= 0) return false
            budget.calls -= 1
            await profile.summarize(scopeId, content, children, group ? null : user, end)
          }
          // 多条合并晋升时，用户状态取最近一条非空的
          const state = [...children].reverse().find(child => child.userState)?.userState || ''
          await this.repo.createMemory({
            scopeId,
            granularity: level,
            topic: '',
            content,
            userState: state,
            periodStart: start,
            periodEnd: end,
            sourceCount: children.length,
            createdAt: new Date(),
          })
          logger.info(`${level} 晋升 scope=${scopeId} 周期=${range} 子记忆=${children.length}`)
          nodes += 1
          continue
        }

        // 多子节点：一次汇总 +（日级且在画像窗口内）一次画像更新
        const need = 1 + (profileUpdate ? 1 : 0)
        if (budget.calls < need) return false

        const input = children.slice(0, MAX_CHILDREN_PER_SUMMARY)
        if (children.length > MAX_CHILDREN_PER_SUMMARY) {
          logger.warn(`${level} 子记忆过多，只汇总前 ${MAX_CHILDREN_PER_SUMMARY} 条 scope=${scopeId}`
            + ` 实际=${children.length}`)
        }
        const text = this.formatChildren(input, group)

        if (this.config.dryRun) {
          logger.info(`[dry-run] ${level} 汇总 scope=${scopeId} 周期=${range} 子记忆=${children.length}`)
          return false
        }

        const result = await this.api.auxiliaryChat(
          group ? buildGroupSummaryPrompt(level, text, this.botName) : buildSummaryPrompt(level, text, this.botName),
          group ? null : user,
        )
        budget.calls -= 1
        if (result.error) {
          logger.warn(`${level} 汇总失败 scope=${scopeId}: ${result.content}`)
          return false
        }

        const parsed = parseLlmJson<SummaryResult & GroupSummaryResult>(result.content)
        const summary = parsed?.summary?.trim()
        if (!summary) {
          logger.warn(`${level} 汇总解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
          return false
        }

        await this.repo.createMemory({
          scopeId,
          granularity: level,
          topic: '',
          content: summary,
          userState: ((group ? parsed.group_state : parsed.user_state) || '').trim(),
          periodStart: start,
          periodEnd: end,
          sourceCount: children.length,
          createdAt: new Date(),
        })
        logger.info(`${level} 汇总完成 scope=${scopeId} 周期=${range} 子记忆=${children.length}`)
        nodes += 1

        if (profileUpdate && profile) {
          budget.calls -= 1
          await profile.summarize(scopeId, summary, children, group ? null : user, end)
        }
      }
      // 没追平（预算耗尽 / 节点上限 / 异常数据）就停在这里，绝不带着
      // 半截子节点去建上一层
      if (!reached) return false
    }
    return true
  }

  // ---------- 工具 ----------

  private formatDialogues(rows: DialogueRow[], user: User | null): string {
    return formatDialogueRows(rows, this.tz, collectArchiveNickNames(this.config.nickNames || [], user), this.botName)
  }

  private formatChildren(children: SatMemory[], group = false): string {
    const stateLabel = group ? '群状态' : '用户状态'
    return children.map((child) => {
      const range = `${formatTime(child.periodStart, this.tz)}`
        + ` ~ ${formatTime(child.periodEnd, this.tz)}`
      const topic = child.topic ? `（${child.topic}）` : ''
      const state = child.userState ? `\n${stateLabel}：${child.userState}` : ''
      return `[${range}]${topic} ${child.content}${state}`
    }).join('\n\n')
  }

  /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
  private async lookupUser(scopeId: string): Promise<User | null> {
    // 群 scope 没有对应的「持票用户」，辅助调用一律走默认线路
    if (isGroupScope(scopeId)) return null
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

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
  /** 每个 scope 每次汇总最多发起多少次辅助模型调用 */
  maxCallsPerTick?: number
  /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
  resolveUser?: (scopeId: string) => Promise<User | null>
}

interface CallBudget {
  calls: number
}

export function formatTime(date: Date, timezoneOffsetHours: number): string {
  const shifted = new Date(new Date(date).getTime() + timezoneOffsetHours * 3_600_000)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${shifted.getUTCFullYear()}/${pad(shifted.getUTCMonth() + 1)}/${pad(shifted.getUTCDate())}`
    + ` ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
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

  constructor(
    private ctx: Context,
    private repo: MemoryRepository,
    private api: APIClient,
    private profile: ProfileManager,
    private config: SummarizerConfig,
  ) {}

  private get tz() { return this.config.timezoneOffset }
  private get boundaryHour() { return this.config.dayBoundaryHour }

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
        kinds: DIALOGUE_KINDS,
        // 只需要判断是否达到阈值，不把迁移后的全部历史读进内存
        limit: TOPIC_MAX_TURNS,
      })
      if (dialogues.length <= TOPIC_MIN_TURNS) return

      let shouldSwitch = dialogues.length >= TOPIC_MAX_TURNS
      if (!shouldSwitch) {
        const text = this.formatDialogues(dialogues)
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
  private async archiveTopicLocked(scopeId: string, user: User | null): Promise<boolean> {
    const meta = await this.repo.ensureMeta(scopeId)
    const cursor = new Date(meta.topicStart)
    // 关键：只看游标所在的那一天，topic 记忆绝不跨日
    const dayEnd = nextDayStart(cursor, this.tz, this.boundaryHour)

    const dialogues = await this.repo.getDialoguesAfter(scopeId, cursor, {
      kinds: DIALOGUE_KINDS,
      limit: MAX_ARCHIVE_DIALOGUES,
      before: dayEnd,
    })
    if (!dialogues.length) return false

    const text = this.formatDialogues(dialogues)
    if (this.config.dryRun) {
      logger.info(`[dry-run] topic 归档 scope=${scopeId} 对话=${dialogues.length} 字符=${text.length}`
        + ` 日=${formatTime(cursor, this.tz)}`)
      return false
    }

    const result = await this.api.auxiliaryChat(buildTopicArchivePrompt(text), user)
    if (result.error) {
      logger.warn(`topic 归档失败 scope=${scopeId}: ${result.content}`)
      return false
    }

    const parsed = parseLlmJson<ArchiveResult>(result.content)
    const summary = parsed?.summary?.trim()
    if (!summary) {
      logger.warn(`topic 归档解析失败 scope=${scopeId}: ${result.content?.slice(0, 200)}`)
      return false
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
    return true
  }

  /**
   * 按自然日消费积压：每次归档一个日块，直到预算用完。
   * - 全是空白的日期用一次查询跨过去，不逐天循环；
   * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
   * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
   */
  private async drainTopics(scopeId: string, user: User | null, budget: CallBudget): Promise<void> {
    if (this.config.dryRun) {
      const meta = await this.repo.ensureMeta(scopeId)
      const [next] = await this.repo.getDialoguesAfter(scopeId, meta.topicStart, {
        kinds: DIALOGUE_KINDS, limit: 1,
      })
      if (next) logger.info(`[dry-run] 将归档 scope=${scopeId} 起点=${formatTime(next.createdAt, this.tz)}`)
      return
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
        return
      }
      const nextDay = dayStart(new Date(next.createdAt), this.tz, this.boundaryHour)
      if (nextDay.getTime() > cursor.getTime()) {
        await this.repo.setTopicStart(scopeId, nextDay)
        continue
      }

      if (dayEnd.getTime() > Date.now()) {
        const ageHours = (Date.now() - cursor.getTime()) / HOUR_MS
        if (ageHours < TOPIC_MAX_AGE_HOURS) return
      }

      const archived = await this.archiveTopicLocked(scopeId, user)
      if (!archived) return
      budget.calls -= 1
    }
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
      await this.drainTopics(scopeId, user, archiveBudget)

      const levelBudget: CallBudget = {
        calls: Math.max(1, total - (archiveQuota - archiveBudget.calls)),
      }
      await this.buildLevels(scopeId, user, levelBudget)
    })
  }

  /**
   * 自下而上补齐已闭合的周期，每个周期最多一条节点。
   *
   * 起算点来自该层最新节点的 periodEnd（没有则取最早子节点所在周期），
   * 因此不会重复生成同一周期；空周期没有子节点，会被自然跳过。
   * 周期末尾晚于归档游标时说明周期内的对话还没归档完，立即停止该层。
   */
  private async buildLevels(scopeId: string, user: User | null, budget: CallBudget): Promise<void> {
    const meta = await this.repo.ensureMeta(scopeId)
    const frontier = new Date(meta.topicStart)

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
        const single = children.length === 1

        if (single) {
          if (this.config.dryRun) {
            logger.info(`[dry-run] ${level} 晋升 scope=${scopeId} 周期=${range} 子记忆=1`)
            return
          }
          // 单子节点内容一致，直接晋升，不必再花一次模型调用
          if (level === 'day' && this.profile.isEnabled()) {
            if (budget.calls <= 0) return
            budget.calls -= 1
            await this.profile.summarize(scopeId, children[0].content, children, user)
          }
          await this.repo.createMemory({
            scopeId,
            granularity: level,
            topic: '',
            content: children[0].content,
            userState: children[0].userState || '',
            periodStart: start,
            periodEnd: end,
            sourceCount: 1,
            createdAt: new Date(),
          })
          logger.info(`${level} 晋升 scope=${scopeId} 周期=${range}`)
          nodes += 1
          continue
        }

        // 多子节点：一次汇总 + （日级）一次画像更新
        const need = 1 + (level === 'day' && this.profile.isEnabled() ? 1 : 0)
        if (budget.calls < need) return

        const input = children.slice(0, MAX_CHILDREN_PER_SUMMARY)
        if (children.length > MAX_CHILDREN_PER_SUMMARY) {
          logger.warn(`${level} 子记忆过多，只汇总前 ${MAX_CHILDREN_PER_SUMMARY} 条 scope=${scopeId}`
            + ` 实际=${children.length}`)
        }
        const text = this.formatChildren(input)

        if (this.config.dryRun) {
          logger.info(`[dry-run] ${level} 汇总 scope=${scopeId} 周期=${range} 子记忆=${children.length}`)
          return
        }

        const result = await this.api.auxiliaryChat(buildSummaryPrompt(level, text), user)
        budget.calls -= 1
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

        await this.repo.createMemory({
          scopeId,
          granularity: level,
          topic: '',
          content: summary,
          userState: (parsed.user_state || '').trim(),
          periodStart: start,
          periodEnd: end,
          sourceCount: children.length,
          createdAt: new Date(),
        })
        logger.info(`${level} 汇总完成 scope=${scopeId} 周期=${range} 子记忆=${children.length}`)
        nodes += 1

        if (level === 'day' && this.profile.isEnabled()) {
          budget.calls -= 1
          await this.profile.summarize(scopeId, summary, children, user)
        }
      }
      // 没追平（预算耗尽 / 节点上限 / 异常数据）就停在这里，绝不带着
      // 半截子节点去建上一层
      if (!reached) return
    }
  }

  // ---------- 工具 ----------

  private formatDialogues(rows: { userContent: string; aiContent: string; username: string; createdAt: Date }[]): string {
    return rows.map((row) => {
      const time = formatTime(row.createdAt, this.tz)
      const user = row.username || '用户'
      const ai = row.aiContent && row.aiContent !== '…' ? `\nAI：${row.aiContent}` : ''
      return `[${time}] ${user}：${row.userContent}${ai}`
    }).join('\n')
  }

  private formatChildren(children: SatMemory[]): string {
    return children.map((child) => {
      const range = `${formatTime(child.periodStart, this.tz)}`
        + ` ~ ${formatTime(child.periodEnd, this.tz)}`
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

// src/memory/group.ts
// 群聊记忆的结构化切块。
//
// 群聊不能沿用按人记忆的「逐条判断话题是否切换」：群里每天几千条消息，
// 每来一条就可能触发一次辅助模型调用，成本会失控。这里改用纯结构判据切块——
// 同一自然日内、间隔不超过 20 分钟的一段连续发言算一块；块内最多 300 条、
// 最长 4 小时，到上限就强制断开。切块本身不花任何模型调用，
// 调用次数只与「消息数 / 块大小」线性相关。
import { SatDialogue } from './schema'
import { oneLine } from './text'

/** 群记忆的 scopeId 前缀。按人记忆用 userId，两者在 sat_* 表里不会撞车 */
export const GROUP_SCOPE_PREFIX = 'g:'
/** 群友发言 */
export const GROUP_MEMBER_KIND = 'ambient'
/** 机器人在群里的发言 */
export const GROUP_BOT_KIND = 'ambient-bot'
export const GROUP_KINDS = [GROUP_MEMBER_KIND, GROUP_BOT_KIND]

/** 一条消息之后沉默超过这么久，这一块就算结束 */
export const GROUP_GAP_MS = 20 * 60_000
/** 一块最多多少条消息；到上限立即闭合，保证每块的模型输入可控 */
export const GROUP_MAX_MESSAGES = 300
/** 一块至少多少条消息才值得归档；不足时跨过短暂的沉默继续攒，攒不够就跳过，绝不调用模型 */
export const GROUP_MIN_BLOCK_MESSAGES = 100
/** 一块最长跨度；超过就断开，避免一段长会话拖成超大块 */
export const GROUP_MAX_SPAN_MS = 4 * 3_600_000
/** 短于此长度的发言没有信息量（“草”“哈哈哈”“？”），归档时丢掉 */
export const GROUP_MIN_MESSAGE_LEN = 4
/** 长于此长度的发言多半是复制粘贴或公告，归档时丢掉以节省 token */
export const GROUP_MAX_MESSAGE_LEN = 200
/** 群聊原始消息只在归档前有用，保留 30 天足够覆盖积压 */
export const GROUP_RETENTION_DAYS = 30

export function isGroupScope(scopeId: string): boolean {
  return !!scopeId && scopeId.startsWith(GROUP_SCOPE_PREFIX)
}

export function groupScopeId(channelId: string): string {
  return GROUP_SCOPE_PREFIX + channelId
}

/**
 * 是否群聊会话。与 middleware 的 isPrivateSession 同一口径：
 * 私聊有两种形态（subtype 或 channelId 前缀），其余都按群聊处理。
 * 群聊记忆只关心「一群人在一起说话」，不区分具体平台。
 */
export function isGroupSession(session: {
  channelId?: string
  subtype?: string
  isDirect?: boolean
}): boolean {
  if (!session?.channelId) return false
  if (session.subtype === 'private') return false
  if (session.channelId.includes('private')) return false
  return !session.isDirect
}

export interface GroupBlockOptions {
  gapMs?: number
  maxMessages?: number
  maxSpanMs?: number
  /** 低于这个条数时跨过沉默间隔继续攒；0 表示不启用 */
  minMessages?: number
}

export interface GroupBlockSelection {
  /** 本次要归档的连续消息（已按 createdAt 升序） */
  block: SatDialogue[]
  /** 块是否已经闭合：闭合才归档，否则等下一轮心跳 */
  closed: boolean
}

/**
 * 从游标开始挑出第一个可归档的时间块。
 *
 * rows 必须按 createdAt 升序、且全部落在同一个自然日内，
 * 调用方应多取一条（limit = maxMessages + 1）用来判断后面是否还有消息。
 *
 * 闭合判据（任一成立）：
 * · 块内已到条数上限——硬切，后面的消息属于下一块；
 * · 取到的消息没被全部用掉——说明已达到最小条数、下一条间隔超过阈值，或触到条数/跨度上限；
 * · 这一天已经结束；
 * · 当天还没结束，但块已达到最小条数、且块尾之后沉默满一个间隔。
 *
 * 不足 minMessages 时沉默间隔不作为断点：继续往后攒，直到够数或触到跨度上限。
 * 攒不够的块闭合后由调用方跳过（推进游标，不调用模型），不会兜底归档。
 */
export function selectGroupBlock(
  rows: SatDialogue[],
  dayEnd: Date,
  now: Date,
  options: GroupBlockOptions = {},
): GroupBlockSelection {
  const gapMs = options.gapMs ?? GROUP_GAP_MS
  const maxMessages = options.maxMessages ?? GROUP_MAX_MESSAGES
  const maxSpanMs = options.maxSpanMs ?? GROUP_MAX_SPAN_MS
  const minMessages = options.minMessages ?? 0

  if (!rows.length) return { block: [], closed: true }

  const block = [rows[0]]
  for (let i = 1; i < rows.length; i++) {
    if (block.length >= maxMessages) break
    const previous = block[block.length - 1]
    const gap = new Date(rows[i].createdAt).getTime() - new Date(previous.createdAt).getTime()
    const span = new Date(rows[i].createdAt).getTime() - new Date(block[0].createdAt).getTime()
    if (span > maxSpanMs) break
    if (gap > gapMs && block.length >= minMessages) break
    block.push(rows[i])
  }

  const hasMore = rows.length > block.length
  const full = block.length >= maxMessages
  const meetsMin = block.length >= minMessages
  const last = block[block.length - 1]
  const dayOver = new Date(dayEnd).getTime() <= new Date(now).getTime()
  const settled = new Date(now).getTime() - new Date(last.createdAt).getTime() >= gapMs

  return { block, closed: hasMore || full || dayOver || (meetsMin && settled) }
}

/**
 * 归档前的抽取式压缩，不调用模型：
 * · 丢掉过短（无信息量）和过长（复制粘贴/公告）的发言；
 * · 同一个人连续发言合并成一行，减少发言人标签的噪音。
 *
 * 只影响送给模型的文本，原始消息仍然完整保留在库里，30 天后统一清理。
 */
export function compressGroupRows(rows: SatDialogue[]): SatDialogue[] {
  const result: SatDialogue[] = []
  for (const row of rows) {
    const text = oneLine(row.userContent)
    if (text.length < GROUP_MIN_MESSAGE_LEN) continue
    if (text.length > GROUP_MAX_MESSAGE_LEN) continue

    const previous = result[result.length - 1]
    if (
      previous
      && previous.kind === row.kind
      && previous.userId === row.userId
      && previous.userContent.length + text.length + 1 <= GROUP_MAX_MESSAGE_LEN
    ) {
      previous.userContent = `${previous.userContent}；${text}`
      continue
    }

    result.push({ ...row, userContent: text })
  }
  return result
}

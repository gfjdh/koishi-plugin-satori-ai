// src/memory/stats.ts
// 近期对话时间与频率感知：把“多久没聊、最近聊了多少”注入系统提示。
// 统计只读 sat_dialogue，实时计算，不写入任何数据。
import { MemoryRepository } from './repository'

const DAY_MS = 86_400_000

/** 只统计用户↔机器人的对话；群聊环境消息不算互动。 */
export const DIALOGUE_STATS_KINDS = ['turn', 'legacy']

function formatDailyAverage(count: number, periodDays: number, since: Date, first: Date, now: Date): string {
  const effectiveStart = since > first ? since : first
  const days = Math.max(1, Math.ceil((now.getTime() - effectiveStart.getTime()) / DAY_MS))
  const divisor = Math.min(days, periodDays)
  return `（日均${(count / divisor).toFixed(1)}轮）`
}

function formatSinceLast(last: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - last.getTime()) / 60_000)
  if (minutes <= 0) return '刚刚'
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}小时`
  return `${Math.floor(hours / 24)}天`
}

/**
 * 生成对话统计段落。没有任何对话时返回空串。
 * 口径与桌宠一致：滚动窗口（近 1 天/7 天/30 天/90 天/365 天），
 * 并按关系时长逐级显示，避免新用户看到一堆 0。
 */
export async function buildDialogueStats(
  repo: MemoryRepository,
  scopeId: string,
  now: Date = new Date(),
): Promise<string> {
  const { first, last } = await repo.getDialogueTimeRange(scopeId, DIALOGUE_STATS_KINDS)
  if (!first) return ''

  const dayAgo = new Date(now.getTime() - DAY_MS)
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)
  const monthAgo = new Date(now.getTime() - 30 * DAY_MS)
  const seasonAgo = new Date(now.getTime() - 90 * DAY_MS)
  const yearAgo = new Date(now.getTime() - 365 * DAY_MS)

  const [dayCount, weekCount, monthCount, seasonCount, yearCount, totalCount] = await Promise.all([
    repo.countDialoguesSince(scopeId, dayAgo, DIALOGUE_STATS_KINDS),
    repo.countDialoguesSince(scopeId, weekAgo, DIALOGUE_STATS_KINDS),
    repo.countDialoguesSince(scopeId, monthAgo, DIALOGUE_STATS_KINDS),
    repo.countDialoguesSince(scopeId, seasonAgo, DIALOGUE_STATS_KINDS),
    repo.countDialoguesSince(scopeId, yearAgo, DIALOGUE_STATS_KINDS),
    repo.countDialoguesSince(scopeId, new Date(0), DIALOGUE_STATS_KINDS),
  ])

  const elapsedDays = Math.max(0, Math.ceil((now.getTime() - first.getTime()) / DAY_MS))

  const lines = ['对话统计（系统实时计算，反映你们近期的互动频率；记忆中类似数字可能已过时，以此为准）：{']
  lines.push(`· 最近一天：${dayCount} 轮`)
  if (elapsedDays >= 1) {
    lines.push(`· 最近一周：${weekCount}${formatDailyAverage(weekCount, 7, weekAgo, first, now)}`)
  }
  if (elapsedDays >= 30) {
    lines.push(`· 最近一月：${monthCount}${formatDailyAverage(monthCount, 30, monthAgo, first, now)}`)
  }
  if (elapsedDays >= 90) {
    lines.push(`· 最近一季：${seasonCount}${formatDailyAverage(seasonCount, 90, seasonAgo, first, now)}`)
  }
  if (elapsedDays >= 365) {
    lines.push(`· 最近一年：${yearCount}${formatDailyAverage(yearCount, 365, yearAgo, first, now)}`)
    lines.push(`· 总对话轮次：${totalCount}${formatDailyAverage(totalCount, Infinity, first, first, now)}`)
  }
  if (last) lines.push(`· 距离上次对话：${formatSinceLast(last, now)}`)
  lines.push('}')
  lines.push('（如果近期互动明显少于以往，可以自然地表达想念和关心，但不要直接念出这些统计数字。）')

  return lines.join('\n') + '\n'
}

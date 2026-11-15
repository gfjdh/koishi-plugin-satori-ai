// src/memory/report-specs.ts
// 群日报/周报/月报/年报的规格。单独放一个文件，避免 prompts 与 group-digest 互相引用。
import { Granularity } from './schema'

export type GroupReportKind = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface GroupReportSpec {
  kind: GroupReportKind
  /** 卡片标题与提示词里的名称 */
  title: string
  /** 「今日最喜欢」或「本期最喜欢」 */
  favoriteLabel: string
  /** 粗粒度优先选材的最高层级；例如周报最高到 day */
  levels: Granularity[]
  /** 提示词要求的总字数范围 */
  targetMin: number
  targetMax: number
  /** 正文硬上限（模型偶尔写超时截断） */
  maxChars: number
  /** 单次请求的输出 token 上限 */
  maxOutputTokens: number
  /** 未归档原始消息上限 */
  maxRawMessages: number
  /** 提示词里概括与点评的建议字数 */
  summaryChars: number
  commentChars: number
  /** 提示词里的时间段称呼 */
  periodLabel: string
}

export const GROUP_REPORT_SPECS: Record<GroupReportKind, GroupReportSpec> = {
  daily: {
    kind: 'daily',
    title: '日报',
    favoriteLabel: '今日最喜欢',
    levels: ['topic'],
    targetMin: 900,
    targetMax: 1100,
    maxChars: 1600,
    maxOutputTokens: 8192,
    maxRawMessages: 600,
    summaryChars: 600,
    commentChars: 250,
    periodLabel: '这段时间',
  },
  weekly: {
    kind: 'weekly',
    title: '周报',
    favoriteLabel: '本期最喜欢',
    levels: ['day', 'topic'],
    targetMin: 1800,
    targetMax: 2200,
    maxChars: 2600,
    maxOutputTokens: 8192,
    maxRawMessages: 1000,
    summaryChars: 1300,
    commentChars: 600,
    periodLabel: '过去一周',
  },
  monthly: {
    kind: 'monthly',
    title: '月报',
    favoriteLabel: '本期最喜欢',
    levels: ['week', 'day', 'topic'],
    targetMin: 2700,
    targetMax: 3300,
    maxChars: 3800,
    maxOutputTokens: 8192,
    maxRawMessages: 1200,
    summaryChars: 2000,
    commentChars: 900,
    periodLabel: '上个月',
  },
  yearly: {
    kind: 'yearly',
    title: '年报',
    favoriteLabel: '本期最喜欢',
    levels: ['month', 'week', 'day', 'topic'],
    targetMin: 3600,
    targetMax: 4400,
    maxChars: 5000,
    maxOutputTokens: 8192,
    maxRawMessages: 1500,
    summaryChars: 2700,
    commentChars: 1200,
    periodLabel: '过去一年',
  },
}

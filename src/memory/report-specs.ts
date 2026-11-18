// src/memory/report-specs.ts
// 群日报/周报/月报/年报的规格。单独放一个文件，避免 prompts 与 group-digest 互相引用。
import { Granularity } from './schema'

export type GroupReportKind = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** 报纸刊名的默认值；实际值由配置项 report_masthead 决定 */
export const DEFAULT_REPORT_MASTHEAD = '心眼报'

/** 「最喜欢」的三档，由模型决定 */
export const REPORT_FAVORITE_TIERS = [
  { label: '有点喜欢', delta: 10 },
  { label: '喜欢', delta: 20 },
  { label: '非常喜欢', delta: 30 },
] as const

export type ReportFavoriteTier = typeof REPORT_FAVORITE_TIERS[number]

/**
 * 把模型写的档位归一化。模型可能写成「非常喜欢」「超级喜欢」「很喜欢」，
 * 都按最高档处理；写成别的词时退回中间档，不会因为用词漂移丢掉奖励。
 */
export function resolveFavoriteTier(label: string): ReportFavoriteTier {
  const text = (label || '').trim()
  if (/非常|超级|特别|很喜欢|最喜欢/.test(text)) return REPORT_FAVORITE_TIERS[2]
  if (/有点|稍微|略|比较/.test(text)) return REPORT_FAVORITE_TIERS[0]
  return REPORT_FAVORITE_TIERS[1]
}

export interface GroupReportSpec {
  kind: GroupReportKind
  /** 卡片标题与提示词里的名称 */
  title: string
  /** 「今日最喜欢」或「本期最喜欢」 */
  favoriteLabel: string
  /** 粗粒度优先选材的最高层级；例如周报最高到 day */
  levels: Granularity[]
  /** 提示词要求的总字数范围（含各栏目，不含标记） */
  targetMin: number
  targetMax: number
  /** 单次请求的输出 token 上限 */
  maxOutputTokens: number
  /** 未归档原始消息上限 */
  maxRawMessages: number
  /** 要闻条数（模型可以自行增减） */
  newsItemCount: number
  /** 单条要闻的建议字数 */
  newsItemChars: number
  /** 单条要闻的硬上限 */
  newsItemMaxChars: number
  /** 点评栏目的建议字数 */
  commentChars: number
  /** 点评栏目的硬上限 */
  commentMaxChars: number
  /** 金句条数区间，由模型在候选里自行决定 */
  quoteMin: number
  quoteMax: number
  /** 活跃榜条数 */
  rankingCount: number
  /** 热词个数 */
  hotwordCount: number
  /** 提示词里的时间段称呼 */
  periodLabel: string
  /**
   * 活跃榜标题。原始群消息只保留 30 天，年报的条数其实只覆盖最近一个月，
   * 不能自称全年活跃榜。
   */
  rankingLabel: string
}

export const GROUP_REPORT_SPECS: Record<GroupReportKind, GroupReportSpec> = {
  daily: {
    kind: 'daily',
    title: '日报',
    favoriteLabel: '今日最喜欢',
    levels: ['topic'],
    targetMin: 1200,
    targetMax: 1500,
    maxOutputTokens: 8192,
    maxRawMessages: 600,
    newsItemCount: 3,
    newsItemChars: 240,
    newsItemMaxChars: 450,
    commentChars: 300,
    commentMaxChars: 500,
    quoteMin: 2,
    quoteMax: 4,
    rankingCount: 3,
    hotwordCount: 4,
    periodLabel: '这段时间',
    rankingLabel: '活跃榜',
  },
  weekly: {
    kind: 'weekly',
    title: '周报',
    favoriteLabel: '本期最喜欢',
    levels: ['day', 'topic'],
    targetMin: 2000,
    targetMax: 2500,
    maxOutputTokens: 8192,
    maxRawMessages: 1000,
    newsItemCount: 4,
    newsItemChars: 320,
    newsItemMaxChars: 550,
    commentChars: 550,
    commentMaxChars: 850,
    quoteMin: 3,
    quoteMax: 5,
    rankingCount: 3,
    hotwordCount: 4,
    periodLabel: '过去一周',
    rankingLabel: '本周活跃榜',
  },
  monthly: {
    kind: 'monthly',
    title: '月报',
    favoriteLabel: '本期最喜欢',
    levels: ['week', 'day', 'topic'],
    targetMin: 3000,
    targetMax: 3600,
    maxOutputTokens: 8192,
    maxRawMessages: 1200,
    newsItemCount: 5,
    newsItemChars: 380,
    newsItemMaxChars: 650,
    commentChars: 800,
    commentMaxChars: 1200,
    quoteMin: 3,
    quoteMax: 5,
    rankingCount: 3,
    hotwordCount: 5,
    periodLabel: '上个月',
    rankingLabel: '本月活跃榜',
  },
  yearly: {
    kind: 'yearly',
    title: '年报',
    favoriteLabel: '本期最喜欢',
    levels: ['month', 'week', 'day', 'topic'],
    targetMin: 4000,
    targetMax: 4800,
    maxOutputTokens: 8192,
    maxRawMessages: 1500,
    newsItemCount: 6,
    newsItemChars: 430,
    newsItemMaxChars: 750,
    commentChars: 1100,
    commentMaxChars: 1600,
    quoteMin: 4,
    quoteMax: 6,
    rankingCount: 3,
    hotwordCount: 5,
    periodLabel: '过去一年',
    // 原始消息只保留 30 天，榜单条数反映的是最近一个月
    rankingLabel: '近期活跃榜',
  },
}

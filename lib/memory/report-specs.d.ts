import { Granularity } from './schema';
export type GroupReportKind = 'daily' | 'weekly' | 'monthly' | 'yearly';
/** 报纸刊名的默认值；实际值由配置项 report_masthead 决定 */
export declare const DEFAULT_REPORT_MASTHEAD = "\u5FC3\u773C\u62A5";
/** 「最喜欢」的三档，由模型决定 */
export declare const REPORT_FAVORITE_TIERS: readonly [{
    readonly label: "有点喜欢";
    readonly delta: 10;
}, {
    readonly label: "喜欢";
    readonly delta: 20;
}, {
    readonly label: "非常喜欢";
    readonly delta: 30;
}];
export type ReportFavoriteTier = typeof REPORT_FAVORITE_TIERS[number];
/**
 * 把模型写的档位归一化。模型可能写成「非常喜欢」「超级喜欢」「很喜欢」，
 * 都按最高档处理；写成别的词时退回中间档，不会因为用词漂移丢掉奖励。
 */
export declare function resolveFavoriteTier(label: string): ReportFavoriteTier;
export interface GroupReportSpec {
    kind: GroupReportKind;
    /** 卡片标题与提示词里的名称 */
    title: string;
    /** 「今日最喜欢」或「本期最喜欢」 */
    favoriteLabel: string;
    /** 粗粒度优先选材的最高层级；例如周报最高到 day */
    levels: Granularity[];
    /** 提示词要求的总字数范围（含各栏目，不含标记） */
    targetMin: number;
    targetMax: number;
    /** 单次请求的输出 token 上限 */
    maxOutputTokens: number;
    /** 未归档原始消息上限 */
    maxRawMessages: number;
    /** 要闻条数（模型可以自行增减） */
    newsItemCount: number;
    /** 单条要闻的建议字数 */
    newsItemChars: number;
    /** 单条要闻的硬上限 */
    newsItemMaxChars: number;
    /** 点评栏目的建议字数 */
    commentChars: number;
    /** 点评栏目的硬上限 */
    commentMaxChars: number;
    /** 金句条数区间，由模型在候选里自行决定 */
    quoteMin: number;
    quoteMax: number;
    /** 活跃榜条数 */
    rankingCount: number;
    /** 热词个数 */
    hotwordCount: number;
    /** 提示词里的时间段称呼 */
    periodLabel: string;
    /**
     * 活跃榜标题。原始群消息只保留 30 天，年报的条数其实只覆盖最近一个月，
     * 不能自称全年活跃榜。
     */
    rankingLabel: string;
}
export declare const GROUP_REPORT_SPECS: Record<GroupReportKind, GroupReportSpec>;

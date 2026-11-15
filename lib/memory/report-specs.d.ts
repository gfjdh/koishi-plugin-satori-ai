import { Granularity } from './schema';
export type GroupReportKind = 'daily' | 'weekly' | 'monthly' | 'yearly';
export interface GroupReportSpec {
    kind: GroupReportKind;
    /** 卡片标题与提示词里的名称 */
    title: string;
    /** 「今日最喜欢」或「本期最喜欢」 */
    favoriteLabel: string;
    /** 粗粒度优先选材的最高层级；例如周报最高到 day */
    levels: Granularity[];
    /** 提示词要求的总字数范围 */
    targetMin: number;
    targetMax: number;
    /** 正文硬上限（模型偶尔写超时截断） */
    maxChars: number;
    /** 单次请求的输出 token 上限 */
    maxOutputTokens: number;
    /** 未归档原始消息上限 */
    maxRawMessages: number;
    /** 提示词里概括与点评的建议字数 */
    summaryChars: number;
    commentChars: number;
    /** 提示词里的时间段称呼 */
    periodLabel: string;
}
export declare const GROUP_REPORT_SPECS: Record<GroupReportKind, GroupReportSpec>;

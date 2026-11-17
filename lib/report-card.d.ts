import { ReportSections } from './memory/group-digest';
export interface ReportCardStats {
    messages: number;
    nodes: number;
    participants: number;
}
export interface ReportCardRanking {
    name: string;
    count: number;
    comment: string;
}
export interface ReportCardInput {
    /** 刊名，如「心眼报」 */
    masthead: string;
    /** 群日报 / 群周报 / 群月报 / 群年报 */
    kindTitle: string;
    /** 2026.11.18 */
    dateLabel: string;
    /** 第几期；0 表示不显示 */
    issue: number;
    /** 报告覆盖的时间范围 */
    range: string;
    stats: ReportCardStats;
    /** 最近 24 小时每小时消息数，索引 0-23 */
    hourly: number[];
    sections: ReportSections;
    ranking: ReportCardRanking[];
    /** 活跃榜标题（年报只反映最近 30 天） */
    rankingLabel: string;
    /** 报尾署名与点评落款 */
    footerName: string;
    /** 报尾生成时间 */
    footerTime: string;
}
export declare function renderReportHtml(input: ReportCardInput): string;

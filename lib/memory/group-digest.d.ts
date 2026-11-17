import { Granularity, SatDialogue, SatMemory } from './schema';
import { GroupReportKind } from './report-specs';
/** 由粗到细；topic 是最后一级 */
export declare const DIGEST_LEVELS: Granularity[];
/** 日报正文的硬上限；周/月/年报的上限在 report-specs.ts 里 */
export declare const DAILY_DIGEST_MAX_CHARS = 1600;
/** 「省流 -d/-m/-y」给出的范围；多个单位同时给出时依次往前推 */
export interface DigestRange {
    days?: number;
    months?: number;
    years?: number;
}
/**
 * 「最近 N 天/月/年」的起点。
 * 天按滚动小时数（-d 5 = 往前 120 小时），月/年按日历（-m 1 是同一个日期上个月，
 * 目标月份没有这一天时取当月最后一天）。多个单位同时给出时累加。
 */
export declare function digestRangeStart(now: Date, timezoneOffset: number, range: DigestRange): Date;
export declare function hasDigestRange(range?: DigestRange): boolean;
export interface ReportPeriod {
    kind: GroupReportKind;
    /** 日报为 null，由上次日报游标决定；其余为固定自然周期起点 */
    from: Date | null;
    /** 报告覆盖的终点（自然周期是已闭合的零点，日报是当前时刻） */
    to: Date;
}
/**
 * 按执行时刻判断该出哪种报告，并给出自然周期范围。
 *
 * 日期判定按本地零点：周一 00:00 之后就是周一，1 号 00:00 之后就是 1 号。
 * 记忆金字塔自己的日界线（默认 04:00）不参与报告类型判断；周期末尾的
 * 最后几个小时如果还没形成日节点，会自然退回话题/原始消息。
 * 优先级：年 > 月 > 周 > 日（1 月 1 日只出年报，1 号只出月报，周一才出周报）。
 */
export declare function resolveReportPeriod(now: Date, timezoneOffset: number): ReportPeriod;
/**
 * 按「粗粒度优先」挑出覆盖 (from, now] 的记忆节点。
 *
 * 每取完一级就把游标推到该级最后一个节点的末尾，下一级只补之后的空档。
 * 最早那个节点的 periodStart 可能早于 from——这是允许的，粗粒度记忆本来
 * 就是整段整段的（例如用户昨天中午发言，昨天的日节点仍然纳入）。
 *
 * fetchNodes 由调用方绑定到具体的数据源，便于离线测试。
 */
export declare function selectDigestNodes(from: Date, now: Date, fetchNodes: (level: Granularity, after: Date, to: Date) => Promise<SatMemory[]>, levels?: Granularity[]): Promise<{
    nodes: SatMemory[];
    cursor: Date;
}>;
export interface DigestFormatOptions {
    /** 提问者 userId：原始消息里标出他的发言，避免张冠李戴 */
    requesterId?: string;
}
export declare function formatDigestMaterials(nodes: SatMemory[], rows: SatDialogue[], timezoneOffset: number, options?: DigestFormatOptions): string;
/** 概要只需要一段话：去掉代码块、压平换行；篇幅由提示词约束，不在这里硬截断 */
export declare function cleanDigest(text: string): string;
export interface DailyDigestParsed {
    /** 去掉「今日/本期最喜欢」标记后的正文 */
    body: string;
    /** 模型选中的群友昵称；没有选或没按格式输出时为空字符串 */
    favorite: string;
}
/**
 * 拆出报告正文和末尾的「今日/本期最喜欢」标记。
 *
 * 标记是模型输出里的元数据，不能出现在卡片上。模型可能写成
 * 「【今日最喜欢】昵称」或「【本期最喜欢：昵称】」，前后还可能带省略号、
 * 句号；标记单独一行或跟在最后一段末尾都要能处理。
 */
export declare function parseDailyDigest(text: string): DailyDigestParsed;
/**
 * 群日报的正文清洗：保留段落换行（卡片是 pre-wrap），压缩多余空行，
 * 超出上限时尽量在句末截断，避免把一句话劈成两半。
 */
export declare function clampDailyDigest(text: string, max?: number): string;
/** 区间内发过言的群友，用于把模型选出的昵称映射回 userId */
export interface DigestParticipant {
    userId: string;
    username: string;
    count: number;
}
/**
 * 把模型选出的昵称映射回群友。模型可能改写昵称（去括号、加句号、用简称），
 * 所以先精确匹配，再退到包含匹配；多个候选时取发言最多的那个。
 */
export declare function resolveDigestFavorite(choice: string, participants: DigestParticipant[]): DigestParticipant | null;

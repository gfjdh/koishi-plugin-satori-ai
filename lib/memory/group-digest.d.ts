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
    /** 报告覆盖的起点：日报是前一天 00:00，周/月/年报是对应自然周期起点 */
    from: Date;
    /** 报告覆盖的终点（自然周期是已闭合的零点，日报是当天 00:00） */
    to: Date;
}
/**
 * 按执行时刻判断该出哪种报告，并给出自然周期范围。
 *
 * 日期判定按本地零点：周一 00:00 之后就是周一，1 号 00:00 之后就是 1 号。
 * 记忆金字塔自己的日界线（默认 04:00）不参与报告类型判断；周期末尾的
 * 最后几个小时如果还没形成日节点，会自然退回话题/原始消息。
 * 优先级：年 > 月 > 周 > 日（1 月 1 日只出年报，1 号只出月报，周一才出周报）。
 *
 * 日报固定取「前一天 00:00 ~ 当天 00:00」，不看上次报告时间；
 * 同一天重复执行会重新生成同一段内容，不依赖游标。
 */
export declare function resolveReportPeriod(now: Date, timezoneOffset: number): ReportPeriod;
/**
 * 指定报告类型时的周期（预览与测试用）。
 * 与 resolveReportPeriod 不同，这里取「当前时刻所在」的自然月/年，
 * 方便用当前数据预览月报/年报；weekly 仍取最近一个已闭合的周一。
 */
export declare function resolvePeriodOfKind(kind: GroupReportKind, now: Date, timezoneOffset: number): ReportPeriod;
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
/** 去掉代码块、统一换行、压缩多余空行；不做截断 */
export declare function normalizeBody(text: string): string;
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
export interface ReportQuote {
    text: string;
    speaker: string;
    /** 角色对这句的短评 */
    comment: string;
}
export interface ReportRankingEntry {
    name: string;
    comment: string;
}
/** 一条要闻：小标题 + 正文（可多段） */
export interface ReportNewsItem {
    title: string;
    body: string;
}
export interface ReportFavorite {
    name: string;
    /** 有点喜欢 / 喜欢 / 非常喜欢 */
    tier: string;
    /** 10 / 20 / 30 */
    delta: number;
    reason: string;
}
export interface ReportSections {
    /** 是否识别出分节标记；false 时只使用 fallback */
    structured: boolean;
    headline: string;
    lead: string;
    news: ReportNewsItem[];
    quotes: ReportQuote[];
    comment: string;
    hotwords: string[];
    ranking: ReportRankingEntry[];
    favorite: ReportFavorite | null;
    /** 结构化失败时的原始正文 */
    fallback: string;
}
/**
 * 把模型输出的分节报纸拆成栏目。
 *
 * 完全按标记解析；只要拿到要闻且至少有两个标记就认为结构化成功，
 * 缺的栏目留空由渲染器跳过。解析不到标记时整段原文放进 fallback，
 * 渲染器退回旧的整块正文样式，不会因为格式漂移导致整张图发不出去。
 */
export declare function parseReportSections(text: string): ReportSections;
export interface QuoteCandidate {
    text: string;
    /** 第一个说这句话的群友 */
    speaker: string;
    /** 被复读的总次数（含第一次） */
    count: number;
    time: Date;
}
/**
 * 候选条数：按当期总消息数取对数，1500 条拟合到 150 条。
 * 100 条 -> 69，1500 条 -> 150，1 万条 -> 171，4.5 万条 -> 192。
 */
export declare function quoteCandidateCount(total: number): number;
/**
 * 从区间内的群友消息里抽金句候选。
 *
 * 相同内容去重，记录被复读的总次数，发言人取第一个说这句话的群友；
 * 超过上限时按时间分 24 桶轮流取，避免候选全挤在某个时段。
 */
export declare function buildQuoteCandidates(rows: SatDialogue[], total: number, from: Date, to: Date): QuoteCandidate[];
/** 金句候选的提示词格式：MM/DD HH:mm 昵称：原话（复读 N 次） */
export declare function formatQuoteCandidates(candidates: QuoteCandidate[], timezoneOffset: number): string;

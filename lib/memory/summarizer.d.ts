import { Context } from 'koishi';
import { APIClient } from '../api';
import { User } from '../types';
import { MemoryRepository } from './repository';
import { ProfileManager } from './profile';
export declare const TOPIC_MIN_TURNS = 5;
export declare const TOPIC_MAX_TURNS = 20;
export declare const TOPIC_MAX_AGE_HOURS = 24;
export declare const MAX_ARCHIVE_DIALOGUES = 200;
/**
 * 合并归档：一次调用最多覆盖多少个自然日。
 * 实测 5 天是吞吐拐点：再往上模型输出变长、单次延迟上升，
 * 每天摊到的耗时反而增加（10 天实测约 47 scope-day/分，5 天约 80）。
 */
export declare const MAX_BATCH_DAYS = 5;
/** 收集时最多向前走多少个自然日（中间可能有空白日期） */
export declare const MAX_BATCH_WALK_DAYS: number;
/** 参与合并的单日对话数上限；超过的日子单独走单日归档 */
export declare const BATCH_DAY_MAX_DIALOGUES = 30;
/** 一次合并归档的对话总数上限 */
export declare const BATCH_TOTAL_MAX_DIALOGUES = 80;
/** 同一天连续失败多少次后跳过，避免一个坏日堵死整个 scope */
export declare const TOPIC_SKIP_AFTER_FAILURES = 3;
export declare const MAX_CHILDREN_PER_SUMMARY = 100;
/** 单个 scope 一次心跳里最多建立多少个层级节点，防止历史积压把 tick 拖死 */
export declare const MAX_LEVEL_NODES_PER_TICK = 10;
/** 每次心跳默认的辅助模型调用上限（归档 + 多子节点汇总 + 日画像） */
export declare const DEFAULT_MAX_CALLS_PER_TICK = 8;
declare const LEVEL_ORDER: readonly ["day", "week", "month", "season", "year"];
type Level = typeof LEVEL_ORDER[number];
export interface SummarizerConfig {
    dryRun: boolean;
    topicSwitchCheck: boolean;
    timezoneOffset: number;
    dayBoundaryHour: number;
    /** 每个 scope 每次汇总最多发起多少次辅助模型调用 */
    maxCallsPerTick?: number;
    /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
    resolveUser?: (scopeId: string) => Promise<User | null>;
}
/** 单次归档尝试的结果：ok 成功；empty 没有可归档内容；rejected 内容被模型审核拒绝；failed 其他失败 */
export type ArchiveOutcome = 'ok' | 'empty' | 'rejected' | 'failed';
/** 合并归档时模型返回的日期归一化为 YYYY/MM/DD */
export declare function normalizeDayKey(value?: string): string | null;
/** 模型侧的内容审核拒绝：这类错误重试同一段文本没有意义，直接跳过当天 */
export declare function isRejectedContent(message?: string): boolean;
export declare function formatTime(date: Date, timezoneOffsetHours: number): string;
/** date 所在自然日的起点：最近一个已过的日界线 */
export declare function dayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** date 所在自然日的终点（下一条日界线） */
export declare function nextDayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** date 所属的 level 周期起点：日 / 周一 / 月 / 季 / 年，均落在日界线上 */
export declare function periodStart(level: Level, date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** level 周期的下一个起点（= 当前周期的终点） */
export declare function periodEnd(level: Level, start: Date, timezoneOffset: number, boundaryHour: number): Date;
export declare class Summarizer {
    private ctx;
    private repo;
    private api;
    private profile;
    private config;
    /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
    private busy;
    /** scope:day -> 连续失败次数，成功或跳过后清除 */
    private topicFailures;
    /** scope -> 合并归档冷却截止时间 */
    private batchCooldown;
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, profile: ProfileManager, config: SummarizerConfig);
    private get tz();
    private get boundaryHour();
    /**
     * 每轮对话后调用：必要时归档当前话题。
     * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
     */
    maybeSwitchTopic(scopeId: string): Promise<void>;
    /**
     * 把游标所在自然日内、尚未归档的对话归档为一条 topic 记忆。
     * 超过 MAX_ARCHIVE_DIALOGUES 时只取前 200 条（同一天拆成多块）。
     * 返回是否真的发起并完成了归档。
     */
    private archiveTopicLocked;
    /**
     * 收集从游标开始的连续稀疏日，最多 MAX_BATCH_DAYS 天。
     * 只有收集到 2 天以上才值得合并（否则单日路径更直接）：
     * 遇到对话数超过 BATCH_DAY_MAX_DIALOGUES 的日子、未闭合的当天或总量超限就停。
     */
    private collectArchiveBlocks;
    /**
     * 一次调用归档多个稀疏日，模型按 date 返回每天的结果。
     * 任何一天缺失都视为整批失败：调用方会退回单日路径，
     * 宁可慢一点，也不能把某天的内容写进别的日期。
     */
    private archiveBlocksLocked;
    private dayKey;
    /**
     * 跳过游标所在的日子（模型审核拒绝或连续失败）。
     * 当天还没结束时只跳到本批最后一条对话之后，绝不把游标推到未来。
     */
    private skipDay;
    /**
     * 按自然日消费积压：每次归档一个日块，直到预算用完。
     * - 全是空白的日期用一次查询跨过去，不逐天循环；
     * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
     * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
     */
    private drainTopics;
    summarizeScope(scopeId: string): Promise<void>;
    /** 用金字塔里的高层汇总做一次性画像回填 */
    private backfillProfile;
    /**
     * 选材：优先用最近的一季汇总（覆盖约三个月），没有就退到月、周。
     * 年汇总刻意不用：它通常只覆盖上一个完整自然年，信息过旧。
     */
    private collectBackfillSections;
    /**
     * 自下而上补齐已闭合的周期，每个周期最多一条节点。
     *
     * 起算点来自该层最新节点的 periodEnd（没有则取最早子节点所在周期），
     * 因此不会重复生成同一周期；空周期没有子节点，会被自然跳过。
     * 周期末尾晚于归档游标时说明周期内的对话还没归档完，立即停止该层。
     */
    private buildLevels;
    private formatDialogues;
    private formatChildren;
    /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
    private lookupUser;
    private runExclusive;
}
export {};

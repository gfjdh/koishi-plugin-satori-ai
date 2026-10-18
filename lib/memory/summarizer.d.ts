import { Context } from 'koishi';
import { APIClient } from '../api';
import { User } from '../types';
import { MemoryRepository } from './repository';
import { ProfileManager } from './profile';
export declare const TOPIC_MIN_TURNS = 5;
export declare const TOPIC_MAX_TURNS = 20;
export declare const TOPIC_MAX_AGE_HOURS = 24;
export declare const MAX_ARCHIVE_DIALOGUES = 200;
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
     * 按自然日消费积压：每次归档一个日块，直到预算用完。
     * - 全是空白的日期用一次查询跨过去，不逐天循环；
     * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
     * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
     */
    private drainTopics;
    summarizeScope(scopeId: string): Promise<void>;
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

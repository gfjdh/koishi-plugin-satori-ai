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
export interface SummarizerConfig {
    dryRun: boolean;
    topicSwitchCheck: boolean;
    timezoneOffset: number;
    dayBoundaryHour: number;
    /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
    resolveUser?: (scopeId: string) => Promise<User | null>;
}
export declare function formatTime(date: Date, timezoneOffsetHours: number): string;
export declare class Summarizer {
    private ctx;
    private repo;
    private api;
    private profile;
    private config;
    /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
    private busy;
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, profile: ProfileManager, config: SummarizerConfig);
    /**
     * 每轮对话后调用：必要时归档当前话题。
     * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
     */
    maybeSwitchTopic(scopeId: string): Promise<void>;
    /** 兜底：话题持续时间过长时强制归档一次，否则金字塔会断在 topic 级 */
    private archiveStaleTopic;
    /** 把 [topicStart, 末尾] 的对话归档为一条 topic 记忆。调用方需持有 busy 锁。 */
    private archiveTopicLocked;
    summarizeScope(scopeId: string): Promise<void>;
    private summarizeLevel;
    private formatDialogues;
    private formatChildren;
    /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
    private lookupUser;
    private runExclusive;
}

import { Context } from 'koishi';
import { APIClient } from '../api';
import { User } from '../types';
import { MemoryRepository } from './repository';
import { SatMemory } from './schema';
/** 画像输入被内容审核拒绝后该 scope 的冷却：重试同一段文本不会有不同结果。
 *  不永久放弃，是因为地灵殿通行证一旦充值恢复，辅助线路换了 provider，
 *  审核策略可能完全不同，那时应该重新尝试。 */
export declare const PROFILE_REJECT_COOLDOWN_MS: number;
/** 历史回填被拒后的冷却更长：它只在积压追平后触发，本身不是高频路径 */
export declare const BACKFILL_REJECT_COOLDOWN_MS: number;
export type ProfileOutcome = 'ok' | 'failed' | 'rejected' | 'skipped';
export interface ProfileConfig {
    enabled: boolean;
    dryRun: boolean;
    maxEntries: number;
    contextEntries: number;
    /** 只对最近 N 天内结束的日节点更新画像；<=0 表示不限制 */
    updateWindowDays?: number;
}
export declare class ProfileManager {
    private ctx;
    private repo;
    private api;
    private config;
    /** 可注入的时钟，便于测试冷却窗口 */
    private now;
    /** 曾经被内容审核拒绝的 scope：之后直接用脱敏副本，不再白花一次调用 */
    private redactScopes;
    /** 审核拒绝后的冷却截止时刻（内存态，重启后重新探测一次） */
    private cooldownUntil;
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, config: ProfileConfig, 
    /** 可注入的时钟，便于测试冷却窗口 */
    now?: () => number);
    isEnabled(): boolean;
    /** 该 scope 是否处于审核拒绝的冷却期；过期即清除 */
    isCoolingDown(scopeId: string): boolean;
    private cooldown;
    /**
     * 该日节点是否还在画像更新窗口内。历史回填的日节点动辄是几个月前的，
     * 从中反复抽画像既浪费调用，也会让画像停留在过去；默认只认最近 7 天。
     */
    shouldUpdate(periodEnd: Date | null): boolean;
    /** 画像更新窗口的起点；null 表示不限制（窗口 <= 0） */
    windowStart(now?: number): Date | null;
    /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致）。 */
    summarize(scopeId: string, summary: string, memories: SatMemory[], user?: User | null, periodEnd?: Date | null): Promise<ProfileOutcome>;
    isBackfilled(scopeId: string): Promise<boolean>;
    /**
     * 历史回填：积压追平后，用金字塔里的高层汇总补一次画像，每个 scope 只做一次。
     * 这样既不必为每个旧日子调用模型，也不会把旧历史里的长期信息整个丢掉。
     */
    backfill(scopeId: string, sections: {
        label: string;
        content: string;
    }[], user?: User | null): Promise<ProfileOutcome>;
    /** 调模型、清洗 delta、合并落库。 */
    private applyUpdate;
    /** 需要脱敏时给出替换后的条目与输入；否则原样返回，避免无谓改动模型看到的文本 */
    private promptInput;
    getContext(scopeId: string): Promise<string>;
    has(scopeId: string): Promise<boolean>;
    formatById(scopeId: string): Promise<string>;
}

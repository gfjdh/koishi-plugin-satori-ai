import { Context } from 'koishi';
import { APIClient } from '../api';
import { User } from '../types';
import { MemoryRepository } from './repository';
import { SatMemory } from './schema';
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
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, config: ProfileConfig);
    isEnabled(): boolean;
    /**
     * 该日节点是否还在画像更新窗口内。历史回填的日节点动辄是几个月前的，
     * 从中反复抽画像既浪费调用，也会让画像停留在过去；默认只认最近 7 天。
     */
    shouldUpdate(periodEnd: Date | null): boolean;
    /** 画像更新窗口的起点；null 表示不限制（窗口 <= 0） */
    windowStart(now?: number): Date | null;
    /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致）。返回是否发起了模型调用。 */
    summarize(scopeId: string, summary: string, memories: SatMemory[], user?: User | null, periodEnd?: Date | null): Promise<boolean>;
    isBackfilled(scopeId: string): Promise<boolean>;
    /**
     * 历史回填：积压追平后，用金字塔里的高层汇总补一次画像，每个 scope 只做一次。
     * 这样既不必为每个旧日子调用模型，也不会把旧历史里的长期信息整个丢掉。
     */
    backfill(scopeId: string, sections: {
        label: string;
        content: string;
    }[], user?: User | null): Promise<boolean>;
    /** 调模型、清洗 delta、合并落库；返回是否发起了模型调用。 */
    private applyUpdate;
    getContext(scopeId: string): Promise<string>;
    has(scopeId: string): Promise<boolean>;
    formatById(scopeId: string): Promise<string>;
}

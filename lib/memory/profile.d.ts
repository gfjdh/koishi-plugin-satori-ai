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
}
export declare class ProfileManager {
    private ctx;
    private repo;
    private api;
    private config;
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, config: ProfileConfig);
    isEnabled(): boolean;
    /** 日总结完成后调用；持票用户走自己的 key（与 chat 一致） */
    summarize(scopeId: string, summary: string, memories: SatMemory[], user?: User | null): Promise<void>;
    getContext(scopeId: string): Promise<string>;
    has(scopeId: string): Promise<boolean>;
    formatById(scopeId: string): Promise<string>;
}

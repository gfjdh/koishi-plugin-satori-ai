import { Context, Session } from 'koishi';
import { APIClient } from '../api';
import { MemoryConfig } from '../types';
import { PromptContext } from './context';
export interface MemoryServiceConfig extends MemoryConfig {
    enable_layered_memory: boolean;
    memory_timezone_offset: number;
    memory_day_boundary_hour: number;
    topic_switch_check: boolean;
    summary_heartbeat_minutes: number;
    summary_dry_run: boolean;
    summary_max_scopes_per_tick: number;
    summary_max_calls_per_tick: number;
    /** 同时处理的 scope 数；单 scope 内部仍串行 */
    summary_concurrency: number;
    memory_active_window_days: number;
    memory_retention_days: number;
    memory_context_max_chars: number;
    memory_recall_topN: number;
    dialogue_stats_enabled: boolean;
    profile_enabled: boolean;
    profile_max_entries: number;
    profile_context_entries: number;
    profile_update_window_days: number;
}
export interface TurnResponse {
    content: string;
    error: boolean;
}
export declare class MemoryService {
    private ctx;
    private config;
    private repo;
    private shortTerm;
    private profile;
    private summarizer;
    private contextBuilder;
    private heartbeat;
    private migrator;
    constructor(ctx: Context, config: MemoryServiceConfig, api: APIClient);
    start(): void;
    stop(): void;
    getScopeId(session: {
        userId?: string;
        channelId?: string;
    }): string;
    getChannelMemory(channelId: string): import("../types").MemoryEntry[];
    getChannelContext(channelId: string): import("../types").MemoryEntry[];
    getChannelDialogue(session: Session): string;
    updateChannelDialogue(session: Session, prompt: string, name: string): void;
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAllMemories(): void;
    recordTurn(session: Session, prompt: string, response: TurnResponse): Promise<void>;
    private isBlocked;
    getPromptContext(session: Session, query: string): Promise<PromptContext>;
    addCommonSense(content: string): Promise<void>;
    addGroupCommonSense(content: string, channelId: string): Promise<void>;
    hasProfile(scopeId: string): Promise<boolean>;
    getProfileById(scopeId: string): Promise<string>;
    migrate(force?: boolean): Promise<import("./migrate").MigrateResult>;
    clearPersistent(scopeId?: string): Promise<void>;
    view(scopeId: string): Promise<string>;
}
export type { PromptContext };

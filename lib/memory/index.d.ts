import { Context, Session } from 'koishi';
import { APIClient } from '../api';
import { MemoryConfig } from '../types';
import { PromptContext } from './context';
export interface MemoryServiceConfig extends MemoryConfig {
    enable_layered_memory: boolean;
    /** 短期记忆空闲多久后清空（分钟），0 = 关闭 */
    short_term_ttl_minutes: number;
    short_term_sweep_minutes: number;
    memory_timezone_offset: number;
    memory_day_boundary_hour: number;
    /** 昵称列表：归档时从用户发言里抹掉，避免昵称被当成发言人 */
    nick_name_list: string[];
    /** 是否启用群聊记忆（按群建立独立的时间块金字塔，与按人记忆并存） */
    enable_group_memory: boolean;
    topic_switch_check: boolean;
    summary_heartbeat_minutes: number;
    summary_dry_run: boolean;
    summary_max_scopes_per_tick: number;
    summary_max_calls_per_tick: number;
    /** 同时处理的 scope 数；单 scope 内部仍串行 */
    summary_concurrency: number;
    memory_active_window_days: number;
    memory_retention_days: number;
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
    private groupProfile;
    private groupRecorder;
    private summarizer;
    private contextBuilder;
    private heartbeat;
    private migrator;
    private sweepDisposers;
    constructor(ctx: Context, config: MemoryServiceConfig, api: APIClient);
    start(): void;
    stop(): void;
    private startShortTermSweep;
    getScopeId(session: {
        userId?: string;
        channelId?: string;
    }): string;
    /** 群记忆的 scopeId；命令与运维查看用 */
    getGroupScopeId(channelId: string): string;
    getChannelMemory(channelId: string): import("../types").MemoryEntry[];
    getChannelContext(channelId: string): import("../types").MemoryEntry[];
    getChannelDialogue(session: Session): string;
    updateChannelDialogue(session: Session, prompt: string, name: string): void;
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAllMemories(): void;
    recordTurn(session: Session, prompt: string, response: TurnResponse): Promise<void>;
    private isBlocked;
    /** 主动消息只进短期记忆，不写 sat_dialogue，避免污染对话统计与长期归档 */
    recordProactive(session: Session, content: string): void;
    /** 群友发言进群聊记忆缓冲（只对机器人参与过的群生效） */
    recordGroupMessage(session: Session, content: string): void;
    getPromptContext(session: Session, query: string): Promise<PromptContext>;
    addCommonSense(content: string): Promise<void>;
    addGroupCommonSense(content: string, channelId: string): Promise<void>;
    hasProfile(scopeId: string): Promise<boolean>;
    getProfileById(scopeId: string): Promise<string>;
    migrate(force?: boolean): Promise<import("./migrate").MigrateResult>;
    clearPersistent(scopeId?: string): Promise<void>;
    /** 与注入系统提示的分层记忆段落完全相同 */
    view(scopeId: string): Promise<string>;
}
export type { PromptContext };

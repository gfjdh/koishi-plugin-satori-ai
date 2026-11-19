import { Context, Session } from 'koishi';
import { APIClient } from '../api';
import { MemoryConfig } from '../types';
import { PromptBuildOptions, PromptContext } from './context';
import { SatReport } from './schema';
import { DigestParticipant, DigestRange } from './group-digest';
import { GroupReportKind, GroupReportSpec } from './report-specs';
export interface MemoryServiceConfig extends MemoryConfig {
    enable_layered_memory: boolean;
    /** 短期记忆空闲多久后清空（分钟），0 = 关闭 */
    short_term_ttl_minutes: number;
    short_term_sweep_minutes: number;
    memory_timezone_offset: number;
    memory_day_boundary_hour: number;
    /** 昵称列表：归档时从用户发言里抹掉，避免昵称被当成发言人 */
    nick_name_list: string[];
    /** 机器人名字（昵称列表第一个）：记忆提示词与归档标签里的自称 */
    bot_name: string;
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
/** 群聊「省流」的选材结果。生成由调用方走正常对话链路 */
export interface GroupDigestContext {
    materials: string;
    range: string;
    nodeCount: number;
    messageCount: number;
}
/** 群聊日报/周报/月报/年报的选材结果 */
export interface GroupReportContext extends GroupDigestContext {
    /** 本期发言的群友，按条数降序（活跃榜用） */
    participants: DigestParticipant[];
    /** 去掉上一期最喜欢之后的候选列表（模型选人用） */
    favoriteCandidates: DigestParticipant[];
    /** 区间内群友的发言总条数（报头数据条用；messageCount 只是未归档原文条数） */
    totalMessages: number;
    /** 最近 24 小时每小时消息数，索引 0-23（报头活跃轨迹） */
    hourly: number[];
    /** 金句候选（已去重、带复读次数），由提示词直接使用 */
    quoteText: string;
    /** 本次报告的期号 */
    issue: number;
    /** 本次报告的生成时刻 */
    now: Date;
    /** 报告覆盖的终点；成功后记录时间，只用于同一天不重复奖励 */
    to: Date;
    /** 当前记忆日还没出过报告时为 true：只有第一份报告能给「最喜欢」加好感度 */
    allowFavorite: boolean;
    /** 上一份报告选中的群友；本期候选列表已排除此人 */
    previousFavorite: {
        userId: string;
        username: string;
    } | null;
    kind: GroupReportKind;
    spec: GroupReportSpec;
}
export declare class MemoryService {
    private ctx;
    private config;
    private api;
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
    /**
     * 查看记忆时的 scope 解析：先按群号匹配（`sat_meta` 里有 `g:<id>` 才算群），
     * 匹配不到再当成用户 id。这样不用非要在对应的群里执行指令。
     */
    resolveViewScope(input: string): Promise<string>;
    getChannelMemory(channelId: string): import("../types").MemoryEntry[];
    getChannelContext(channelId: string): import("../types").MemoryEntry[];
    getChannelDialogue(session: Session, options?: {
        excludeSelf?: boolean;
    }): string;
    updateChannelDialogue(session: Session, prompt: string, name: string, self?: boolean): void;
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAllMemories(): void;
    recordTurn(session: Session, prompt: string, response: TurnResponse): Promise<void>;
    private isBlocked;
    /** 主动消息只进短期记忆，不写 sat_dialogue，避免污染对话统计与长期归档 */
    recordProactive(session: Session, content: string): void;
    /** 群友发言进群聊记忆缓冲（只对机器人参与过的群生效） */
    recordGroupMessage(session: Session, content: string): void;
    /**
     * 汇总「用户上次在本群发言到现在」的群记忆。
     *
     * 选材粗粒度优先：年 → 季 → 月 → 周 → 日 → 话题。每取完一级就把游标
     * 推到该级最后一个节点的末尾，下一级只补最近的空档，因此同一时段不会
     * 同时出现粗、细两份。最早那个节点可以起点早于用户上次发言——粗粒度
     * 记忆本来就是整段整段的。最后剩下还没归档的消息直接给原文。
     *
     * 从没在本群说过话时按最近 24 小时算。
     */
    buildGroupDigestContext(session: Session, range?: DigestRange): Promise<GroupDigestContext | null>;
    /**
     * 按执行时刻决定出日报还是周/月/年报，并选出材料。
     *
     * 自然周期（周/月/年）只取已闭合的时段，选材按各自的最高粒度往下补：
     * 周报 日→话题，月报 周→日→话题，年报 月→周→日→话题。日报仍从上次
     * 日报游标开始，没有游标时取最近 24 小时。
     */
    buildGroupReportContext(session: Session, options?: {
        kind?: GroupReportKind;
    }): Promise<GroupReportContext | null>;
    /** 记录本次报告时间：只用于同一天不重复奖励，不参与选材 */
    markDailyDigest(channelId: string, at: Date): Promise<void>;
    saveReport(channelId: string, issueDate: string, kind: string, title: string, imagePath: string, data: any): Promise<void>;
    getReport(channelId: string, issueDate: string): Promise<SatReport | null>;
    /** 记录本期的「最喜欢」，下一份报告不能再选同一个人 */
    markFavorite(channelId: string, userId: string, username: string): Promise<void>;
    /** 报告发出后记录期号，下一期的报头 +1 */
    markReportIssued(channelId: string, issue: number): Promise<void>;
    getPromptContext(session: Session, query: string, options?: PromptBuildOptions): Promise<PromptContext>;
    /**
     * 关系惯性：注入关系等级时使用的近期互动热度加分。
     * 最近 6 个完整记忆日各计 1 轮、当天计 2 轮；只影响注入的等级，
     * 不改写 p_system.favorability，也不影响心情/屏蔽等其它判断。
     */
    getRelationshipInertiaBonus(session: Session): Promise<number>;
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

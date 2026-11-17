import { Context } from 'koishi';
export interface SatDialogue {
    id: number;
    scopeId: string;
    userId: string;
    username: string;
    kind: string;
    userContent: string;
    aiContent: string;
    createdAt: Date;
}
export interface SatMemory {
    id: number;
    scopeId: string;
    granularity: string;
    topic: string;
    content: string;
    userState: string;
    periodStart: Date;
    periodEnd: Date;
    sourceCount: number;
    createdAt: Date;
}
export interface SatKnowledge {
    id: number;
    kind: string;
    targetId: string;
    content: string;
    createdAt: Date;
}
export interface ProfileEntry {
    key: string;
    category: string;
    content: string;
    importance: number;
    updatedAt: string;
}
export interface ProfileData {
    entries: ProfileEntry[];
    lastSummarizedAt?: string;
    /** 历史回填完成时间；存在即表示已用高层汇总补过一次画像 */
    backfilledAt?: string;
}
export interface SatProfile {
    id: number;
    scopeId: string;
    data: ProfileData;
    updatedAt: Date;
}
export interface SatMeta {
    id: number;
    scopeId: string;
    topicStart: Date;
    lastActiveAt: Date;
    migratedAt: Date;
    /** 上一次群日报的时间；null 表示还没发过日报 */
    dailyDigestAt?: Date;
    /** 上一份报告选中的「最喜欢」群友，下一份报告不能重复选 */
    lastFavoriteId?: string;
    lastFavoriteName?: string;
    /** 已经发出的报告期数；报头显示「第 N 期」 */
    reportCount?: number;
}
declare module 'koishi' {
    interface Tables {
        sat_dialogue: SatDialogue;
        sat_memory: SatMemory;
        sat_knowledge: SatKnowledge;
        sat_profile: SatProfile;
        sat_meta: SatMeta;
    }
}
export declare const MEMORY_GRANULARITIES: readonly ["topic", "day", "week", "month", "season", "year"];
export type Granularity = typeof MEMORY_GRANULARITIES[number];
export declare const GLOBAL_SCOPE = "__global__";
export declare function extendMemoryDatabase(ctx: Context): void;

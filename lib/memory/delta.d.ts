export interface DeltaEntry {
    key: string;
    category?: string;
    content?: string;
    importance?: number;
}
export interface ProfileDelta {
    added?: DeltaEntry[];
    modified?: DeltaEntry[];
    deleted?: string[];
}
export interface ProfileEntryLike {
    key: string;
    category: string;
    content: string;
    importance: number;
    updatedAt: string;
}
export declare function clampImportance(value: number | undefined, fallback?: number): number;
/**
 * 应用一次增量。
 *
 * 与参考实现的两处差异：
 * 1. added 内部先按 key 去重，modified 会与同一次 delta 里的 added 合并，
 *    不会出现“同一次 delta 撞 key 产生两条”的情况；
 * 2. 结果始终按 (importance DESC, updatedAt DESC) 持久化排序，
 *    不再每次淘汰都原地打乱 entries 的顺序。
 */
export declare function applyProfileDelta<T extends ProfileEntryLike>(entries: T[], delta: ProfileDelta, now: string, maxEntries: number): T[];

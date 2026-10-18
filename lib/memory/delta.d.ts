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
/** 迁移生成的旧画像原文。只允许被拆解后删除，不接受改写，避免整段旧画像被覆盖。 */
export declare const PROTECTED_PROFILE_KEYS: Set<string>;
/**
 * 判断 content 是否是“编辑说明”而不是关于用户的事实。
 * 模型偶尔会把“移除某表述”“以某条为准”直接写进 content，
 * 这类内容必须丢弃，否则会覆盖掉真正的画像。
 */
export declare function looksLikeEditInstruction(content: string | undefined): boolean;
export interface SanitizeResult {
    delta: ProfileDelta;
    /** 被丢弃的条目，形如 key(added) / key(modified:protected) */
    rejected: string[];
}
/**
 * 应用前清洗模型输出：
 * 1. deleted 既接受字符串，也接受 { key } / { title } 对象（模型常混用）；
 * 2. 丢弃“编辑说明”样式的 added / modified；
 * 3. 保护 legacy_portrait，只允许删除、不允许改写。
 */
export declare function sanitizeProfileDelta(delta: ProfileDelta): SanitizeResult;
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

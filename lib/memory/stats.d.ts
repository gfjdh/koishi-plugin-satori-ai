import { MemoryRepository } from './repository';
/** 只统计用户↔机器人的对话；群聊环境消息不算互动。 */
export declare const DIALOGUE_STATS_KINDS: string[];
/**
 * 生成对话统计段落。没有任何对话时返回空串。
 * 口径与桌宠一致：滚动窗口（近 1 天/7 天/30 天/90 天/365 天），
 * 并按关系时长逐级显示，避免新用户看到一堆 0。
 */
export declare function buildDialogueStats(repo: MemoryRepository, scopeId: string, now?: Date): Promise<string>;
/** 关系惯性窗口：今天之前的 6 个完整记忆日（昨天到 6 天前） */
export declare const RELATIONSHIP_INERTIA_DAYS = 6;
/** 当天对话的权重：当天还没过完，×2 近似折算成整天 */
export declare const RELATIONSHIP_INERTIA_TODAY_WEIGHT = 2;
/**
 * 关系惯性加分：最近 6 个完整记忆日的对话轮次 + 当天对话轮次 ×2。
 * 只用于注入提示词时判断关系等级，不改写数据库里的好感度。
 * 「当天」按 memory_timezone_offset / memory_day_boundary_hour 的日界线切分，
 * 与分层记忆、群日报使用同一套自然日。
 */
export declare function buildRelationshipInertia(repo: MemoryRepository, scopeId: string, timezoneOffset: number, boundaryHour: number, now?: Date): Promise<number>;

import { MemoryRepository } from './repository';
/** 只统计用户↔机器人的对话；群聊环境消息不算互动。 */
export declare const DIALOGUE_STATS_KINDS: string[];
/**
 * 生成对话统计段落。没有任何对话时返回空串。
 * 口径与桌宠一致：滚动窗口（近 1 天/7 天/30 天/90 天/365 天），
 * 并按关系时长逐级显示，避免新用户看到一堆 0。
 */
export declare function buildDialogueStats(repo: MemoryRepository, scopeId: string, now?: Date): Promise<string>;

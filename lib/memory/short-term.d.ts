import { Context, Session } from 'koishi';
import { MemoryConfig, MemoryEntry } from '../types';
export interface ShortTermOptions {
    /** 对话记忆空闲多久后清空（毫秒）；<= 0 表示关闭 */
    ttlMs: number;
    /** 可注入时钟，便于验证过期逻辑；生产环境不传 */
    now?: () => Date;
}
/** 群聊环境的一条发言。`self` 标记 bot 自己说的话，与发言人昵称解耦 */
export interface ChannelDialogueEntry {
    name: string;
    content: string;
    self?: boolean;
}
export declare class ShortTermMemory {
    private ctx;
    private options;
    private channelMemories;
    private channelDialogues;
    constructor(ctx: Context, options?: ShortTermOptions);
    private nowMs;
    /** 过期判断以「最后一次真实用户对话」为准；主动消息不续期 */
    private isExpired;
    /** 清理所有过期作用域，返回清掉的数量。读取路径也会懒清理，这里兜住再也没人读的键 */
    sweep(): number;
    /** 当前作用域数量，供启动/运维日志使用 */
    getScopeCount(): number;
    private bracketFilter;
    private memoryFilter;
    /** 记录一轮用户↔bot 对话到短期记忆 */
    updateChannelMemory(session: Session, prompt: string, config: MemoryConfig, response?: string, scopeId?: string): void;
    /** 记录一条仅由机器人发出的主动消息（不伪造用户发言） */
    recordAssistant(session: Session, content: string, config: MemoryConfig, scopeId?: string): void;
    /** 记录一条群聊环境发言（含不对 bot 说的）；self 标记 bot 自己的发言 */
    updateChannelDialogue(session: Session, prompt: string, name: string, config: MemoryConfig, self?: boolean): void;
    /** excludeSelf：随机插话时不要参考自己刚说过的话，否则容易顺着复读 */
    getChannelDialogue(session: Session, config: MemoryConfig, options?: {
        excludeSelf?: boolean;
    }): string;
    getChannelMemory(channelId: string): MemoryEntry[];
    getChannelContext(channelId: string): MemoryEntry[];
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAll(): void;
}

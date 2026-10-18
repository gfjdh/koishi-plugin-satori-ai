import { Context, Session } from 'koishi';
import { MemoryConfig, MemoryEntry } from '../types';
export declare class ShortTermMemory {
    private ctx;
    private channelMemories;
    private channelDialogues;
    constructor(ctx: Context);
    private bracketFilter;
    private memoryFilter;
    /** 记录一轮用户↔bot 对话到短期记忆 */
    updateChannelMemory(session: Session, prompt: string, config: MemoryConfig, response?: string, scopeId?: string): void;
    /** 记录一条群聊环境发言（含不对 bot 说的） */
    updateChannelDialogue(session: Session, prompt: string, name: string, config: MemoryConfig): void;
    getChannelDialogue(session: Session, config: MemoryConfig): string;
    getChannelMemory(channelId: string): MemoryEntry[];
    getChannelContext(channelId: string): MemoryEntry[];
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAll(): void;
}

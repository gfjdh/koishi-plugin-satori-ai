import { Session, Context } from 'koishi';
import { MemoryEntry, MemoryConfig } from './types';
export declare class MemoryManager {
    private ctx;
    private config;
    private channelMemories;
    private channelDialogues;
    constructor(ctx: Context, config: MemoryConfig);
    updateMemories(session: Session, prompt: string, config: MemoryConfig, response: {
        content: string;
        error: boolean;
    }): Promise<void>;
    private shouldRemember;
    updateChannelDialogue(session: Session, prompt: string, name: string): Promise<string>;
    getChannelDialogue(session: Session): Promise<string>;
    private bracketFilter;
    private memoryFilter;
    private updateChannelMemory;
    clearChannelMemory(channelId: string): void;
    clearChannelDialogue(channelId: string): void;
    clearAllMemories(): void;
    getChannelMemory(channelId: string): MemoryEntry[];
    saveLongTermMemory(session: Session, dialogues: MemoryEntry[], filePath?: string): Promise<void>;
    searchMemories(session: Session, prompt: string, type?: 'user' | 'common'): Promise<string>;
    private findBestMatches;
    private calculateMatchScore;
    private formatMatches;
    private getUserMemoryPath;
    private ensureMemoryFile;
    private loadMemoryFile;
    getChannelContext(channelId: string): MemoryEntry[];
}

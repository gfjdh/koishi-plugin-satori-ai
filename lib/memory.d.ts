import { Session } from 'koishi';
import { MemoryEntry, MemoryConfig } from './types';
export declare class MemoryManager {
    private config;
    private channelMemories;
    constructor(config: MemoryConfig);
    updateMemories(session: Session, prompt: string, config: MemoryConfig, response: {
        content: string;
        error: boolean;
    }): Promise<void>;
    private shouldRemember;
    private updateChannelMemory;
    clearChannelMemory(channelId: string): void;
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

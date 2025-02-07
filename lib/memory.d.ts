import { Session } from 'koishi';
import { MemoryEntry, MemoryConfig } from './types';
export declare class MemoryManager {
    private config;
    private channelMemories;
    constructor(config: MemoryConfig);
    updateChannelMemory(session: Session, prompt: string, response?: string): void;
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

import { Session } from 'koishi';
import { Context } from 'koishi';
import { MemoryEntry, MemoryConfig } from './types';
export declare class MemoryManager {
    private ctx;
    private config;
    private channelMemories;
    constructor(ctx: Context, config: MemoryConfig);
    updateChannelMemory(session: Session, prompt: string, response?: string): void;
    clearChannelMemory(channelId: string): void;
    getChannelMemory(channelId: string): MemoryEntry[];
    saveLongTermMemory(session: Session, dialogues: MemoryEntry[], filePath?: string): Promise<void>;
    searchMemories(session: Session, keywords: string[], type?: 'user' | 'common'): Promise<string>;
    private getUserMemoryPath;
    private ensureMemoryFile;
    private loadMemoryFile;
    private findBestMatches;
    private calculateMatchScore;
    private formatMatches;
    getChannelContext(channelId: string): MemoryEntry[];
}
export declare class WeightedMemoryManager extends MemoryManager {
    private weights;
    addWeight(keyword: string, weight: number): void;
}
export interface MemoryAugmentor {
    augment(context: MemoryContext): Promise<void>;
}
interface MemoryContext {
    session: Session;
    memories: MemoryEntry[];
    config: MemoryConfig;
}
export {};

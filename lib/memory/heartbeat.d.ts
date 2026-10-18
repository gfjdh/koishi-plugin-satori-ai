import { Context } from 'koishi';
import { MemoryRepository } from './repository';
import { Summarizer } from './summarizer';
export interface HeartbeatConfig {
    intervalMinutes: number;
    maxScopesPerTick: number;
    activeWindowDays: number;
    retentionDays: number;
}
export declare class Heartbeat {
    private ctx;
    private repo;
    private summarizer;
    private config;
    private running;
    private cursor;
    private disposers;
    constructor(ctx: Context, repo: MemoryRepository, summarizer: Summarizer, config: HeartbeatConfig);
    start(): void;
    stop(): void;
    tick(): Promise<void>;
}

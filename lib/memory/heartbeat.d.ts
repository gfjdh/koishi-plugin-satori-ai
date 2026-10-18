import { Context } from 'koishi';
import { MemoryRepository } from './repository';
import { Summarizer } from './summarizer';
export interface HeartbeatConfig {
    intervalMinutes: number;
    maxScopesPerTick: number;
    /** 同时处理的 scope 数。单个 scope 内部仍严格串行（游标与层级顺序不能乱），
     * 但不同 scope 互不影响；这是补齐历史积压时唯一有效的提速维度。 */
    concurrency: number;
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
    /**
     * 以固定并发消费 batch。每个 scope 内部仍是一条串行链路：
     * 归档必须按游标顺序推进，层级也依赖上一层结果，不能并发。
     * 并发只发生在 scope 之间，可以安全地放大到 10 倍左右。
     */
    private runBatch;
}

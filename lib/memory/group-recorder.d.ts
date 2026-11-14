import { Context } from 'koishi';
import { MemoryRepository } from './repository';
export interface GroupRecorderConfig {
    enabled: boolean;
    /** 机器人多少天内回过话的群才算活跃 */
    activeWindowDays: number;
    flushIntervalMs?: number;
    maxBuffer?: number;
}
/** 只取 GroupRecorder 需要的会话字段，便于测试 */
export interface GroupRecorderSession {
    channelId?: string;
    userId?: string;
    username?: string;
    selfId?: string;
    subtype?: string;
    isDirect?: boolean;
}
export declare class GroupRecorder {
    private ctx;
    private repo;
    private config;
    private buffers;
    /** 机器人回过话的群（channelId） */
    private qualified;
    /** 同一频道的写入串行化，避免两次 flush 交错导致消息乱序 */
    private pending;
    private timer?;
    constructor(ctx: Context, repo: MemoryRepository, config: GroupRecorderConfig);
    start(): void;
    stop(): void;
    /** 启动时恢复活跃群列表；失败不影响后续（机器人回话时会重新标记） */
    private seed;
    /** 群友发言：只记录机器人参与过的群 */
    record(session: GroupRecorderSession, content: string): void;
    /** 机器人发言：同时把这个群标记为活跃并建 meta，心跳从下一轮开始归档 */
    recordBot(session: GroupRecorderSession, content: string): void;
    private push;
    private flush;
    flushAll(): void;
}

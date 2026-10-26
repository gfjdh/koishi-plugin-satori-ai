import { Context } from 'koishi';
import { APIConfig, Sat, User } from './types';
export declare class APIClient {
    private ctx;
    private config;
    private currentKeyIndex;
    private ticketFailedUntil;
    constructor(ctx: Context, config: APIConfig);
    chat(user: User, messages: Sat.Msg[]): Promise<{
        content: string;
        error: boolean;
        reasoning_content?: string;
    }>;
    auxiliaryChat(messages: Sat.Msg[], user?: User | null): Promise<{
        content: string;
        error: boolean;
    }>;
    /**
     * 辅助请求的实际发送与重试。
     * 所有失败之间都有 retry_delay_time 的间隔；429/503 按指数退避并带抖动，
     * 有 Retry-After 时优先遵守，避免并发 worker 在同一时刻再次冲击限流接口。
     */
    private requestAuxiliary;
    /** 指数退避，最高 30 秒；加 ±20% 抖动，避免多个 worker 同步重试。
     *  服务端给了 Retry-After 就严格按它来，不再打折。 */
    private retryDelayFor;
    /** Retry-After 可能是秒数，也可能是 HTTP 日期。 */
    private retryAfterMs;
    private statusOf;
    private pruneTicketFailures;
    private ticketAuxiliaryRoute;
    private defaultAuxiliaryRoute;
    private createPayload;
    private createAuxiliaryPayload;
    private tryRequest;
    private sendChat;
    private createHeaders;
    private handleAPIError;
    private rotateKey;
    testConnection(): Promise<boolean>;
}

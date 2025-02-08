import { Context } from 'koishi';
import { APIConfig, Sat } from './types';
export declare class APIClient {
    private ctx;
    private config;
    private currentKeyIndex;
    constructor(ctx: Context, config: APIConfig);
    initialize(): Promise<void>;
    chat(messages: Sat.Msg[]): Promise<{
        content: string;
        error: boolean;
    }>;
    protected createPayload(messages: Sat.Msg[]): any;
    private tryRequest;
    private createHeaders;
    private handleAPIError;
    private rotateKey;
    testConnection(): Promise<boolean>;
}

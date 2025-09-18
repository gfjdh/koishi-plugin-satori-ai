import { Context } from 'koishi';
import { APIConfig, Sat, User } from './types';
export declare class APIClient {
    private ctx;
    private config;
    private currentKeyIndex;
    constructor(ctx: Context, config: APIConfig);
    chat(user: User, messages: Sat.Msg[]): Promise<{
        content: string;
        error: boolean;
        reasoning_content?: string;
    }>;
    auxiliaryChat(messages: Sat.Msg[]): Promise<{
        content: string;
        error: boolean;
    }>;
    generateUserPortrait(user: User, messages: Sat.Msg[]): Promise<{
        content: string;
        error: boolean;
    }>;
    private createPayload;
    private createAuxiliaryPayload;
    private tryRequest;
    private createHeaders;
    private handleAPIError;
    private rotateKey;
    testConnection(): Promise<boolean>;
}

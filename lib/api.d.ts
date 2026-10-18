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
    auxiliaryChat(messages: Sat.Msg[], user?: User | null): Promise<{
        content: string;
        error: boolean;
    }>;
    /**
     * 辅助请求的路由：持票且配置完整时走用户的 key/model，否则回退默认辅助模型。
     * 不完整的票配置不能让后台归档静默失败，所以这里降级并告警。
     */
    private resolveAuxiliaryRoute;
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

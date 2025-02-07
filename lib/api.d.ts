import { Context } from 'koishi';
import { APIConfig, Sat } from './types';
export declare class APIClient {
    private ctx;
    private config;
    private currentKeyIndex;
    private retryCount;
    constructor(ctx: Context, config: APIConfig);
    initialize(): Promise<void>;
    chat(messages: Sat.Msg[]): Promise<string>;
    protected createPayload(messages: Sat.Msg[]): any;
    private tryRequest;
    private createHeaders;
    private handleAPIError;
    private rotateKey;
    testConnection(): Promise<boolean>;
}
interface APIAdapter {
    formatRequest(messages: Sat.Msg[]): any;
    parseResponse(response: any): string;
}
export declare class OpenAIAdapter implements APIAdapter {
    formatRequest(messages: any): {
        messages: any;
        model: string;
    };
    parseResponse(response: any): any;
}
export declare class ExtendedAPIClient extends APIClient {
    private adapter;
    constructor(ctx: Context, config: APIConfig, adapter: APIAdapter);
    createPayload(messages: Sat.Msg[]): any;
}
export {};

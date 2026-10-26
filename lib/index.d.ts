import { Context, Session } from 'koishi';
import { Sat, User } from './types';
import Puppeteer from 'koishi-plugin-puppeteer';
import { BroadcastManager } from './broadcast';
import { WeatherManager } from './weather';
import { ProactiveManager } from './proactive';
export declare let puppeteer: Puppeteer | null;
export declare function refreshPuppeteer(ctx: Context): void;
export declare class SAT extends Sat {
    config: Sat.Config;
    private apiClient;
    private memoryService;
    private ChannelParallelCount;
    private onlineUsers;
    private moodManager;
    broadcastManager: BroadcastManager;
    weatherManager: WeatherManager;
    proactive: ProactiveManager;
    private usersToWarn;
    private puppeteer;
    private game;
    private galgame;
    private emojiManager;
    setPuppeteer(puppeteer: Puppeteer): void;
    private waitForPuppeteer;
    puppeteerReady(): boolean;
    constructor(ctx: Context, config: Sat.Config);
    private getAPIConfig;
    private getMemoryConfig;
    private getMiddlewareConfig;
    private getFavorabilityConfig;
    private registerCommands;
    private registerGalgameCommands;
    private handleSatCommand;
    private handleAuxiliaryDialogue;
    private checkFavorabilityBlock;
    private performPreChecks;
    private checkDuplicateDialogue;
    private handleFixedDialoguesCheck;
    private checkUserDialogueCount;
    private updateChannelParallelCount;
    private getChannelParallelCount;
    private processInput;
    generateResponse(session: Session, prompt: string): Promise<{
        content: string;
        error: boolean;
        reasoning_content?: string;
    }>;
    getChatResponse(user: User, messages: Sat.Msg[], prompt: string): Promise<{
        content: string;
        error: boolean;
        reasoning_content?: string;
    }>;
    /**
     * 生成一条主动消息（不写入长期记忆，不扣使用次数）。
     * idleMinutes 用于告诉模型沉默时长；queryHint 用用户最后一句做记忆检索。
     */
    generateProactive(session: Session, idleMinutes: number, queryHint?: string): Promise<string>;
    /** 主动消息成功后由发送方调用，只写短期记忆 */
    recordProactive(session: Session, content: string): void;
    private buildMessages;
    private buildSystemPrompt;
    private getThinkingPrompt;
    private formatResponse;
    private addUserToWarnList;
    getWarningList(session: Session): Promise<void>;
    private clearSession;
    private addCommonSense;
    addGroupCommonSense(session: Session, content: string, groupId: string): Promise<string>;
    private handleUserLevel;
    private handleUserUsage;
    handleRandomMiddleware(session: Session): Promise<string>;
    handleNickNameMiddleware(session: Session, prompt: string): Promise<string>;
    handleChannelMemoryManager(session: Session): Promise<void>;
    dispose(): Promise<void>;
}
export default SAT;

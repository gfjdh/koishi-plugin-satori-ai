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
    generateResponse(session: Session, prompt: string, imageParts?: Sat.MsgContentPart[]): Promise<{
        content: string;
        error: boolean;
        reasoning_content?: string;
    }>;
    /** 把图片交给识图模型，返回可注入对话的描述；失败返回空串，不影响正常回复 */
    private describeImages;
    /** 没配识图模型时，把图片作为多模态内容直接附给主模型 */
    private loadImageParts;
    getChatResponse(user: User, messages: Sat.Msg[], prompt: string, session?: Session, options?: {
        maxOutputTokens?: number;
        preserveFormatting?: boolean;
        disableThinking?: boolean;
    }): Promise<{
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
    isGameActive(session: Session): boolean;
    handleRandomMiddleware(session: Session): Promise<string>;
    /** 机器人的称呼：昵称列表第一个非空项；都没配置时退回「我」 */
    getBotName(): string;
    /** 群聊环境里代表 bot 自己的名字：昵称列表第一个加「（你）」，让模型能分辨这是自己的发言 */
    private getSelfDialogueName;
    handleNickNameMiddleware(session: Session, prompt: string): Promise<string>;
    handleChannelMemoryManager(session: Session): Promise<void>;
    private handleDigest;
    private handleGroupReport;
    /**
     * 把模型选出的昵称映射回区间内的群友，再给好感度。
     * 返回被选中的群友；未生效时返回 null。
     */
    private applyDigestFavorite;
    private renderDigestCard;
    dispose(): Promise<void>;
}
export default SAT;

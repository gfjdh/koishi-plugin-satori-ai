import { Context, Session } from 'koishi';
import { User, FavorabilityLevel, FavorabilityConfig } from './types';
import { MoodManager } from './mood';
import { Sat } from './types';
export declare function handleFavorabilitySystem(ctx: Context, session: Session, config: FavorabilityConfig): Promise<string | void>;
export declare function isFamilyLevel(level: FavorabilityLevel): boolean;
export declare function getFavorabilityLevel(user: User, config: FavorabilityConfig): FavorabilityLevel;
export declare function generateLevelPrompt(level: FavorabilityLevel, config: FavorabilityConfig, user: User): string;
export declare function generateAuxiliaryPrompt(prompt: string, responseContent: string, user: User, config: FavorabilityConfig): Sat.Msg[];
export declare function handleAuxiliaryResult(ctx: Context, session: Session, config: FavorabilityConfig, responseContent: string): Promise<string | void>;
export declare function applyInputCensorPenalty(ctx: Context, user: User, config: FavorabilityConfig, session: Session, moodManager: MoodManager): Promise<number>;
export declare function inputContentCheck(ctx: Context, content: string, userid: string, config: FavorabilityConfig, session: Session, moodManager: MoodManager): Promise<number>;
export declare function outputContentCheck(ctx: Context, response: {
    content: string;
    error: boolean;
}, userid: string, config: FavorabilityConfig, session: Session, moodManager: MoodManager): Promise<number>;
/**
 * 是否把好感度标记（「(好感↓)」「(好感↓↓)」等）追加到回复末尾。
 *
 * 模型被骚扰时会按提示词自己写「好感↓」，回复里已经表达了下降，
 * 插件再补一个重复的「(好感↓)」只会重复。数值仍然照常结算，这里只管显示。
 * 输入屏蔽词触发的「(好感↓↓)」保留：它表示用户这条消息本身违规，与回复自述的下降不是一回事。
 * 上升标记不受影响：模型写了「好感↓」也可能是先抑后扬。
 */
export declare function shouldAppendFavorabilityMark(response: string, auxiliaryResult: string | void): boolean;
export declare function ensureCensorFileExists(basePath: string): Promise<void>;
export declare function applyFavorabilityEffect(ctx: Context, user: User, effect: number, session: Session): Promise<void>;

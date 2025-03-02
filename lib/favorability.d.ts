import { Context, Session } from 'koishi';
import { User, FavorabilityLevel, FavorabilityConfig } from './types';
import { Sat } from './types';
export declare function handleFavorabilitySystem(ctx: Context, session: Session, config: FavorabilityConfig): Promise<string | void>;
export declare function getFavorabilityLevel(user: User, config: FavorabilityConfig): FavorabilityLevel;
export declare function generateLevelPrompt(level: FavorabilityLevel, config: FavorabilityConfig, user: User): string;
export declare function generateAuxiliaryPrompt(prompt: string, responseContent: string, user: User, config: FavorabilityConfig): Sat.Msg[];
export declare function handleAuxiliaryResult(ctx: Context, session: Session, config: FavorabilityConfig, responseContent: string): Promise<string | void>;
export declare function inputContentCheck(ctx: Context, content: string, userid: string, config: FavorabilityConfig): Promise<number>;
export declare function outputContentCheck(ctx: Context, response: {
    content: string;
    error: boolean;
}, userid: string, config: FavorabilityConfig): Promise<number>;
export declare function ensureCensorFileExists(basePath: string): Promise<void>;
export declare function applyFavorabilityEffect(ctx: Context, user: User, effect: number): Promise<void>;

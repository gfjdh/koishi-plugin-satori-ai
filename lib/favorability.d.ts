import { Context, Session } from 'koishi';
import { User, FavorabilityLevel, FavorabilityConfig } from './types';
export declare function handleFavorabilitySystem(ctx: Context, session: Session, config: FavorabilityConfig): Promise<string | void>;
export declare function getFavorabilityLevel(favorability: number, config: FavorabilityConfig): FavorabilityLevel;
export declare function generateLevelPrompt(level: FavorabilityLevel, config: FavorabilityConfig): string;
export declare function handleContentCheck(ctx: Context, content: string, userid: string): Promise<number>;
export declare function applyFavorabilityEffect(ctx: Context, user: User, effect: number): Promise<void>;
interface FavorabilityEffect {
    type: 'add' | 'multiply' | 'set';
    value: number;
}
export declare function applyCustomEffect(ctx: Context, user: User, effect: FavorabilityEffect): Promise<void>;
export interface FavorabilityStrategy {
    calculate(content: string, user: User): number;
}
export {};

import { Context } from 'koishi';
import { User, FavorabilityAdjustment } from './types';
declare module 'koishi' {
    interface Tables {
        p_system: User;
    }
}
export declare function isTargetIdNotExists(ctx: Context, userId: string): Promise<boolean>;
export declare function createUser(ctx: Context, user: Omit<User, 'id'>): Promise<void>;
export declare function updateFavorability(ctx: Context, user: User, adjustment: FavorabilityAdjustment): Promise<void>;
export declare function updateUserLevel(ctx: Context, user: User, level: number): Promise<void>;
export declare function updateUserUsage(ctx: Context, user: User, adjustment?: number): Promise<number | void>;
export declare function updateVisionUsage(ctx: Context, user: User, adjustment?: number): Promise<number | void>;
/**
 * 消耗一次识图额度：limit 为 0 表示不限制（仍然计数）。
 * 达到上限时返回 false，调用方跳过识图，文字消息照常回复。
 * 通行证用户不额外豁免，和普通用户同一套限额。
 */
export declare function consumeVisionUsage(ctx: Context, user: User, limit: number): Promise<boolean>;
export declare function updateUserItems(ctx: Context, user: User): Promise<void>;
export declare function updateUserP(ctx: Context, user: User, adjustment: number): Promise<void>;
export declare function updateUserLocation(ctx: Context, user: User, location: string): Promise<void>;
export declare function getUser(ctx: Context, userId: string): Promise<User | null>;
export declare function ensureUserExists(ctx: Context, userId: string, username: string): Promise<User>;
export declare function extendDatabase(ctx: Context): void;

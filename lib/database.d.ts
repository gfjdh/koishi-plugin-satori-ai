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
export declare function updateUserItems(ctx: Context, user: User): Promise<void>;
export declare function getUser(ctx: Context, userId: string): Promise<User | null>;
export declare function ensureUserExists(ctx: Context, userId: string, username: string): Promise<User>;
export declare function extendDatabase(ctx: Context): void;

import { Context } from 'koishi';
import { User, FavorabilityAdjustment } from './types';
declare module 'koishi' {
    interface Tables {
        p_system: User;
    }
}
export declare function isTargetIdExists(ctx: Context, userId: string): Promise<boolean>;
export declare function createUser(ctx: Context, user: Omit<User, 'id'>): Promise<void>;
export declare function updateFavorability(ctx: Context, user: User, adjustment: FavorabilityAdjustment): Promise<void>;
export declare function getUser(ctx: Context, userId: string): Promise<User | null>;
export declare function ensureUserExists(ctx: Context, userId: string, username: string): Promise<User>;
export declare function extendDatabase(ctx: Context): void;

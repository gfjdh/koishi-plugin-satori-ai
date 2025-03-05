import { Context, Session, Next, h } from 'koishi';
import { SAT } from './index';
import { FavorabilityConfig, MiddlewareConfig } from './types';
import { MemoryManager } from './memory';
export declare function createMiddleware(ctx: Context, sat: SAT, config: MiddlewareConfig & FavorabilityConfig, memoryManager: MemoryManager): (session: Session, next: Next) => Promise<void | h.Fragment>;

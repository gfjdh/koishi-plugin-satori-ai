import { Context, Session, Next, h } from 'koishi';
import { SAT } from './index';
import { FavorabilityConfig, MiddlewareConfig } from './types';
export declare function createMiddleware(ctx: Context, sat: SAT, config: MiddlewareConfig & FavorabilityConfig): (session: Session, next: Next) => Promise<void | h.Fragment>;

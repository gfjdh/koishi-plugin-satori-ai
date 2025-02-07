import { Context, Session, Next, h } from 'koishi';
import { SAT } from './index';
import { FavorabilityConfig, MiddlewareConfig } from './types';
export declare function createMiddleware(ctx: Context, sat: SAT, config: MiddlewareConfig & FavorabilityConfig): (session: Session, next: Next) => Promise<void | h.Fragment>;
export interface TriggerStrategy {
    shouldTrigger(session: Session): boolean;
    handleTrigger(sat: SAT, session: Session): Promise<void>;
}
export declare class ImageTrigger implements TriggerStrategy {
    shouldTrigger(session: Session): boolean;
    handleTrigger(sat: SAT, session: Session): Promise<void>;
}
export declare class MiddlewarePipeline {
    private handlers;
    addHandler(handler: (session: Session) => Promise<boolean>): void;
    execute(session: Session): Promise<boolean>;
}

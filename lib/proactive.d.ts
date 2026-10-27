import { Context, Session } from 'koishi';
import type { SAT } from './index';
import type { Sat } from './types';
export declare class ProactiveManager {
    private ctx;
    private sat;
    private config;
    private targets;
    private timer;
    private firing;
    constructor(ctx: Context, sat: SAT, config: Sat.Config);
    start(): void;
    stop(): void;
    /** 在私聊消息进入对话流程前调用：记录活跃并重新武装。 */
    touch(session: Session): void;
    private tick;
    private fire;
    private send;
    /** 清理长期沉默且不会再触发的目标，避免 Map 无限增长 */
    private prune;
    private hasEnoughFavorability;
    private isPrivateSession;
    private get minIdleMs();
    private get maxIdleMs();
    private nextDueAt;
    private inQuietHours;
}

import { Context, Session } from 'koishi';
import type { SAT } from './index';
import type { Sat } from './types';
export declare class ColdRescueManager {
    private ctx;
    private sat;
    private config;
    /** channelId -> 本群最后一条消息的时间 */
    private lastMessageAt;
    /** channelId -> 本群消息序号；同一毫秒内的两条消息也能区分 */
    private messageSeq;
    /** channelId -> 最后一条消息，用于判断是不是同一个人接着说 */
    private lastSession;
    /** channelId -> 待触发的救场 */
    private pending;
    constructor(ctx: Context, sat: SAT, config: Sat.Config);
    /**
     * 每条群消息都会经过这里：更新本群最后活动时间，并处理待触发的救场。
     * 开口的人自己接着说时重新计时（不算有人回复）；其他人或 bot 发言则取消。
     * 返回这条消息的序号表示它发生在十分钟沉默之后，符合「冷场开口」；
     * 否则返回 null。
     */
    observe(session: Session): number | null;
    /**
     * 冷场开口的消息已经进入群聊环境，武装一分钟后的救场。
     * seq 是 observe 返回的序号；等待期间有其他人说话就不再武装。
     */
    arm(session: Session, seq: number): void;
    stop(): void;
    private schedule;
    private rearm;
    private fire;
    private clearPending;
}

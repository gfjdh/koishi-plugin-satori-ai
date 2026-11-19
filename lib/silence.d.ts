import { Context } from 'koishi';
/** 提示词里展示给模型的触发词形式；N 是模型自己决定的分钟数 */
export declare const SILENCE_MARKER = "[\u6C89\u9ED8N]";
export interface SilenceTrigger {
    content: string;
    triggered: boolean;
    /** 模型决定的沉默分钟数 */
    minutes: number;
}
/** 从回复里取出触发词：返回去掉触发词后的内容、是否触发、以及模型指定的时长 */
export declare function stripSilenceMarker(content: string): SilenceTrigger;
/** 静默/封禁期间也放行的运维指令：查看、管理员封禁/解封 */
export declare function isMuteControlCommand(name: string): boolean;
/** 解析管理员输入的封禁时长（分钟）；非法输入返回 null，0 表示永久 */
export declare function parseBanMinutes(input?: string): number | null;
export interface SatSilence {
    id: number;
    userId: string;
    /** 解除时间；null 表示永久 */
    until: Date | null;
    /** model = 模型主动静默；admin = 管理员封禁 */
    source: string;
    /** 管理员封禁时的操作者；模型触发时为空字符串 */
    operator: string;
    createdAt: Date;
}
declare module 'koishi' {
    interface Tables {
        sat_silence: SatSilence;
    }
}
export declare function extendSilenceDatabase(ctx: Context): void;
/** 剩余分钟数；永久封禁返回 0（用 until === null 判断） */
export declare function silenceRemainingMinutes(row: SatSilence): number;
export declare class SilenceManager {
    private ctx;
    constructor(ctx: Context);
    /** 当前状态；到期记录顺手清理 */
    info(userId: string): Promise<SatSilence | null>;
    isMuted(userId: string): Promise<boolean>;
    /**
     * 开始静默/封禁：minutes = 0 表示永久（管理员封禁用）。
     * source 区分模型主动静默与管理员封禁，只影响日志和查看文案。
     */
    apply(userId: string, minutes: number, source: 'model' | 'admin', operator?: string): Promise<SatSilence>;
    /** 解除静默或封禁；返回是否真的解除了 */
    lift(userId: string): Promise<boolean>;
}

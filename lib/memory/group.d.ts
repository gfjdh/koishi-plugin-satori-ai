import { SatDialogue } from './schema';
/** 群记忆的 scopeId 前缀。按人记忆用 userId，两者在 sat_* 表里不会撞车 */
export declare const GROUP_SCOPE_PREFIX = "g:";
/** 群友发言 */
export declare const GROUP_MEMBER_KIND = "ambient";
/** 机器人在群里的发言 */
export declare const GROUP_BOT_KIND = "ambient-bot";
export declare const GROUP_KINDS: string[];
/** 一条消息之后沉默超过这么久，这一块就算结束 */
export declare const GROUP_GAP_MS: number;
/** 一块最多多少条消息；到上限立即闭合，保证每块的模型输入可控 */
export declare const GROUP_MAX_MESSAGES = 300;
/** 一块最长跨度；超过就断开，避免一段长会话拖成超大块 */
export declare const GROUP_MAX_SPAN_MS: number;
/** 短于此长度的发言没有信息量（“草”“哈哈哈”“？”），归档时丢掉 */
export declare const GROUP_MIN_MESSAGE_LEN = 4;
/** 长于此长度的发言多半是复制粘贴或公告，归档时丢掉以节省 token */
export declare const GROUP_MAX_MESSAGE_LEN = 200;
/** 群聊原始消息只在归档前有用，保留 30 天足够覆盖积压 */
export declare const GROUP_RETENTION_DAYS = 30;
export declare function isGroupScope(scopeId: string): boolean;
export declare function groupScopeId(channelId: string): string;
/**
 * 是否群聊会话。与 middleware 的 isPrivateSession 同一口径：
 * 私聊有两种形态（subtype 或 channelId 前缀），其余都按群聊处理。
 * 群聊记忆只关心「一群人在一起说话」，不区分具体平台。
 */
export declare function isGroupSession(session: {
    channelId?: string;
    subtype?: string;
    isDirect?: boolean;
}): boolean;
export interface GroupBlockOptions {
    gapMs?: number;
    maxMessages?: number;
    maxSpanMs?: number;
}
export interface GroupBlockSelection {
    /** 本次要归档的连续消息（已按 createdAt 升序） */
    block: SatDialogue[];
    /** 块是否已经闭合：闭合才归档，否则等下一轮心跳 */
    closed: boolean;
}
/**
 * 从游标开始挑出第一个可归档的时间块。
 *
 * rows 必须按 createdAt 升序、且全部落在同一个自然日内，
 * 调用方应多取一条（limit = maxMessages + 1）用来判断后面是否还有消息。
 *
 * 闭合判据（任一成立）：
 * · 块内已到条数上限——硬切，后面的消息属于下一块；
 * · 取到的消息没被全部用掉——说明下一条与块尾的间隔超过阈值，或已到上限；
 * · 这一天已经结束；
 * · 当天还没结束，但块尾之后已经沉默满一个间隔，不会再有消息并进来。
 */
export declare function selectGroupBlock(rows: SatDialogue[], dayEnd: Date, now: Date, options?: GroupBlockOptions): GroupBlockSelection;
/**
 * 归档前的抽取式压缩，不调用模型：
 * · 丢掉过短（无信息量）和过长（复制粘贴/公告）的发言；
 * · 同一个人连续发言合并成一行，减少发言人标签的噪音。
 *
 * 只影响送给模型的文本，原始消息仍然完整保留在库里，30 天后统一清理。
 */
export declare function compressGroupRows(rows: SatDialogue[]): SatDialogue[];

import { Granularity, SatDialogue, SatMemory } from './schema';
/** 由粗到细；topic 是最后一级 */
export declare const DIGEST_LEVELS: Granularity[];
export declare const DIGEST_MAX_CHARS = 200;
/** 未归档原始消息最多取多少条，避免归档积压时输入失控 */
export declare const DIGEST_MAX_RAW_MESSAGES = 300;
/**
 * 按「粗粒度优先」挑出覆盖 (from, now] 的记忆节点。
 *
 * 每取完一级就把游标推到该级最后一个节点的末尾，下一级只补之后的空档。
 * 最早那个节点的 periodStart 可能早于 from——这是允许的，粗粒度记忆本来
 * 就是整段整段的（例如用户昨天中午发言，昨天的日节点仍然纳入）。
 *
 * fetchNodes 由调用方绑定到具体的数据源，便于离线测试。
 */
export declare function selectDigestNodes(from: Date, now: Date, fetchNodes: (level: Granularity, after: Date, to: Date) => Promise<SatMemory[]>): Promise<{
    nodes: SatMemory[];
    cursor: Date;
}>;
export declare function formatDigestMaterials(nodes: SatMemory[], rows: SatDialogue[], timezoneOffset: number): string;
/** 概要只需要一段话：去掉代码块、压平换行，并截到 200 字 */
export declare function clampDigest(text: string, max?: number): string;

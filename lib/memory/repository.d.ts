import { Context } from 'koishi';
import { Granularity, ProfileData, SatDialogue, SatKnowledge, SatMemory, SatMeta, SatProfile } from './schema';
export declare class MemoryRepository {
    private ctx;
    /**
     * SQLite 的同一个连接不支持并发或嵌套事务（会报
     * "cannot start a transaction within a transaction"）。群消息批量写入
     * 和归档提交都可能同时发生，所以所有 transact 统一走这条串行链。
     */
    private txChain;
    constructor(ctx: Context);
    private transact;
    createDialogue(row: Omit<SatDialogue, 'id'>): Promise<void>;
    /**
     * 批量写入对话。minato 的 create 只接受单行，这里包在一个事务里，
     * 避免 10 万级迁移数据每行一个隐式事务。
     */
    createDialogueBatch(rows: Omit<SatDialogue, 'id'>[]): Promise<void>;
    getDialoguesAfter(scopeId: string, after: Date, options?: {
        kinds?: string[];
        limit?: number;
        before?: Date;
    }): Promise<SatDialogue[]>;
    /**
     * 与 getDialoguesAfter 相同，但从新到旧取。
     * 群日报在积压超过上限时要保留最近的发言，而不是最早的一段。
     */
    getRecentDialoguesAfter(scopeId: string, after: Date, options?: {
        kinds?: string[];
        limit?: number;
        before?: Date;
    }): Promise<SatDialogue[]>;
    /** after < createdAt < before 的最后一条对话时间，用于跳过当天剩余部分 */
    getLastDialogueInRange(scopeId: string, after: Date, before: Date, kinds?: string[]): Promise<Date | null>;
    /** 某个用户在某个 scope 里的最后一条发言时间（群聊「省流」的起点） */
    getLastDialogueByUser(scopeId: string, userId: string, kinds?: string[]): Promise<Date | null>;
    /**
     * 区间内发过言的群友，按发言条数降序。
     * 群日报用它把模型选出的「今日最喜欢」昵称映射回 userId——昵称只在
     * 原始消息里有，已归档的话题记忆只保留文本。
     */
    getDialogueParticipants(scopeId: string, after: Date, before: Date, kinds?: string[]): Promise<{
        userId: string;
        username: string;
        count: number;
    }[]>;
    /**
     * 最近 24 小时每小时的群消息条数（按本地小时分桶，索引 0-23）。
     * 报告头部的「24h 活跃轨迹」用它画柱状图。
     */
    getHourlyMessageCounts(scopeId: string, from: Date, to: Date, timezoneOffset: number, kinds?: string[]): Promise<number[]>;
    countDialoguesAfter(scopeId: string, after: Date, kinds?: string[]): Promise<number>;
    /** after < createdAt < before 的对话数，用于判断一个已关闭的日块是否归档干净 */
    countDialoguesInRange(scopeId: string, after: Date, before: Date, kinds?: string[]): Promise<number>;
    /** since 之后的对话数。用数据库 COUNT，避免把整段历史拉进内存。 */
    countDialoguesSince(scopeId: string, since: Date, kinds?: string[]): Promise<number>;
    /** 该 scope 最早/最晚一条对话的时间（走 scopeId+createdAt 索引） */
    getDialogueTimeRange(scopeId: string, kinds?: string[]): Promise<{
        first: Date | null;
        last: Date | null;
    }>;
    /** 只清理普通对话，legacy 迁移数据保留（一次性数据，量有界） */
    pruneDialogues(before: Date): Promise<number>;
    /**
     * 清理过期的群聊原始消息。群消息只是归档素材，归档后就失去价值，
     * 保留期比按人对话短得多（默认 30 天），否则每年会多出几百万行。
     */
    pruneGroupDialogues(before: Date): Promise<number>;
    getMeta(scopeId: string): Promise<SatMeta | null>;
    ensureMeta(scopeId: string, at?: Date): Promise<SatMeta>;
    touchMeta(scopeId: string, at?: Date): Promise<void>;
    /**
     * 只在更晚时才更新 lastActiveAt。迁移会拿旧对话的时间回填这个字段，
     * 不能让历史时间把「最近活跃」往回拨、把 scope 挤出活跃窗口。
     */
    touchMetaIfNewer(scopeId: string, at: Date): Promise<void>;
    /**
     * 只推进归档游标，不动 lastActiveAt。
     * 游标是历史时间（本批对话的末尾），写进 lastActiveAt 会让 scope 归档完
     * 立刻掉出活跃窗口，只能等用户再开口才会被心跳重新选中——历史积压就永远
     * 只能一条消息推一批。
     */
    setTopicStart(scopeId: string, at: Date): Promise<void>;
    setMigratedAt(scopeId: string, at: Date): Promise<void>;
    /** 上一次报告的时间；只用于同一天不重复奖励，不参与选材 */
    getDailyDigestAt(scopeId: string): Promise<Date | null>;
    setDailyDigestAt(scopeId: string, at: Date): Promise<void>;
    /** 上一份报告选中的「最喜欢」；没有时返回 null */
    getLastFavorite(scopeId: string): Promise<{
        userId: string;
        username: string;
    } | null>;
    setLastFavorite(scopeId: string, userId: string, username: string): Promise<void>;
    /** 已经发出的报告期数；报头显示「第 N 期」 */
    getReportCount(scopeId: string): Promise<number>;
    setReportCount(scopeId: string, count: number): Promise<void>;
    /**
     * 活跃 scope：最近活跃时间不早于 since。不传 limit 时返回全部。
     * `__global__` 只用来记迁移时间，不是对话作用域——它有 meta 但没有对话，
     * 会被心跳当成候选白占一个处理名额（它的 lastActiveAt 每次都被刷新，永远排在前面）。
     */
    getActiveMetas(since: Date, limit?: number): Promise<SatMeta[]>;
    /** 某粒度的最新一条（按 periodEnd 排序，服务端 LIMIT 1，等价于 MAX(periodEnd)） */
    getLatestMemory(scopeId: string, granularity: Granularity): Promise<SatMemory | null>;
    /** 区间查询：from < periodEnd <= to，走真正的 SQL 条件而不是 JS 侧过滤 */
    getMemoriesInRange(scopeId: string, granularity: Granularity, from: Date | null, to: Date, limit?: number): Promise<SatMemory[]>;
    /** 某个时间点之前结束的最新节点（用于历史回填选材） */
    getLatestMemoryBefore(scopeId: string, granularity: Granularity, before: Date): Promise<SatMemory | null>;
    /** 自 since 之后是否新增过某粒度的记忆（群画像据此判断有没有新归档块） */
    hasMemoriesCreatedSince(scopeId: string, granularity: Granularity, since: Date): Promise<boolean>;
    createMemory(row: Omit<SatMemory, 'id'>): Promise<void>;
    /** 该 scope 是否已经产过分层记忆（用于判断迁移是否第一次跑） */
    hasAnyMemory(scopeId: string): Promise<boolean>;
    /**
     * 归档结果与游标推进必须一起生效。分成两次写的话，进程在中间被中断
     * （重启 / 崩溃）会留下没推进的游标，下一轮把同一批对话再归档一次。
     */
    commitTopicArchive(memory: Omit<SatMemory, 'id'>, scopeId: string, topicStart: Date): Promise<void>;
    /**
     * 合并归档：多条 topic 记忆与游标推进一起提交。
     * 中间失败不会留下「写了一半天节点、游标却没动」的半截状态。
     */
    commitTopicArchives(memories: Omit<SatMemory, 'id'>[], scopeId: string, topicStart: Date): Promise<void>;
    getRecallCandidates(scopeId: string, granularities: Granularity[], since: Date): Promise<SatMemory[]>;
    clearScope(scopeId: string): Promise<void>;
    clearAll(): Promise<void>;
    getKnowledge(kind: string, targetId: string): Promise<SatKnowledge[]>;
    addKnowledge(kind: string, targetId: string, content: string): Promise<void>;
    /** 幂等添加：内容完全相同则跳过 */
    addKnowledgeIfAbsent(kind: string, targetId: string, content: string): Promise<boolean>;
    getProfile(scopeId: string): Promise<SatProfile | null>;
    saveProfile(scopeId: string, data: ProfileData): Promise<void>;
}

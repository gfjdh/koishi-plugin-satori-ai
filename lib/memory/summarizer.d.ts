import { Context } from 'koishi';
import { APIClient } from '../api';
import { User } from '../types';
import { MemoryRepository } from './repository';
import { SatDialogue } from './schema';
import { ProfileManager } from './profile';
export declare const TOPIC_MIN_TURNS = 5;
export declare const TOPIC_MAX_TURNS = 20;
export declare const TOPIC_MAX_AGE_HOURS = 24;
export declare const MAX_ARCHIVE_DIALOGUES = 200;
/**
 * 合并归档：一次调用最多覆盖多少个自然日。
 * 实测 5 天是吞吐拐点：再往上模型输出变长、单次延迟上升，
 * 每天摊到的耗时反而增加（10 天实测约 47 scope-day/分，5 天约 80）。
 */
export declare const MAX_BATCH_DAYS = 5;
/** 收集时最多向前走多少个自然日（中间可能有空白日期） */
export declare const MAX_BATCH_WALK_DAYS: number;
/** 参与合并的单日对话数上限；超过的日子单独走单日归档 */
export declare const BATCH_DAY_MAX_DIALOGUES = 30;
/** 一次合并归档的对话总数上限 */
export declare const BATCH_TOTAL_MAX_DIALOGUES = 80;
/** 同一天连续失败多少次后跳过，避免一个坏日堵死整个 scope */
export declare const TOPIC_SKIP_AFTER_FAILURES = 3;
export declare const MAX_CHILDREN_PER_SUMMARY = 100;
/** 单个 scope 一次心跳里最多建立多少个层级节点，防止历史积压把 tick 拖死 */
export declare const MAX_LEVEL_NODES_PER_TICK = 10;
/** 每次心跳默认的辅助模型调用上限（归档 + 多子节点汇总 + 日画像） */
export declare const DEFAULT_MAX_CALLS_PER_TICK = 8;
declare const LEVEL_ORDER: readonly ["day", "week", "month", "season", "year"];
type Level = typeof LEVEL_ORDER[number];
export interface SummarizerConfig {
    dryRun: boolean;
    topicSwitchCheck: boolean;
    timezoneOffset: number;
    dayBoundaryHour: number;
    /** 昵称列表；归档时从用户发言里抹掉，避免昵称被当成发言人 */
    nickNames?: string[];
    /** 机器人名字（昵称列表第一个）：归档输入与提示词里的发言人标签 */
    botName?: string;
    /** 每个 scope 每次汇总最多发起多少次辅助模型调用 */
    maxCallsPerTick?: number;
    /** scopeId -> 用户；用于让持“地灵殿通行证”的用户走自己的 key */
    resolveUser?: (scopeId: string) => Promise<User | null>;
    /** 群画像。群 scope 的日总结驱动它，而不是个人画像 */
    groupProfile?: ProfileManager;
}
/** 单次归档尝试的结果：ok 成功；empty 没有可归档内容；rejected 内容被模型审核拒绝；failed 其他失败 */
export type ArchiveOutcome = 'ok' | 'empty' | 'rejected' | 'failed';
/** 合并归档时模型返回的日期归一化为 YYYY/MM/DD */
export declare function normalizeDayKey(value?: string): string | null;
/** 模型侧的内容审核拒绝：这类错误重试同一段文本没有意义，直接跳过当天 */
export { isRejectedContent } from './reject';
export declare function formatTime(date: Date, timezoneOffsetHours: number): string;
/** 只到日期的格式，日/周/月等周期节点不需要分钟 */
export declare function formatDay(date: Date, timezoneOffsetHours: number): string;
export interface DialogueRow {
    userContent: string;
    aiContent: string;
    username?: string;
    createdAt: Date;
}
/**
 * 归档时要抹掉的昵称：昵称列表 + 「情侣合照」里存的专属昵称（用户的和 AI 的）。
 * 长名排前面，避免短名先替换后把长名拆碎。
 */
export declare function collectArchiveNickNames(baseNames: string[], user: Pick<User, 'items'> | null): string[];
/**
 * 把对话记录渲染成归档输入。
 *
 * 发言人只用固定标签标注，不用昵称：昵称在东方同人语境里常与角色同名，
 * 用户也可能在消息里用“名字：台词”的格式扮演角色或直接称呼 AI，
 * 靠识别名字判断身份是穷举不完的。这里让「行首标签」成为唯一判据，
 * 原话一律放进「」，内容里出现什么名字都不改变发言人。
 *
 * 在标签之外再加一层：用户发言里出现的昵称（昵称列表与「情侣合照」里的）
 * 直接抹掉，免得总结器把它们当成别的发言人写进记忆。
 *
 * 一个作用域里出现多个昵称时（按群记忆）才把昵称补在标签后面，
 * 只用来区分不同的人，不承担身份判断。
 */
export declare function formatDialogueRows(rows: DialogueRow[], timezoneOffset: number, names?: string[], botName?: string): string;
export interface GroupRowFormatOptions {
    /** 机器人发言的标签：归档默认用昵称列表第一个，省流材料用「你」 */
    botLabel?: string;
    /** 提问者的 userId；他的发言会额外标注，避免模型把别人的话当成他说的 */
    requesterId?: string;
}
/**
 * 群聊时间块的归档输入。
 *
 * 发言人由消息的 kind 决定，不从内容里猜：`ambient-bot` 是机器人，
 * 其余是群友，昵称只用来区分不同的人。群友之间本来就互相称呼，
 * 这里不做昵称抹除，否则「A 说 B 怎么样」会被删成残句。
 */
export declare function formatGroupRows(rows: SatDialogue[], timezoneOffset: number, options?: GroupRowFormatOptions): string;
/** date 所在自然日的起点：最近一个已过的日界线 */
export declare function dayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** date 所在自然日的终点（下一条日界线） */
export declare function nextDayStart(date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** date 所属的 level 周期起点：日 / 周一 / 月 / 季 / 年，均落在日界线上 */
export declare function periodStart(level: Level, date: Date, timezoneOffset: number, boundaryHour: number): Date;
/** level 周期的下一个起点（= 当前周期的终点） */
export declare function periodEnd(level: Level, start: Date, timezoneOffset: number, boundaryHour: number): Date;
export declare class Summarizer {
    private ctx;
    private repo;
    private api;
    private profile;
    private config;
    /** 同一 scope 同一时刻只跑一个汇总任务，避免心跳与话题切换并发写入 */
    private busy;
    /** scope:day -> 连续失败次数，成功或跳过后清除 */
    private topicFailures;
    /** scope -> 合并归档冷却截止时间 */
    private batchCooldown;
    constructor(ctx: Context, repo: MemoryRepository, api: APIClient, profile: ProfileManager, config: SummarizerConfig);
    private get tz();
    private get boundaryHour();
    private get botName();
    /**
     * 每轮对话后调用：必要时归档当前话题。
     * 注意：这里不阻塞回复，由调用方以 fire-and-forget 方式触发。
     */
    maybeSwitchTopic(scopeId: string): Promise<void>;
    /**
     * 把游标所在自然日内、尚未归档的对话归档为一条 topic 记忆。
     * 超过 MAX_ARCHIVE_DIALOGUES 时只取前 200 条（同一天拆成多块）。
     * 返回是否真的发起并完成了归档。
     */
    private archiveTopicLocked;
    /**
     * 收集从游标开始的连续稀疏日，最多 MAX_BATCH_DAYS 天。
     * 只有收集到 2 天以上才值得合并（否则单日路径更直接）：
     * 遇到对话数超过 BATCH_DAY_MAX_DIALOGUES 的日子、未闭合的当天或总量超限就停。
     */
    private collectArchiveBlocks;
    /**
     * 一次调用归档多个稀疏日，模型按 date 返回每天的结果。
     * 任何一天缺失都视为整批失败：调用方会退回单日路径，
     * 宁可慢一点，也不能把某天的内容写进别的日期。
     */
    private archiveBlocksLocked;
    private dayKey;
    /**
     * 跳过游标所在的日子（模型审核拒绝或连续失败）。
     * 当天还没结束时只跳到本批最后一条对话之后，绝不把游标推到未来。
     */
    private skipDay;
    /**
     * 按自然日消费积压：每次归档一个日块，直到预算用完。
     * - 全是空白的日期用一次查询跨过去，不逐天循环；
     * - 已关闭的日子必须归档干净（哪怕只剩 1 条），否则日级永远等不到闭合；
     * - 进行中的当天沿用旧语义：话题超过 24 小时才兜底归档。
     */
    private drainTopics;
    /**
     * 群聊的归档游标推进：块尾之后 1ms。
     * 群里同一毫秒可能有多条消息，用 `$gt` 时不能停在块尾的时间戳上，
     * 否则会把同一毫秒里排在后面的消息漏掉。
     */
    private groupNextCursor;
    /**
     * 按时间块消费群聊积压。每块一次模型调用，热路径上没有任何判断调用。
     * 未闭合的块（还在沉默阈值内）留到下一轮心跳。
     */
    private drainGroupBlocks;
    /** 一个时间块归档为一条 topic 记忆 */
    private archiveGroupBlock;
    summarizeScope(scopeId: string): Promise<void>;
    /** 群 scope 用群画像，按人 scope 用个人画像；群画像未启用时返回 null */
    private profileFor;
    /** 用金字塔里的高层汇总做一次性画像回填 */
    private backfillProfile;
    /**
     * 选材：优先用最近的一季汇总（覆盖约三个月），没有就退到月、周。
     * 年汇总刻意不用：它通常只覆盖上一个完整自然年，信息过旧。
     */
    private collectBackfillSections;
    /**
     * 自下而上补齐已闭合的周期，每个周期最多一条节点。
     *
     * 起算点来自该层最新节点的 periodEnd（没有则取最早子节点所在周期），
     * 因此不会重复生成同一周期；空周期没有子节点，会被自然跳过。
     * 周期末尾晚于归档游标时说明周期内的对话还没归档完，立即停止该层。
     */
    private buildLevels;
    private formatDialogues;
    private formatChildren;
    /** 解析失败不应让后台归档整体失败，退回默认辅助模型即可。 */
    private lookupUser;
    private runExclusive;
}

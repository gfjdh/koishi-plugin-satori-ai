import { Session } from 'koishi';
import { MemoryRepository } from './repository';
import { ProfileManager } from './profile';
import { ShortTermMemory } from './short-term';
export interface PromptContext {
    common: string;
    group: string;
    ambient: string;
    stats: string;
    /** 每轮必变：由 index.tsx 拼在系统提示最末尾，避免它前面的内容无法命中前缀缓存 */
    datetime: string;
    pyramid: string;
    recalled: string;
    profile: string;
    /** 群聊记忆金字塔：与按人记忆并存，预算约为个人金字塔的一半 */
    groupPyramid: string;
    /** 群画像：群特征、活跃群友、群友关系等 */
    groupProfile: string;
}
export interface ContextConfig {
    enabled: boolean;
    commonTopN: number;
    dialogueTopN: number;
    recallTopN: number;
    retentionDays: number;
    timezoneOffset: number;
    /** 日界线小时，必须与汇总侧一致（periodStart/periodEnd 的边界） */
    dayBoundaryHour?: number;
    dialogueStatsEnabled: boolean;
    memoryConfig: any;
    /** 是否启用群聊记忆注入（与群记忆开关一致） */
    groupEnabled?: boolean;
    /** 可注入时钟，便于验证周期覆盖；生产环境不传 */
    now?: () => Date;
}
export interface PromptBuildOptions {
    /** 不注入金字塔（个人与群）。省流这类一次性任务只要画像和当前材料 */
    skipPyramid?: boolean;
    /** 不注入关键词召回 */
    skipRecall?: boolean;
    /** 群聊环境里不注入 bot 自己的发言（随机插话时避免复读） */
    excludeSelfDialogue?: boolean;
}
export declare class ContextBuilder {
    private repo;
    private shortTerm;
    private profile;
    private config;
    private groupProfileManager?;
    constructor(repo: MemoryRepository, shortTerm: ShortTermMemory, profile: ProfileManager, config: ContextConfig, groupProfileManager?: ProfileManager);
    build(session: Session, query: string, options?: PromptBuildOptions): Promise<PromptContext>;
    /** 群记忆只在群聊会话里注入；私聊没有「群」可言 */
    private groupScopeFor;
    private now;
    private get boundaryHour();
    /** 当前时间精确到秒，是整段提示里变化最快的内容，只能放在最后。 */
    private buildDateTime;
    private buildKnowledge;
    private wrapCommon;
    private pickTop;
    /**
     * 全时间范围覆盖：每一级都注入它所属父周期内的**全部**节点，而不是各级只取最新一条。
     *
     *   所有年份
     *   → 今年所有已闭合季度
     *   → 本季所有已闭合月份
     *   → 本月所有已闭合周
     *   → 本周所有已闭合天
     *   → 还没归入任何一天的话题
     *
     * 父周期尚未闭合时它本身没有节点，下一级正好补上这一段，因此时间轴上不会出现空洞。
     * 归属判定与汇总侧一致：子节点落在 (父起点, 父终点]，即 periodEnd - 1ms 所在周期。
     */
    private buildPyramid;
    /** 多条记忆必须带时间范围，否则模型无法区分哪条属于哪一段 */
    private formatMemory;
    private renderPyramid;
    /** 运维命令用：返回与注入系统提示完全一致的金字塔文本 */
    buildMemoryView(scopeId: string): Promise<string>;
    private buildRecall;
}

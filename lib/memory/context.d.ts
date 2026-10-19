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
}
export interface ContextConfig {
    enabled: boolean;
    commonTopN: number;
    dialogueTopN: number;
    recallTopN: number;
    retentionDays: number;
    contextMaxChars: number;
    timezoneOffset: number;
    /** 日界线小时，必须与汇总侧一致（periodStart/periodEnd 的边界） */
    dayBoundaryHour?: number;
    dialogueStatsEnabled: boolean;
    memoryConfig: any;
    /** 可注入时钟，便于验证周期覆盖；生产环境不传 */
    now?: () => Date;
}
export declare class ContextBuilder {
    private repo;
    private shortTerm;
    private profile;
    private config;
    constructor(repo: MemoryRepository, shortTerm: ShortTermMemory, profile: ProfileManager, config: ContextConfig);
    build(session: Session, query: string): Promise<PromptContext>;
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
    /**
     * 超出预算时按“越近越优先”的顺序削减：
     * ① 每层先只保留最新的一条（尽量维持每一级的覆盖）；
     * ② 再从最粗的层级开始整段丢弃：历年 → 今年各季 → 本季各月 → 本月各周 → 本周每日；
     * ③ 仍超限时硬截断，保留开头（最新的话题）。
     * 召回最先整体移除。常识、群常识、群聊环境与画像保持完整（它们通常很短且高频有用）。
     */
    private applyBudget;
}

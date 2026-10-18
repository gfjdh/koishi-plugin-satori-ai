import { Session } from 'koishi';
import { MemoryRepository } from './repository';
import { ProfileManager } from './profile';
import { ShortTermMemory } from './short-term';
export interface PromptContext {
    common: string;
    group: string;
    ambient: string;
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
    memoryConfig: any;
}
export declare class ContextBuilder {
    private repo;
    private shortTerm;
    private profile;
    private config;
    constructor(repo: MemoryRepository, shortTerm: ShortTermMemory, profile: ProfileManager, config: ContextConfig);
    build(session: Session, query: string): Promise<PromptContext>;
    private buildKnowledge;
    private wrapCommon;
    private pickTop;
    private buildPyramid;
    private buildRecall;
    /**
     * 超出预算时按“越近越优先”的顺序削减：
     * 年度 → 近季 → 近月 → 召回 → 近周 → 近日 → 近期话题。
     * 常识、群常识、群聊环境与画像保持完整（它们通常很短且高频有用）。
     */
    private applyBudget;
}

/**
 * 一碰一（OneTouch）的纯规则引擎（暂未使用）。
 *
 * 这里只放不依赖 koishi / puppeteer 的逻辑：状态、技能结算、动作模拟、
 * 局面评估。线上游戏（gameOneTouch.ts）与离线训练脚本共用同一份实现，
 * 避免出现「训练时一套规则、线上另一套规则」。
 */
export declare enum playerStatus {
    Normal = 0,// 正常状态
    Stunned = 1,// 眩晕状态
    lastStunned = 2
}
export interface PlayerState {
    left: number;
    right: number;
    hp: number;
    shield?: number;
    strength?: number;
    bleed?: number;
    counterAttack?: number;
    vulnerablility?: number;
    status: playerStatus;
}
export interface SkillEffect {
    name?: string;
    damage?: number;
    damageTimes?: number;
    pierceDamage?: number;
    heal?: number;
    shield?: number;
    bleed?: number;
    selfbleed?: number;
    stun?: boolean;
    destroyShield?: number;
    weakStun?: boolean;
    selfStun?: boolean;
    strengthChange?: number;
    selfstrengthChange?: number;
    addSelfLeft?: number;
    addSelfRight?: number;
    addLeft?: number;
    addRight?: number;
    counterAttack?: number;
    vulnerablility?: number;
    magnificentEnd?: boolean;
    revwersalOfStrength?: boolean;
}
export declare const SKILL_MAP: {
    [key: string]: SkillEffect;
};
export declare function resolveCombo(a: number, b: number): SkillEffect | null;
export declare function applySkillEffect(self: PlayerState, enemy: PlayerState, effect: SkillEffect, isCombo: boolean): void;
export declare function buildEffectMessage(effect: SkillEffect, isCombo: boolean, self: PlayerState, enemy: PlayerState): string;
export declare function cloneState(state: PlayerState): PlayerState;
export declare function generatePossibleMoves(attacker: PlayerState, defender: PlayerState): [number, number][];
/**
 * 执行一步动作，返回新状态（[玩家0, 玩家1] 顺序不变，入参不会被修改）。
 *
 * 与 processPlayerTurn / processAiTurn / simulateMove 保持同一套结算顺序。
 */
export declare function stepState(state: [PlayerState, PlayerState], move: [number, number], actorIndex: 0 | 1): [PlayerState, PlayerState];
export declare const BASE_HP = 40;
export declare const HP_PER_LEVEL = 10;
export declare const TERMINAL_SCORE = 1000000;
export declare function totalHp(level: number): number;
export declare const FEATURE: {
    readonly HP_DIFF: 0;
    readonly SELF_LOW_HALF: 1;
    readonly SELF_LOW_QUARTER: 2;
    readonly SELF_LOW_EIGHTH: 3;
    readonly OPP_LOW_HALF: 4;
    readonly OPP_LOW_QUARTER: 5;
    readonly OPP_LOW_EIGHTH: 6;
    readonly SELF_STRENGTH: 7;
    readonly OPP_STRENGTH: 8;
    readonly SELF_SHIELD: 9;
    readonly OPP_SHIELD: 10;
    readonly SELF_BLEED_SQ: 11;
    readonly OPP_BLEED_SQ: 12;
    readonly SELF_STUN: 13;
    readonly OPP_STUN: 14;
    readonly SELF_COUNTER: 15;
    readonly OPP_COUNTER: 16;
    readonly SELF_VULN: 17;
    readonly OPP_VULN: 18;
    readonly SELF_COMBO_READY: 19;
    readonly OPP_COMBO_READY: 20;
    readonly SELF_SWING: 21;
    readonly OPP_SWING: 22;
    readonly SELF_LETHAL: 23;
    readonly OPP_LETHAL: 24;
    readonly SELF_COMBO_SWING: 25;
    readonly OPP_COMBO_SWING: 26;
    readonly SELF_SWING_NOW: 27;
    readonly OPP_SWING_NOW: 28;
    readonly SELF_LETHAL_NOW: 29;
    readonly OPP_LETHAL_NOW: 30;
    readonly TEMPO: 31;
    readonly BIAS: 32;
    readonly SELF_LEFT: 33;
    readonly SELF_RIGHT: 43;
    readonly OPP_LEFT: 53;
    readonly OPP_RIGHT: 63;
};
export declare const FEATURE_COUNT = 73;
/** 手牌 one-hot 的起始下标（训练时默认冻结这一段） */
export declare const HAND_FEATURE_START: 33;
export interface MoveTactics {
    swing: number;
    lethal: number;
    combo: number;
}
/**
 * 预览单个走法的血量交换（不修改状态）。
 *
 * 只关心血量变化，因此不需要真的克隆状态；结算顺序与 applySkillEffect 一致：
 * 力量反转 → 穿刺 → 破盾 → 流血/力量/易伤 → 治疗/护盾/自身力量 → 普通伤害
 * → 反击 → 自身流血结算 → 华丽收场。
 */
export declare function previewMove(state: [PlayerState, PlayerState], actor: 0 | 1, move: [number, number]): {
    swing: number;
    lethal: number;
    combo: number;
};
export declare function tacticsOf(state: [PlayerState, PlayerState], actor: 0 | 1): {
    swing: number;
    lethal: number;
    combo: number;
    comboSwing: number;
};
/** 当前手牌是否能在本回合直接凑出组合技 */
export declare function canTriggerCombo(self: PlayerState, opp: PlayerState): boolean;
/**
 * 将局面写成特征向量。perspective 为「我方」下标（0 或 1）。
 * 线上 AI 固定是 1，训练脚本两侧都会用到。
 *
 * toMove 给出「下一步轮到谁走」，用于 tempo 与「本回合威胁」交互特征；
 * 不传时这两类特征为 0。
 */
export declare function writeFeatures(state: [PlayerState, PlayerState], perspective: 0 | 1, out: Float64Array | number[], level: number, toMove?: 0 | 1): void;
export declare function featureScore(features: Float64Array | number[], weights: ArrayLike<number>): number;
/**
 * 从 perspective 视角评估局面。终局直接返回极值，与权重无关。
 */
export declare function evaluatePosition(state: [PlayerState, PlayerState], perspective: 0 | 1, level: number, weights: ArrayLike<number>, toMove?: 0 | 1): number;
/**
 * 旧版手调评估在特征空间中的等价权重。
 * 战术特征权重为 0，因此这组权重逐项等于线上旧评估（按总血量归一化）。
 * 用作训练起点、回归基线和未训练时的回退。
 */
export declare function handcraftedWeights(): number[];
/**
 * 手调的手牌感知权重：在旧评估基础上加入一步战术特征。
 * 作为训练起点，也可以直接当作「未训练但不瞎」的评估使用。
 */
export declare function tacticalWeights(): number[];
export declare function isValidWeights(weights: unknown): weights is number[];

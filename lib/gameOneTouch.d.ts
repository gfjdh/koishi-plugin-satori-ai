import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
import { winFlag } from './game';
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
export interface OneTouchResult extends gameResult {
    win: winFlag;
    bonus: number;
}
export declare const SKILL_MAP: {
    [key: string]: SkillEffect;
};
declare class OneTouchSingleGame extends abstractGameSingleGame {
    private player;
    private ai;
    level: number;
    private winningFlag;
    private turnCount;
    private baseHP;
    private playerLevelHP;
    private aiLevelHp;
    private lastScore;
    private bonus;
    private singleBonus;
    private singleBonusMultiplier;
    private comboCombos;
    constructor(disposeListener: () => boolean, session: Session);
    startGame(): Promise<string>;
    endGame: () => Promise<OneTouchResult>;
    private initState;
    processInput(input: string): Promise<string>;
    private buildTurnResult;
    private judgeEnd;
    private processPlayerTurn;
    private buildMyTurnBonusMessage;
    private processAiTurn;
    private buildAiTurnBonusMessage;
    private applyEffect;
    private checkCombo;
    private buildResultMessage;
    private aiSearchEntrance;
    private aiSearch;
    private generatePossibleMoves;
    private cloneState;
    private simulateMove;
    private generateChat;
    private instuction;
    private skillList;
}
export declare const ONE_TOUCH_SKILL_LIST: string;
export declare function resolveCombo(a: number, b: number): SkillEffect | null;
export declare function applySkillEffect(self: PlayerState, enemy: PlayerState, effect: SkillEffect, isCombo: boolean): void;
export declare function buildEffectMessage(effect: SkillEffect, isCombo: boolean, self: PlayerState, enemy: PlayerState): string;
export declare class OneTouchGame extends abstractGame<OneTouchSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<OneTouchSingleGame>;
}
export declare function wrapInHTML(str: string): Promise<string>;
export {};

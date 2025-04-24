import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
import { winFlag } from './game';
export interface OneTouchResult extends gameResult {
    win: winFlag;
    bonus: number;
}
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
    private applyEffectToEnemy;
    private applyEffectToSelf;
    private checkCombo;
    private buildResultMessage;
    private aiSearchEntrance;
    private aiSearch;
    private generatePossibleMoves;
    private cloneState;
    private simulateMove;
    private evaluateState;
    private generateChat;
    private instuction;
}
export declare class OneTouchGame extends abstractGame<OneTouchSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<OneTouchSingleGame>;
}
export {};

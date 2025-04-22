import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
import { winFlag } from './game';
export interface OneTouchResult extends gameResult {
    win: winFlag;
    message: string;
    playerId: number;
}
declare class OneTouchSingleGame extends abstractGameSingleGame {
    private player;
    private ai;
    level: number;
    private winningFlag;
    private turnCount;
    private baseHP;
    private levelHP;
    private HPtoMax;
    constructor(disposeListener: () => boolean, session: Session);
    startGame(): Promise<string>;
    endGame: () => Promise<{
        message: string;
        win: winFlag;
        gameName: string;
        playerID: string;
    }>;
    private initState;
    processInput(input: string): Promise<string>;
    private buildTurnResult;
    private judgeEnd;
    private processPlayerTurn;
    private processAiTurn;
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
    private debugState;
}
export declare class OneTouchGame extends abstractGame<OneTouchSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<OneTouchSingleGame>;
}
export {};

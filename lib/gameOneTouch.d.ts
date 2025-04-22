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
    constructor(disposeListener: () => boolean, session: Session);
    private generateHands;
    startGame(): Promise<string>;
    processInput(input: string): Promise<string>;
    private buildTurnResult;
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

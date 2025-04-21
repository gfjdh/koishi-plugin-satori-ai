import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
export interface OneTouchResult extends gameResult {
    win: boolean;
}
declare class OneTouchSingleGame extends abstractGameSingleGame {
    private players;
    private currentPlayer;
    level: number;
    private lastStunned;
    constructor(disposeListener: () => boolean, session: Session);
    private generateHands;
    private applyEffect;
    private checkCombo;
    private processTurn;
    private buildResultMessage;
    startGame(): Promise<string>;
    processInput(input: string): Promise<string>;
    private aiSearch;
    private generatePossibleMoves;
    private cloneState;
    private simulateMove;
    private applySimulatedEffect;
    private evaluateState;
}
export declare class OneTouchGame extends abstractGame<OneTouchSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<OneTouchSingleGame>;
}
export {};

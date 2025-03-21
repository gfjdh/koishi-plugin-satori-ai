import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
export declare enum winFlag {
    win = 1,
    lose = 2,
    draw = 3,
    pending = 4
}
export interface goBangGameResult extends gameResult {
    win: winFlag;
}
declare class goBangSingleGame extends abstractGameSingleGame {
    constructor(disposeListener: () => boolean, session: Session);
    startGame: () => string;
    endGame: () => {
        message: string;
        win: winFlag;
        gameName: string;
    };
    private playerFlag;
    private winningFlag;
    level: number;
    processInput(str: string): Promise<string>;
    private checkWin;
    static readonly numberEmojis: string[];
    private printBoard;
    private board;
}
export declare class goBang extends abstractGame<goBangSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): goBangSingleGame;
}
export {};

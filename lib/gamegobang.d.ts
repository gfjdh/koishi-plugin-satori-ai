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
    level: number;
}
/**
 * 五子棋单局实现类，继承自 abstractGameSingleGame
 */
declare class goBangSingleGame extends abstractGameSingleGame {
    private playerFlag;
    private winningFlag;
    level: number;
    private board;
    constructor(disposeListener: () => boolean, session: Session);
    startGame: () => string;
    endGame: () => {
        message: string;
        win: winFlag;
        gameName: string;
    };
    /**
     * 处理玩家输入（落子坐标）
     * @param str 输入内容，格式为 "x y"
     */
    processInput(str: string): Promise<string>;
    private checkWin;
    private checkDirection;
    private printBoard;
}
/**
 * 五子棋管理类，继承自 abstractGame
 */
export declare class goBang extends abstractGame<goBangSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): goBangSingleGame;
}
export {};

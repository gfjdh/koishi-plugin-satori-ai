import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
import { winFlag } from './game';
export interface goBangGameResult extends gameResult {
    win: winFlag;
    message: string;
}
/**
 * 五子棋单局实现类，继承自 abstractGameSingleGame
 */
declare class goBangSingleGame extends abstractGameSingleGame {
    private playerFlag;
    private winningFlag;
    level: number;
    private board;
    private lastScore;
    private turnsCount;
    constructor(disposeListener: () => boolean, session: Session);
    startGame: () => Promise<string>;
    endGame: () => Promise<{
        message: string;
        win: winFlag;
        gameName: string;
        playerID: string;
    }>;
    /**
     * 处理玩家输入（落子坐标）
     * @param str 输入内容，格式为 "x y"
     */
    processInput(str: string): Promise<string>;
    private getAIMove;
    private checkWin;
    private checkDirection;
    private printBoard;
    private generateChat;
}
/**
 * 五子棋管理类，继承自 abstractGame
 */
export declare class goBang extends abstractGame<goBangSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<goBangSingleGame>;
}
export {};

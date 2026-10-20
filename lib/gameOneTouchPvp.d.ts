import { Session, Context } from 'koishi';
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame';
/**
 * 一碰一 1v1 对战单局。双方都是真人，bot 只负责结算规则。
 */
export declare class OneTouchPvpSingleGame extends abstractGameSingleGame {
    private ctx;
    private players;
    private maxHp;
    private turn;
    private phase;
    private inviteTimer;
    private turnTimer;
    private onFinish;
    constructor(disposeListener: () => boolean, session: Session, ctx: Context, opponent: {
        id: string;
        name?: string;
    }, maxHp: number, onFinish: () => void);
    private createPlayer;
    private initState;
    startGame(): Promise<string>;
    processInput(input: string, session?: Session): Promise<string>;
    private startBattle;
    private render;
    private executeTurn;
    private buildTurnText;
    private formatStatus;
    private buildAttackerBonus;
    private buildDefenderBonus;
    private settleTurnBonus;
    private clearTurnTimer;
    private clearTimers;
    private resetTurnTimer;
    private settle;
    private abort;
    private finish;
    endGame(session?: Session): Promise<gameResult>;
    private rules;
}
/**
 * 一碰一 对战控制器：负责邀请、双方消息转发与单局生命周期。
 */
export declare class OneTouchPvpGame extends abstractGame<OneTouchPvpSingleGame> {
    constructor();
    startGame(session: Session, ctx: Context, args: string[]): Promise<abstractGameSingleGame | null>;
}

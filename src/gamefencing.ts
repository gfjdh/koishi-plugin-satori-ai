import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'

const logger = new Logger('satori-game-gobang')

export enum winFlag {
    win = 1,
    lose = 2,
    draw = 3,
    pending = 4
}

export interface fencingGameResult extends gameResult {
    win: winFlag
}

enum fencingAction {
    attack = 1,
    defence = 2
}

class fencingSingleGame extends abstractGameSingleGame {
    private winningFlag: winFlag = winFlag.pending
    private playerPosition: number
    private enemyPosition: number
    private availablePlayerActions: Array<fencingAction>
    static fencingActionHint = new Map([
        [fencingAction.attack, '攻击！'],
        [fencingAction.defence, '防御']
    ])

    constructor(disposeListener: () => boolean, session: Session) {
        super(disposeListener, session)
        this.playerPosition = 3
        this.enemyPosition = 7
        this.availablePlayerActions = []
    }

    private render(characters: { [key: number]: string }) {
        let res = ''
        for (let i = 0; i < 11; i++) {
            res += characters[i] || '⬜️'
        }
        return res
    }

    public override startGame = () => {
        this.availablePlayerActions.push(fencingAction.attack)
        this.availablePlayerActions.push(fencingAction.defence)
        let res = ''
        res += this.render({ [this.playerPosition]: '🟦', [this.enemyPosition]: '🟨' }) + '\n'
        res += "选择很多……\n"
        for (let i = 0; i < this.availablePlayerActions.length; i++) {
            res += '/ ' + fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i])
        }
        return res
    }

    public override endGame = () => {
        super.endGame()
        return { message: '击剑游戏结束', win: this.winningFlag, gameName: '击剑' }
    }

    private enemyDecision(playerPosition: number, enemyPosition: number): fencingAction {
        if (enemyPosition - playerPosition > 2) {
            return fencingAction.attack
        } else {
            const a = Math.random()
            if (a > 0.5) {
                return fencingAction.attack
            } else {
                return fencingAction.defence
            }
        }
    }

    public override async processInput(str: string) {
        let playerAttack: number
        let enemyAttack: number
        let playerDefence: number
        let enemyDefence: number
        let playerPreviosPosition: number
        let enemyPreviosPosition: number
        let playerAction: fencingAction
        let enemyAction: fencingAction
        const directionPlayerToEnemy = (this.enemyPosition - this.playerPosition) > 0 ? 1 : -1
        for (let i = 0; i < this.availablePlayerActions.length; i++) {
            if (str == fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i])) {
                playerAction = this.availablePlayerActions[i]
                break
            }
        }
        if (playerAction == undefined) {
            return
        }
        if (this.winningFlag != winFlag.pending) {
            return '游戏已结束'
        }
        enemyAction = this.enemyDecision(this.playerPosition, this.enemyPosition)
        let res = ''
        switch (playerAction) {
            case fencingAction.attack:
                playerAttack = this.playerPosition + directionPlayerToEnemy
                break
            case fencingAction.defence:
                playerDefence = this.playerPosition
                break
        }
        switch (enemyAction) {
            case fencingAction.attack:
                enemyAttack = this.enemyPosition - directionPlayerToEnemy
                break
            case fencingAction.defence:
                enemyDefence = this.enemyPosition
                break
        }

        const renderAndJudge = () => {
            if (this.playerPosition == this.enemyPosition) {
                const i = Math.random()
                if (i > 0.5) {
                    this.playerPosition -= directionPlayerToEnemy
                    if (playerDefence) {
                        playerDefence -= directionPlayerToEnemy
                    }
                } else {
                    this.enemyPosition += directionPlayerToEnemy
                    if (enemyDefence) {
                        enemyDefence += directionPlayerToEnemy
                    }
                }
            }
            if (this.playerPosition == enemyAttack && this.enemyPosition == playerAttack) {
                res += this.render({ [playerAttack]: '⚔️', [playerDefence]: '🛡️' }) + '\n'
                res += this.render({ [playerPreviosPosition]: '▫️', [enemyPreviosPosition]: '▫️', [this.playerPosition]: '🟦', [this.enemyPosition]: '🟨' }) + '\n'
                res += this.render({ [enemyAttack]: '⚔️', [enemyDefence]: '🛡️' }) + '\n'
            } else {
                res += this.render({ [playerAttack]: '🗡️', [playerDefence]: '🛡️' }) + '\n'
                res += this.render({ [playerPreviosPosition]: '▫️', [enemyPreviosPosition]: '▫️', [this.playerPosition]: '🟦', [this.enemyPosition]: '🟨' }) + '\n'
                res += this.render({ [enemyAttack]: '🗡️', [enemyDefence]: '🛡️' }) + '\n'
            }

            if (playerAttack == this.enemyPosition && enemyDefence != this.enemyPosition && enemyAttack != this.playerPosition) {
                this.winningFlag = winFlag.win
                res += '你击中了对手！'
            } else if (enemyAttack == this.playerPosition && playerDefence != this.playerPosition && playerAttack != this.enemyPosition) {
                this.winningFlag = winFlag.lose
                res += '对手击中了你！'
            }
            if (this.playerPosition < 0 || this.playerPosition > 10) {
                this.winningFlag = winFlag.lose
                res += '你走出了场地！'
            }
            if (this.enemyPosition < 0 || this.enemyPosition > 10) {
                this.winningFlag = winFlag.win
                res += '对手走出了场地！'
            }
            if (this.winningFlag != winFlag.pending) {
                return res
            }
        }

        renderAndJudge()

        res += '------------------------------\n'

        playerAttack = undefined
        enemyAttack = undefined
        playerDefence = undefined
        enemyDefence = undefined
        switch (playerAction) {
            case fencingAction.attack:
                playerPreviosPosition = this.playerPosition
                this.playerPosition += directionPlayerToEnemy
                playerDefence = this.playerPosition
                break
            case fencingAction.defence:
                playerPreviosPosition = this.playerPosition
                this.playerPosition -= directionPlayerToEnemy
                break
        }
        switch (enemyAction) {
            case fencingAction.attack:
                enemyPreviosPosition = this.enemyPosition
                this.enemyPosition -= directionPlayerToEnemy
                enemyDefence = this.enemyPosition
                break
            case fencingAction.defence:
                enemyPreviosPosition = this.enemyPosition
                this.enemyPosition += directionPlayerToEnemy
                break
        }

        renderAndJudge()

        res += "选择很多……\n"
        for (let i = 0; i < this.availablePlayerActions.length; i++) {
            res += '/ ' + fencingSingleGame.fencingActionHint.get(this.availablePlayerActions[i])
        }

        return res
    }
}

export class fencing extends abstractGame<fencingSingleGame> {
    constructor() {
        super(fencingSingleGame)
    }
}

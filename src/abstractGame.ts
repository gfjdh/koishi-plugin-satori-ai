import { Session, Logger, Context } from 'koishi'

const logger = new Logger('satori-game-gobang')
declare module 'koishi' {
    interface Events {
        'game-result'(session: Session, result: gameResult): void
    }
}

export interface gameResult {
    message: string
    gameName: string
}

export abstract class abstractGameSingleGame {
    protected session: Session
    protected disposeListener: () => boolean

    constructor(disposeListener: () => boolean, session: Session) {
        this.session = session
        this.disposeListener = disposeListener
    }

    public startGame() {
        return '游戏开始'
    }

    public endGame() {
        this.disposeListener()
        return { message: '游戏结束', gameName: 'null' }
    }

    public async processInput(str: string): Promise<string> { return '' }
}

type Constructor<T> = new (...args: any[]) => T

export abstract class abstractGame<T extends abstractGameSingleGame> {
    protected gameClass: Constructor<T>
    constructor(GameClass: Constructor<T>) {
        this.gameClass = GameClass
    }
    protected channelGames: Map<string, T> = new Map()
    protected listener: (userID: string, guildID: string) => ((session: Session) => void) = (userID, guildID) => {
        return async (session) => {
            if (session.userId === userID && session.guildId === guildID) {
                if (this.channelGames.get(session.channelId)) {
                    session.send(await this.channelGames.get(session.channelId).processInput(session.content))
                }
            }
        }
    }
    public startGame(session: Session, ctx: Context, args: string[]): abstractGameSingleGame | null {
        if (this.channelGames.get(session.channelId)) return null
        const dispose = ctx.on('message', this.listener(session.userId, session.guildId))
        this.channelGames.set(session.channelId, new this.gameClass(dispose, session))
        session.send(this.channelGames.get(session.channelId).startGame())
        return this.channelGames.get(session.channelId)
    }

    public endGame(session: Session, ctx: Context) {
        if (!this.channelGames.get(session.channelId)) return '当前频道没有游戏在进行中'
        const gameRes = this.channelGames.get(session.channelId).endGame()
        //session.send(gameRes.message)
        ctx.emit('game-result', session, gameRes)
        this.channelGames.delete(session.channelId)

        logger.info(`游戏已结束`)
        return
    }
}
import { Session, Logger, Context } from 'koishi'

const logger = new Logger('satori-game-gobang')
declare module 'koishi' {
    interface Events {
        'game-result'(session: Session, result: gameResult): void
    }
}

interface gameResult {
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
        return { message: '游戏结束' }
    }

    public processInput: (str: string) => string
}

type Constructor<T> = new (...args: any[]) => T

export abstract class abstractGame<T extends abstractGameSingleGame> {
    protected gameClass: Constructor<T>
    constructor(GameClass: Constructor<T>) {
        this.gameClass = GameClass
    }
    protected channelGames: Map<string, T> = new Map()
    protected listener: (userID: string, guildID: string) => ((session: Session) => void) = (userID, guildID) => {
        return (session) => {
            if (session.userId === userID && session.guildId === guildID) {
                if (this.channelGames[session.channelId]) {
                    session.send(this.channelGames[session.channelId].processInput(session.content))
                }
            }
        }
    }
    public startGame(session: Session, ctx: Context, args: string[]) {
        if (this.channelGames[session.channelId]) return '当前频道已经有游戏正在进行中'
        const dispose = ctx.on('message', this.listener(session.userId, session.guildId))
        this.channelGames[session.channelId] = new this.gameClass(dispose, session)
        session.send(this.channelGames[session.channelId].startGame())
        return
    }

    public endGame(session: Session, ctx: Context) {
        if (!this.channelGames[session.channelId]) return '当前频道没有游戏在进行中'
        const gameRes = this.channelGames[session.channelId].endGame()
        session.send(gameRes.message)
        ctx.emit('game-result', session, gameRes)
        this.channelGames.delete(session.channelId)

        logger.info(`游戏已结束`)
        return
    }
}
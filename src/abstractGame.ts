import { Session, Logger, Context } from 'koishi'

const logger = new Logger('satori-game-gobang')

export abstract class abstractGameSingleGame {
    protected disposeListener: () => boolean

    protected gameName: string
    constructor(disposeListener: () => boolean) {
        this.disposeListener = disposeListener
    }

    public endGame() {
        this.disposeListener()
    }

    public processInput: (str: string) => string
}

type Constructor<T> = new (...args: any[]) => T

export abstract class abstractGame<T extends abstractGameSingleGame> {
    protected gameClass
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
    public startGame: (session: Session, ctx: Context, args: string[]) => void = (session: Session, ctx: Context, args: string[]) => {
        if (this.channelGames[session.channelId]) return '当前频道已经有游戏正在进行中'
        const dispose = ctx.on('message', this.listener(session.userId, session.guildId))
        this.channelGames[session.channelId] = new this.gameClass(dispose)
        return
    }

    public endGame(session: Session) {
        if (!this.channelGames[session.channelId]) return '当前频道没有游戏在进行中'
        this.channelGames.delete(session.channelId)

        logger.info(`游戏已结束`)
        return '游戏已结束'
    }
}
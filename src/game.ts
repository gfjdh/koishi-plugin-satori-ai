import { Session, Logger, Context } from 'koishi'
import { goBang, goBangGameResult, winFlag } from './gamegobang'
import { abstractGame } from './abstractGame'


const logger = new Logger('satori-game')

export class Game {
  private GAMES = ['五子棋']

  private channelGames: Map<string, string> = new Map()

  private availableGames: Map<string, abstractGame<any>> = new Map()

  private context: Context

  constructor(ctx: Context) {
    this.context = ctx
    this.availableGames.set('五子棋', new goBang())
    this.registerCommands(ctx)
    ctx.on('game-result', (session, result) => {
      switch (result.gameName) {
        case '五子棋':
          const res = result as goBangGameResult
          // 好感度、p点等事件可以写这里
          if (res.win === winFlag.win) {
            session.send('你赢了')
          } else if (res.win === winFlag.lose) {
            session.send('你输了')
          } else if (res.win === winFlag.draw) {
            session.send('平局')
          } else {
            session.send('游戏中断，你输了')
          }
          break
      }
    }
    )
  }

  private registerCommands(ctx: Context) {
    ctx.command('game <gameName> [...args]', '开始游戏')
      .action(async ({ session }, gameName, ...args) => { return this.startGame(session, gameName, args) })
    ctx.command('endgame', '结束游戏')
      .action(async ({ session }) => { return this.endGame(session) })
  }

  public async startGame(session: Session, gameName: string, args: string[]) {
    if (this.channelGames.get(session.channelId)) return '当前频道已经有游戏正在进行中'
    if (!this.GAMES.includes(gameName)) return '没有这个游戏哦'
    await this.selectGame(session, gameName, args)
    this.channelGames.set(session.channelId, gameName)
    logger.info(`游戏${gameName}已开始于${session.channelId}`)
    return
  }

  public async endGame(session: Session) {
    if (!this.channelGames.get(session.channelId)) return '当前频道没有游戏在进行中'
    this.availableGames.get(this.channelGames.get(session.channelId)).endGame(session, this.context)
    this.channelGames.delete(session.channelId)
    logger.info(`${session.channelId}的游戏已结束`)
  }

  private async selectGame(session: Session, gameName: string, args: string[]) {
    const game = this.availableGames.get(gameName)
    if (!game) return '没有这个游戏哦'
    game.startGame(session, this.context, args)
  }
}

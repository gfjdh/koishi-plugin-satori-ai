import { Session, Logger, Context } from 'koishi'
import { goBang } from './gobang'

const logger = new Logger('satori-game')

export class Game {
  private GAMES = ['五子棋']
  private channelGames: Map<string, string> = new Map()
  private goBang: goBang
  constructor(ctx: Context) {
    this.goBang = new goBang()
    this.registerCommands(ctx)
  }

  private registerCommands(ctx: Context) {
    ctx.command('game <gameName> [...args]', '开始游戏')
    .action(async ({ session }, gameName, ...args) => { return this.startGame(session, gameName, args) })
    ctx.command('endgame', '结束游戏')
    .action(async ({ session }) => { return this.endGame(session)})
  }

  public async startGame(session: Session, gameName: string, args: string[]) {
    if (this.channelGames[session.channelId]) return '当前频道已经有游戏正在进行中'
    if (!this.GAMES.includes(gameName)) return '没有这个游戏哦'
    await this.selectGame(session, gameName, args)
    this.channelGames[session.channelId] = session.userId
    logger.info(`游戏${gameName}已开始`)
    return gameName + '已开始'
  }

  public async endGame(session: Session) {
    if (!this.channelGames[session.channelId]) return '当前频道没有游戏在进行中'
    delete this.channelGames[session.channelId]
    logger.info(`游戏已结束`)
    return '游戏已结束'
  }

  private async selectGame(session: Session, gameName: string, args: string[]) {
    switch (gameName) {
      case '五子棋': return this.goBang.startGame(session, args)
    }
  }
}

import { Session, Logger, Context } from 'koishi'
import { goBang, goBangGameResult, winFlag } from './gamegobang'
import { abstractGame } from './abstractGame'
import { Sat } from './types'
import { SAT } from './index'
import { getUser, updateUserP } from './database'

const logger = new Logger('satori-game')

/**
 * 游戏总控类，管理所有可用游戏和命令
 */
export class Game {
  private GAMES = ['五子棋']                             // 支持的游戏列表
  private channelGames: Map<string, string> = new Map()  // 频道ID到游戏名称的映射
  private availableGames: Map<string, abstractGame<any>> = new Map() // 游戏名称到实例的映射
  private context: Context
  private config: Sat.Config
  private sat: SAT
  constructor(ctx: Context, cfg: Sat.Config, sat: SAT) {
    this.context = ctx
    this.config = cfg
    this.sat = sat
    if (this.config.enable_gobang) this.availableGames.set('五子棋', new goBang())      // 注册五子棋
    this.registerCommands(ctx)                          // 注册命令

    // 监听游戏结果事件（如胜负判定）
    ctx.on('game-result', async (session, result) => {
      switch (result.gameName) {
        case '五子棋':
          const res = result as goBangGameResult
          if (res.win === winFlag.win) {
            // 根据level决定奖励
            let user = await getUser(ctx, session.userId)
            updateUserP(ctx, user, 20 * res.level * res.level)
          }
          else if (res.win === winFlag.lose) session.send('你输了')
          else if (res.win === winFlag.draw) session.send('平局')
          else session.send('游戏中断，你输了')
          break
      }
    })
  }

  // 注册 Koishi 命令
  private registerCommands(ctx: Context) {
    ctx.command('sat.game <gameName> [...args]', '开始游戏')
      .alias('开始游戏')
      .action(async ({ session }, gameName, ...args) => this.startGame(session, gameName, args))
    ctx.command('sat.endgame', '结束游戏')
      .alias('结束游戏')
      .action(async ({ session }) => this.endGame(session))
  }

  // 启动指定游戏
  public async startGame(session: Session, gameName: string, args: string[]) {
    if (this.channelGames.get(session.channelId)) return '当前频道已经有游戏在进行中'
    if (!this.GAMES.includes(gameName)) return '没有这个游戏哦'
    await this.selectGame(session, gameName, args)
    this.channelGames.set(session.channelId, gameName)
    logger.info(`游戏${gameName}已开始于${session.channelId}`)
  }

  // 结束当前游戏
  public async endGame(session: Session) {
    const gameName = this.channelGames.get(session.channelId)
    if (!gameName) return '当前频道没有游戏在进行中'
    this.availableGames.get(gameName).endGame(session, this.context)
    this.channelGames.delete(session.channelId)
    logger.info(`${session.channelId}的游戏已结束`)
  }

  // 选择并启动具体游戏实例
  private async selectGame(session: Session, gameName: string, args: string[]) {
    const game = this.availableGames.get(gameName)
    if (!game) return '没有这个游戏哦'
    game.startGame(session, this.context, args) // 调用抽象类的启动方法
  }

  private async chat(session: Session, gameName: string, prompt: string) {
    switch (gameName) {
      case '五子棋':
        const response = (await this.sat.generateResponse(session,'')).content
      default:
        return '没有这个游戏哦'
    }
  }
}

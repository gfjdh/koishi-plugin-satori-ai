import { Session, Logger, Context } from 'koishi'
import { goBang, goBangGameResult } from './gamegobang'
import { fencing } from './gamefencing'
import { abstractGame, gameResult } from './abstractGame'
import { Sat } from './types'
import { SAT } from './index'
import { ensureUserExists, getUser, updateFavorability, updateUserP } from './database'
import { refreshPuppeteer } from '.'
import { OneTouchGame, OneTouchResult } from './gameOneTouch'

const logger = new Logger('satori-game')

// 胜负标志枚举
export enum winFlag {
  win = 1,
  lose = 2,
  draw = 3,
  pending = 4
}

/**
 * 游戏总控类，管理所有可用游戏和命令
 */
export class Game {
  private GAMES = ['五子棋', '击剑', '一碰一']                             // 支持的游戏列表
  private channelGames: Map<string, string> = new Map()  // 频道ID到游戏名称的映射
  private availableGames: Map<string, abstractGame<any>> = new Map() // 游戏名称到实例的映射
  private userUsage: Map<string, number> = new Map()
  private context: Context
  private config: Sat.Config
  private sat: SAT
  constructor(ctx: Context, cfg: Sat.Config, sat: SAT) {
    this.context = ctx
    this.config = cfg
    this.sat = sat
    if (this.config.enable_gobang) {
      this.availableGames.set('五子棋', new goBang())
    }      // 注册五子棋
    if (this.config.enable_fencing) {
      this.availableGames.set('击剑', new fencing())
    }                          // 注册击剑
    if (this.config.enable_OneTouch) {
      this.availableGames.set('一碰一', new OneTouchGame())
    }                          // 注册一碰一
    this.registerCommands(ctx)                          // 注册命令

    // 监听游戏结果事件（如胜负判定）
    ctx.on('game-result', async (session, result) => { this.resultJudge(result, ctx, session) })
  }

  // 注册 Koishi 命令
  private registerCommands(ctx: Context) {
    ctx.command('sat.game [gameName] [...args]', '开始游戏')
      .alias('开始游戏')
      .action(async ({ session }, gameName, ...args) => this.startGame(session, gameName || '', args))
    ctx.command('sat.endgame', '结束游戏')
      .alias('结束游戏')
      .action(async ({ session }) => this.endGame(session))
  }

  // 启动指定游戏
  public async startGame(session: Session, gameName: string, args: string[]) {
    if (this.channelGames.get(session.channelId)) return '当前频道已经有游戏在进行中'
    if (gameName == '') return this.getGameList()
    if (!this.GAMES.includes(gameName)) return '没有这个游戏哦'
    const game = this.availableGames.get(gameName)
    if (!game) return '没有这个游戏哦'
    if (gameName === '五子棋' && !this.config.channel_id_for_gobang.includes(session.channelId)) {
      return '本群不支持五子棋哦,想玩请加群' + this.config.channel_id_for_gobang[0]
    }
    const user = await ensureUserExists(this.context, session.userId, session.username)
    const lastUsage = this.userUsage.get(`${session.userId}-${gameName}`)
    if (lastUsage && user.userlevel < 4) {
      const elapsed = Date.now() - lastUsage
      const cooldown = this.getGameCd(gameName) * 1000
      if (elapsed < cooldown) {
        const remains = Math.ceil((cooldown - elapsed) / 1000)
        return `游戏冷却中，还有 ${remains} 秒`
      }
    }
    this.userUsage.set(`${session.userId}-${gameName}`, Date.now())
    refreshPuppeteer(this.context)
    game.startGame(session, this.context, args) // 调用抽象类的启动方法
    this.channelGames.set(session.channelId, gameName)
    logger.info(`游戏${gameName}已开始于${session.channelId}`)
  }

  // 结束当前游戏
  public async endGame(session: Session) {
    const gameName = this.channelGames.get(session.channelId)
    if (!gameName) return '当前频道没有游戏在进行中'
    if (await this.availableGames.get(gameName).endGame(session, this.context)) {
      this.channelGames.delete(session.channelId)
      logger.info(`${session.channelId}的游戏已结束`)
    }
  }

  private async chat(session: Session, gameName: string, prompt: string) {
    switch (gameName) {
      case '五子棋':
        const response = (await this.sat.generateResponse(session, '')).content
      default:
        return '没有这个游戏哦'
    }
  }

  private getGameCd(gameName: string): number {
    switch (gameName) {
      case '五子棋':
        return this.config.cd_for_gobang
      case '一碰一':
        return this.config.cd_for_OneTouch
      default:
        return 0
    }
  }

  private getGameList(): string {
    let list = '游戏列表：'
    this.GAMES.forEach((game) => {
      list += game + '；'
    })
    logger.info(list)
    return list
  }

  private async resultJudge(result: gameResult, ctx: Context, session: Session) {
    const user = await getUser(ctx, result.playerID)
    switch (result.gameName) {
      case '五子棋':
        const goBangResult = result as goBangGameResult
        const goBanglevel = parseInt(goBangResult.message)
        const goBangbonus = Math.floor(goBanglevel * goBanglevel * goBanglevel * (Math.random() * 2 + 2))
        if (goBangResult.win === winFlag.win) {
          updateUserP(ctx, user, goBangbonus * 2)
          updateFavorability(ctx, user, goBanglevel * 2)
          session.send('真厉害，奖励你' + goBangbonus * 2 + 'p点,好感度+' + goBanglevel * 2)
        }
        else if (goBangResult.win === winFlag.lose) {
          // 根据level决定惩罚
          updateUserP(ctx, user, -goBangbonus)
          session.send('真可惜，你输了' + goBangbonus + 'p点')
        }
        else if (goBangResult.win === winFlag.draw) session.send('平局，稍后再战吧')
        else {
          updateUserP(ctx, user, -goBangbonus)
          session.send('游戏中断，你输了' + goBangbonus + 'p点')
        }
        return
      case '一碰一':
        const oneTouchResult = result as OneTouchResult
        const oneTouchLevel = parseInt(oneTouchResult.message)
        const oneTouchBonus = Math.floor(oneTouchLevel * (Math.random() * 2 + 9))
        if (oneTouchResult.win === winFlag.win) {
          updateUserP(ctx, user, oneTouchBonus * 2)
          updateFavorability(ctx, user, oneTouchLevel * 2)
          session.send('真厉害，奖励你' + oneTouchBonus * 2 + 'p点,好感度+' + Math.round(oneTouchLevel * 0.2))
        }
        else if (oneTouchResult.win === winFlag.lose) {
          // 根据level决定惩罚
          updateUserP(ctx, user, -oneTouchBonus)
          session.send('真可惜，你输了' + oneTouchBonus + 'p点')
        }
        else if (oneTouchResult.win === winFlag.draw) session.send('平局，稍后再战吧')
        else {
          updateUserP(ctx, user, -oneTouchBonus)
          session.send('游戏中断，你输了' + oneTouchBonus + 'p点')
        }
        return
      default:
        return
    }
  }
}

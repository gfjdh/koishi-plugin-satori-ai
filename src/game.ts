import { Session, Logger, Context } from 'koishi'
import { goBang, goBangGameResult } from './gamegobang'
import { fencing } from './gamefencing'
import { abstractGame, gameResult, gamePlayerResult } from './abstractGame'
import { Sat } from './types'
import { SAT } from './index'
import { ensureUserExists, getUser, updateFavorability, updateUserP } from './database'
import { refreshPuppeteer } from '.'
import { OneTouchGame, OneTouchResult } from './gameOneTouch'
import { OneTouchPvpGame } from './gameOneTouchPvp'
import { getMentionedUser } from './utils'

const logger = new Logger('satori-game')

// 对战模式在 channelGames 里使用的内部键，避免与单人「一碰一」混淆
const PVP_GAME_KEY = '一碰一PvP'

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
  private GAMES = ['一碰一']                             // 支持的游戏列表
  private channelGames: Map<string, string> = new Map()  // 频道ID到游戏名称的映射
  private availableGames: Map<string, abstractGame<any>> = new Map() // 游戏名称到实例的映射
  private oneTouchPvp: OneTouchPvpGame | null = null // 一碰一 1v1 对战
  private userUsage: Map<string, number> = new Map()
  private context: Context
  private config: Sat.Config
  private sat: SAT
  constructor(ctx: Context, cfg: Sat.Config, sat: SAT) {
    this.context = ctx
    this.config = cfg
    this.sat = sat
    if (this.config.enable_fencing) {
      this.availableGames.set('击剑', new fencing())
    }                          // 注册击剑
    if (this.config.enable_OneTouch) {
      this.availableGames.set('一碰一', new OneTouchGame())
      this.oneTouchPvp = new OneTouchPvpGame()
    }                          // 注册一碰一
    this.registerCommands(ctx)                          // 注册命令

    // 监听游戏结果事件（如胜负判定）
    ctx.on('game-result', async (session, result) => {
      this.channelGames.delete(session.channelId) // 自行结束的对局（超时/认输）也要释放频道
      this.resultJudge(result, ctx, session)
    })
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
    // 「一碰一」带 @ 即为 1v1 对战
    if (gameName === '一碰一') {
      const opponent = getMentionedUser(session)
      if (opponent) return this.startOneTouchPvp(session, opponent)
    }
    if (!this.GAMES.includes(gameName)) return '没有这个游戏哦'
    const game = this.availableGames.get(gameName)
    if (!game) return '没有这个游戏哦'

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

  // 一碰一 1v1：发起邀请，对方「接受」后才正式开始
  private async startOneTouchPvp(session: Session, opponent: { id: string; name?: string }) {
    if (!this.oneTouchPvp) return '对战模式未开启'
    if (opponent.id === session.userId) return '不能和自己对战哦'
    const user = await ensureUserExists(this.context, session.userId, session.username)
    await ensureUserExists(this.context, opponent.id, opponent.name || opponent.id)
    const lastUsage = this.userUsage.get(`${session.userId}-一碰一`)
    if (lastUsage && user.userlevel < 4) {
      const elapsed = Date.now() - lastUsage
      const cooldown = this.getGameCd('一碰一') * 1000
      if (elapsed < cooldown) {
        const remains = Math.ceil((cooldown - elapsed) / 1000)
        return `游戏冷却中，还有 ${remains} 秒`
      }
    }
    this.userUsage.set(`${session.userId}-一碰一`, Date.now())
    refreshPuppeteer(this.context)
    const game = await this.oneTouchPvp.startGame(session, this.context, [])
    if (!game) return '无法开始对战'
    this.channelGames.set(session.channelId, PVP_GAME_KEY)
    logger.info(`一碰一对战已发起于${session.channelId}`)
  }

  // 结束当前游戏
  public async endGame(session: Session) {
    const gameName = this.channelGames.get(session.channelId)
    if (!gameName) return '当前频道没有游戏在进行中'
    const controller = this.getGameController(gameName)
    if (!controller) return '当前频道没有游戏在进行中'
    if (await controller.endGame(session, this.context)) {
      this.channelGames.delete(session.channelId)
      logger.info(`${session.channelId}的游戏已结束`)
    }
  }

  private getGameController(name: string): abstractGame<any> | null {
    if (name === PVP_GAME_KEY) return this.oneTouchPvp
    return this.availableGames.get(name) || null
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
      case '一碰一':
        return this.config.cd_for_OneTouch
      default:
        return 0
    }
  }

  private getGameList(): string {
    let list = '游戏列表：\n'
    this.GAMES.forEach((game) => {
      list += game + '\n'
    })
    list += '提示：发送「开始游戏 一碰一 @对手 [血量]」可以与群友进行 1v1 对战'
    logger.info(list)
    return list
  }

  private async resultJudge(result: gameResult, ctx: Context, session: Session) {
    if (result.cancelled) return
    // 1v1 对战：逐人结算，胜者从败者处赢取 p点
    if (result.playerResults?.length) {
      await this.judgePvp(result.playerResults, ctx, session)
      return
    }
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
        const oneTouchBonus = oneTouchResult.bonus
        if (oneTouchResult.win === winFlag.win) {
          updateUserP(ctx, user, oneTouchBonus)
          updateFavorability(ctx, user, Math.round(oneTouchBonus * 0.02))
          session.send('真厉害，奖励你' + oneTouchBonus + 'p点,好感度+' + Math.round(oneTouchBonus * 0.02))
        }
        else if (oneTouchResult.win === winFlag.lose) {
          updateUserP(ctx, user, oneTouchBonus)
          session.send('真可惜，你输了' + -oneTouchBonus + 'p点')
        }
        else {
          updateUserP(ctx, user, oneTouchBonus)
          session.send('游戏中断，你输了' + -oneTouchBonus + 'p点')
        }
        return
      default:
        return
    }
  }

  // 1v1 对战结算：赢家拿走输家，输家余额不足时按实际余额结算
  private async judgePvp(results: gamePlayerResult[], ctx: Context, session: Session) {
    const winner = results.find((result) => result.win === winFlag.win)
    const loser = results.find((result) => result.win === winFlag.lose)
    if (!winner || !loser) {
      session.send('平局，本局不结算 p点')
      return
    }
    const winnerName = winner.name || winner.playerID
    const loserName = loser.name || loser.playerID
    const stake = Math.max(0, Math.round(winner.bonus))
    const winnerUser = await ensureUserExists(ctx, winner.playerID, winnerName)
    const loserUser = await ensureUserExists(ctx, loser.playerID, loserName)
    const balance = Math.max(0, loserUser?.p ?? 0)
    const transfer = Math.min(stake, balance)
    if (transfer <= 0) {
      session.send(`${winnerName} 获胜，但 ${loserName} 的 p点不足，本局没有 p点转移`)
      return
    }
    await updateUserP(ctx, loserUser, -transfer)
    await updateUserP(ctx, winnerUser, transfer)
    const favorability = Math.max(1, Math.round(transfer * 0.02))
    await updateFavorability(ctx, winnerUser, favorability)
    logger.info(`PvP结算：${winner.playerID} +${transfer}p（${favorability}好感），${loser.playerID} -${transfer}p`)
    session.send(`${winnerName} 获胜，从 ${loserName} 处赢得 ${transfer} p点，好感度 +${favorability}`)
  }
}

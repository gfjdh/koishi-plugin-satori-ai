import { Session, Logger, Context, User } from 'koishi'

const logger = new Logger('satori-game')

// 声明 Koishi 的事件扩展，用于游戏结果通知
declare module 'koishi' {
  interface Events {
    'game-result'(session: Session, result: gameResult): void
  }
}

// 游戏结果接口定义
export interface gameResult {
  playerID: string // 玩家ID
  message: string      // 结果消息
  gameName: string     // 游戏名称
}

/**
 * 单局游戏的抽象基类，提供通用生命周期方法
 */
export abstract class abstractGameSingleGame {
  protected session: Session
  protected disposeListener: () => boolean // 清理监听器的函数
  protected lastActionTime: number = 0 // 上次操作时间戳

  constructor(disposeListener: () => boolean, session: Session) {
    this.session = session
    this.disposeListener = disposeListener
  }

  // 开始游戏，返回初始提示
  public async startGame() {
    this.lastActionTime = Date.now()
    return '游戏开始'
  }

  // 结束游戏，清理资源并返回结果
  public async endGame() {
    this.disposeListener()
    return { message: '游戏结束', gameName: 'null', playerID: this.session.userId }
  }

  public getPlayerID() {
    return this.session.userId
  }

  public getLastActionTime() {
    return this.lastActionTime
  }

  // 处理玩家输入，需子类实现
  public async processInput(str: string): Promise<string> {
    this.lastActionTime = Date.now()
    return ''
  }
}

// 泛型构造函数类型
type Constructor<T> = new (...args: any[]) => T

/**
 * 游戏管理抽象基类，管理多个频道的游戏实例
 */
export abstract class abstractGame<T extends abstractGameSingleGame> {
  protected gameClass: Constructor<T>         // 具体游戏类（如五子棋）
  protected channelGames: Map<string, T> = new Map() // 频道ID到游戏实例的映射

  constructor(GameClass: Constructor<T>) {
    this.gameClass = GameClass
  }

  /**
   * 生成消息监听器，用于处理玩家输入
   * @param userID 玩家ID
   * @param guildID 服务器ID
   * @returns 监听函数，将输入转发给对应频道的游戏实例
   */
  protected listener: (userID: string, guildID: string) => ((session: Session) => void) = (userID, guildID) => {
    return async (session) => {
      // 仅处理同一用户和频道的消息
      if (session.userId === userID && session.guildId === guildID) {
        const game = this.channelGames.get(session.channelId)
        if (game) {
          session.send(await game.processInput(session.content))
        }
      }
    }
  }

  /**
   * 启动游戏实例
   * @param session 会话上下文
   * @param ctx Koishi 上下文
   * @param args 启动参数（如难度等级）
   */
  public async startGame(session: Session, ctx: Context, args: string[]): Promise<abstractGameSingleGame | null> {
    if (this.channelGames.has(session.channelId)) return null // 避免重复启动
    const dispose = ctx.on('message', this.listener(session.userId, session.guildId)) // 注册监听
    const game = new this.gameClass(dispose, session)
    this.channelGames.set(session.channelId, game)
    session.send(await game.startGame()) // 发送初始消息
    return game
  }

  /**
   * 结束游戏实例，触发结果事件
   */
  public async endGame(session: Session, ctx: Context): Promise<boolean> {
    const game = this.channelGames.get(session.channelId)
    if (!game) return false // 没有游戏实例
    session.observeUser(['authority'])
    logger.info(`时间：${session.timestamp}，用户${session.userId}试图结束用户${game.getPlayerID()}开启的游戏，上次互动时间${game.getLastActionTime()}`);
    if (game.getPlayerID() == session.userId || session.timestamp - game.getLastActionTime() > 1000 * 60 * 10 || (session.user as unknown as User).authority >= 3) {
      const gameRes = await game.endGame()
      ctx.emit('game-result', session, gameRes) // 通知外部模块
      this.channelGames.delete(session.channelId)
      logger.info(`游戏已结束`)
      return true
    }
    session.send('你不是游戏的参与者，无法结束游戏')
    return false
  }
}

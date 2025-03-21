import { Session, Logger, Context } from 'koishi'

const logger = new Logger('satori-game')

// 声明 Koishi 的事件扩展，用于游戏结果通知
declare module 'koishi' {
  interface Events {
    'game-result'(session: Session, result: gameResult): void
  }
}

// 游戏结果接口定义
export interface gameResult {
  message: string      // 结果消息
  gameName: string     // 游戏名称
}

/**
 * 单局游戏的抽象基类，提供通用生命周期方法
 */
export abstract class abstractGameSingleGame {
  protected session: Session
  protected disposeListener: () => boolean // 清理监听器的函数

  constructor(disposeListener: () => boolean, session: Session) {
    this.session = session
    this.disposeListener = disposeListener 
  }

  // 开始游戏，返回初始提示
  public startGame() {
    return '游戏开始'
  }

  // 结束游戏，清理资源并返回结果
  public endGame() {
    this.disposeListener()
    return { message: '游戏结束', gameName: 'null' }
  }

  // 处理玩家输入，需子类实现
  public async processInput(str: string): Promise<string> { return '' }
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
  public startGame(session: Session, ctx: Context, args: string[]): abstractGameSingleGame | null {
    if (this.channelGames.has(session.channelId)) return null // 避免重复启动
    const dispose = ctx.on('message', this.listener(session.userId, session.guildId)) // 注册监听
    const game = new this.gameClass(dispose, session)
    this.channelGames.set(session.channelId, game)
    session.send(game.startGame()) // 发送初始消息
    return game
  }

  /**
   * 结束游戏实例，触发结果事件
   */
  public endGame(session: Session, ctx: Context) {
    const game = this.channelGames.get(session.channelId)
    if (!game) return '当前频道没有游戏在进行中'
    const gameRes = game.endGame()
    ctx.emit('game-result', session, gameRes) // 通知外部模块
    this.channelGames.delete(session.channelId)
    logger.info(`游戏已结束`)
  }
}

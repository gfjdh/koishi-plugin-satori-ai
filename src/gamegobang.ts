import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'

const logger = new Logger('satori-game-gobang')

// 加载 WASM 模块（五子棋 AI 逻辑）
const Module = require('../wasm/gobang.js')
let wasmModule
Module().then((mod) => { wasmModule = mod })

// 胜负标志枚举
export enum winFlag {
  win = 1,
  lose = 2,
  draw = 3,
  pending = 4
}

// 五子棋结果扩展接口
export interface goBangGameResult extends gameResult {
  win: winFlag,
  level: number
}

/**
 * 五子棋单局实现类，继承自 abstractGameSingleGame
 */
class goBangSingleGame extends abstractGameSingleGame {
  private playerFlag: number         // 玩家棋子颜色（1: 黑棋，2: 白棋）
  private winningFlag: winFlag = winFlag.pending // 当前胜负状态
  public level: number                  // AI 难度等级
  private board: number[][] = []     // 12x12 棋盘状态

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  // 初始化棋盘，随机决定玩家先手
  public override startGame = () => {
    this.board = Array.from({ length: 12 }, () => Array(12).fill(0))
    this.playerFlag = Math.round(Math.random()) + 1
    logger.info(`level: ${this.level}, playerFlag: ${this.playerFlag}`)
    if (this.playerFlag === 1) {
      return '游戏开始，你随机到了先手\n' + this.printBoard()
    } else {
      this.board[5][6] = 1 // AI 先手落子中点
      return '游戏开始，你随机到了后手\n' + this.printBoard()
    }
  }

  // 结束游戏，返回结果
  public override endGame = () => {
    super.endGame()
    return { message: '五子棋游戏结束', win: this.winningFlag, gameName: '五子棋' }
  }

  /**
   * 处理玩家输入（落子坐标）
   * @param str 输入内容，格式为 "x y"
   */
  public override async processInput(str: string) {
    const [x, y] = str.split(' ').map(Number)
    if (x < 0 || x >= 12 || y < 0 || y >= 12) return '坐标超出范围'
    if (this.board[x][y] !== 0) return '这个位置已经有棋子了'
    if (this.winningFlag !== winFlag.pending) return '游戏已结束'

    // 玩家落子
    this.board[x][y] = this.playerFlag
    if (this.checkWin(x, y)) return this.printBoard() + '\n游戏已结束，发送结束游戏退出'

    // 调用 WASM 计算 AI 落子
    const flatBoard = this.board.flat()
    const arrayPtr = wasmModule._malloc(flatBoard.length * 4) // 分配内存
    wasmModule.HEAP32.set(flatBoard, arrayPtr / 4) // 将棋盘数据写入 WASM 内存

    // 分配用于返回坐标和分数的内存
    const xPtr = wasmModule._malloc(4)
    const yPtr = wasmModule._malloc(4)
    const scorePtr = wasmModule._malloc(4)

    // 调用 C++ decideMove
    wasmModule._decideMove(arrayPtr, this.playerFlag, this.level, xPtr, yPtr, scorePtr)

    // 解析坐标与分数
    const aiX = wasmModule.HEAP32[xPtr >> 2]
    const aiY = wasmModule.HEAP32[yPtr >> 2]
    const score = wasmModule.HEAP32[scorePtr >> 2]

    // 释放内存
    wasmModule._free(arrayPtr)
    wasmModule._free(xPtr)
    wasmModule._free(yPtr)
    wasmModule._free(scorePtr)

    // 若返回 -1 -1 -1，则表示平局
    if (aiX === -1 && aiY === -1 && score === -1) {
      this.winningFlag = winFlag.draw
      return '平局，发送结束游戏退出'
    }
    logger.info(`AI 落子坐标: ${aiX} ${aiY}，得分: ${score}`)
    this.board[aiX][aiY] = 3 - this.playerFlag // AI 使用对方颜色
    if (this.checkWin(aiX, aiY)) return this.printBoard() + '\n游戏已结束'
    return this.printBoard()
  }

  // 检查是否连成五子
  private checkWin(x: number, y: number): boolean {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]] // 四个方向
    for (const [dx, dy] of directions) {
      let count = 1
      // 向两个方向延伸检查
      for (let i = 1; i < 5; i++) {
        if (this.checkDirection(x, y, dx, dy, i)) count++
        else break
      }
      for (let i = 1; i < 5; i++) {
        if (this.checkDirection(x, y, -dx, -dy, i)) count++
        else break
      }
      if (count >= 5) {
        this.winningFlag = this.board[x][y] === this.playerFlag ? winFlag.win : winFlag.lose
        return true
      }
    }
    return false
  }

  // 辅助方法：检查指定方向是否有连续棋子
  private checkDirection(x: number, y: number, dx: number, dy: number, step: number): boolean {
    const nx = x + dx * step, ny = y + dy * step
    return nx >= 0 && nx < 12 && ny >= 0 && ny < 12 && this.board[nx][ny] === this.board[x][y]
  }

  // 生成带表情符号的棋盘字符串
  private printBoard(): string {
    const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢']
    let res = '🟨' + numberEmojis.slice(0, 12).join('') + '\n'
    for (let i = 0; i < 12; i++) {
      res += numberEmojis[i]
      for (let j = 0; j < 12; j++) {
        res += this.board[i][j] === 0 ? '🟨' : (this.board[i][j] === 1 ? '⚫' : '⚪')
      }
      res += '\n'
    }
    return res
  }
}

/**
 * 五子棋管理类，继承自 abstractGame
 */
export class goBang extends abstractGame<goBangSingleGame> {
  constructor() {
    super(goBangSingleGame) // 绑定具体单局类
  }

  // 启动游戏时可传入难度参数
  public override startGame(session: Session, ctx: Context, args: string[]) {
    let level: number
    if (!isNaN(parseInt(args[0])))
      level = parseInt(args[0])
    else {
      session.send('未输入难度等级(2-7)，默认设为4')
      level = 4
    }
    if (level < 2 || level > 7) {
      level = level < 2 ? 2 : 7
      session.send('难度等级必须在2到7之间,已调整为' + level)
    }
    args[0] = level.toString()
    const game = super.startGame(session, ctx, args) as goBangSingleGame
    return game
  }
}

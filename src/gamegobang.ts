import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'

const logger = new Logger('satori-game-gobang')
const BOARD_SIZE = 12;    // 棋盘大小
const INF = 2147483647;   // 正无穷

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

class Coordinate {
  x: number;
  y: number;
  score: number;

  constructor(a: number = 0, b: number = 0, s: number = 0) {
      this.x = a;
      this.y = b;
      this.score = s;
  }
}

/**
 * 五子棋单局实现类，继承自 abstractGameSingleGame
 */
class goBangSingleGame extends abstractGameSingleGame {
  private playerFlag: number         // 玩家棋子颜色（1: 黑棋，2: 白棋）
  private winningFlag: winFlag = winFlag.pending // 当前胜负状态
  public level: number                  // AI 难度等级
  private board: number[][] = []     // BOARD_SIZExBOARD_SIZE 棋盘状态
  private inspireSearchLength: number = 8 // 启发式搜索长度

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  // 初始化棋盘，随机决定玩家先手
  public override startGame = ( ) => {
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0))
    this.playerFlag = Math.round(Math.random()) + 1

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
    if(isNaN(x) || isNaN(y)) return
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return '坐标超出范围'
    if (this.board[x][y] !== 0) return '这个位置已经有棋子了'
    if (this.winningFlag !== winFlag.pending) return '游戏已结束'
    logger.info(`level: ${this.level}, playerFlag: ${this.playerFlag}`)
    // 玩家落子
    this.board[x][y] = this.playerFlag
    if (this.checkWin(x, y)) return this.printBoard() + '\n游戏已结束，发送结束游戏退出'

    const starttime = Date.now()
    const aiMove = await this.entrance(this.level, -INF, INF, 3 - this.playerFlag, this)
    const endtime = Date.now()

    // 若返回 -1 -1 -1，则表示平局
    if (aiMove.x === -1 && aiMove.y === -1 && aiMove.score === -1) {
      this.winningFlag = winFlag.draw
      return '平局，发送结束游戏退出'
    }
    logger.info(`AI 落子坐标: ${aiMove.x} ${aiMove.y}，得分: ${aiMove.score}，AI 落子耗时: ${endtime - starttime}ms`)
    this.board[aiMove.x][aiMove.y] = 3 - this.playerFlag // AI 使用对方颜色
    if (this.checkWin(aiMove.x, aiMove.y)) return this.printBoard() + '\n游戏已结束'
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
    return nx >= 0 && nx < BOARD_SIZE && ny >= 0 && ny < BOARD_SIZE && this.board[nx][ny] === this.board[x][y]
  }

  // 在指定位置放置棋子
  private place(target: Coordinate, player: number, game: goBangSingleGame): void {
    game.board[target.x][target.y] = player;
  }

  // 负极大极小值搜索
  private async alphaBeta(depth: number, alpha: number, beta: number, player: number, command: Coordinate, game: goBangSingleGame): Promise<Coordinate> {
    let temp = command;
    if (depth === 0) {
      const flatBoard = this.board.flat()
      const arrayPtr = wasmModule._malloc(flatBoard.length * 4) // 分配内存
      wasmModule.HEAP32.set(flatBoard, arrayPtr / 4) // 将棋盘数据写入 WASM 内存
      temp.score = wasmModule._wholeScore(player, arrayPtr);
      wasmModule._free(arrayPtr) // 释放内存
      return temp;
    }

    // 调用 WASM 计算
    const steps = await this.wasmInspireSearch(player)
    const length = steps.length

    if (length > 7 && depth > 1) {
      depth--;
    } else if (length > 2) {
      depth--;
    }

    for (let i = 0; i < length; i++) {
      this.place(steps[i], player, game); // 模拟落子
      temp = await this.alphaBeta(depth, -beta, -alpha, 3 - player, steps[i], game); // 取负值并交换alpha和beta
      temp.score *= -1;
      this.place(steps[i], 0, game); // 还原落子

      if (temp.score >= beta) {
        temp.score = beta;
        return temp; // 剪枝
      }

      if (temp.score > alpha) {
        alpha = temp.score;
      }
    }

    temp.score = alpha;
    return temp;
  }

  // 搜索入口
  private async entrance(depth: number, alpha: number, beta: number, player: number, game: goBangSingleGame): Promise<Coordinate> {
    let temp = new Coordinate();
    let best = new Coordinate();

    // 调用 WASM 计算
    const steps = await this.wasmInspireSearch(player)
    const length = steps.length

    if (length === 1) {
      return steps[0];
    }

    for (let i = 0; i < length; i++) {
      this.place(steps[i], player, game); // 模拟落子
      temp = await this.alphaBeta(depth, -beta, -alpha, 3 - player, steps[i], game); // 递归
      temp.score *= -1;
      this.place(steps[i], 0, game); // 还原落子

      if (temp.score > alpha) {
          alpha = temp.score;
          best = steps[i]; // 记录最佳落子
      }
    }

    best.score = alpha;
    return best;
  }

  private async wasmInspireSearch(player: number): Promise<Coordinate[]> {
    const flatBoard = this.board.flat()
    const arrayPtr = wasmModule._malloc(flatBoard.length * 4) // 分配内存
    wasmModule.HEAP32.set(flatBoard, arrayPtr / 4) // 将棋盘数据写入 WASM 内存
    const scoreBoardPtr = wasmModule._malloc(this.inspireSearchLength * 4 * 3) // 分配内存

    const length: number = await wasmModule._inspireSearch(scoreBoardPtr, player, arrayPtr, this.inspireSearchLength) // 调用 WASM 搜索函数
    const scoreBoard = new Int32Array(wasmModule.HEAP32.buffer, scoreBoardPtr, length * 3)
    let steps: Coordinate[] = []
    for (let i = 0; i < length; i++) {
      steps.push(new Coordinate(
        scoreBoard[i * 3],
        scoreBoard[i * 3 + 1],
        scoreBoard[i * 3 + 2]
      ))
    }
    // 释放内存
    try {
      wasmModule._free(arrayPtr)
      wasmModule._free(scoreBoardPtr)
    } catch (e) {
      logger.info(`AI 落子坐标: ${steps[0].x} ${steps[0].y}，得分: ${steps[0].score}, ${steps.length}个候选落子`)
      logger.error('释放内存失败', e)
    }
    return steps
  }

  // 生成带表情符号的棋盘字符串
  private printBoard(): string {
    const numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢']
    let res = '🟨' + numberEmojis.slice(0, BOARD_SIZE).join('') + '\n'
    for (let i = 0; i < BOARD_SIZE; i++) {
      res += numberEmojis[i]
      for (let j = 0; j < BOARD_SIZE; j++) {
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
      session.send('未输入难度等级(2-8)，默认设为4')
      level = 4
    }
    if (level < 2 || level > 8) {
      level = level < 2 ? 2 : 8
      session.send('难度等级必须在2到8之间,已调整为' + level)
    }
    const game = super.startGame(session, ctx, args) as goBangSingleGame
    game.level = level
    return game
  }
}

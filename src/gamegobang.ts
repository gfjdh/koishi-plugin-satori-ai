import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'
import Puppeteer, { } from 'koishi-plugin-puppeteer'
import { puppeteer } from '.'

const logger = new Logger('satori-game-gobang')
const BOARD_SIZE = 12;    // 棋盘大小
const inspireSearchLength = 8 // 启发式搜索长度
const INF = 2147483647;   // 正无穷

// 加载 WASM 模块（五子棋 AI 逻辑）
const Module = require('../wasm/gobang.js')
// 预定义内存池对象，存储棋盘和候选点的指针
let wasmMemoryPool = {
  boardPtr: null as number,     // 棋盘数据内存指针
  scoreBoardPtr: null as number // 候选点数组内存指针
};
let wasmModule
Module().then((mod) => {
  wasmModule = mod;
  // 预分配棋盘内存（BOARD_SIZE * BOARD_SIZE * 4字节）
  wasmMemoryPool.boardPtr = wasmModule._malloc(BOARD_SIZE * BOARD_SIZE * 4);
  // 预分配候选点内存（BOARD_SIZE * BOARD_SIZE * 3 * 4字节）
  wasmMemoryPool.scoreBoardPtr = wasmModule._malloc(BOARD_SIZE * BOARD_SIZE * 4 * 3);
});

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

async function wrapInHTML(str: string): Promise<string> {
  if (!puppeteer) {
    logger.warn('puppeteer未就绪')
    return '出现错误，请联系管理员'
  }
  return puppeteer.render(`<html><body>${str.replaceAll(/\n/g, '<BR>')}</body>
          <style>
          body {
            padding: 10px;
            display: inline-block;
           }
          </style>
          </html>`);
}

/**
 * 五子棋单局实现类，继承自 abstractGameSingleGame
 */
class goBangSingleGame extends abstractGameSingleGame {
  private playerFlag: number         // 玩家棋子颜色（1: 黑棋，2: 白棋）
  private winningFlag: winFlag = winFlag.pending // 当前胜负状态
  public level: number                  // AI 难度等级
  private board: number[][] = []     // BOARD_SIZExBOARD_SIZE 棋盘状态
  private lastScore: number = 0 // 上次评分
  private turnsCount: number = 0 // 回合数
  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  // 初始化棋盘，随机决定玩家先手
  public override startGame = () => {
    this.board = Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(0))
    this.turnsCount = 0
    this.playerFlag = Math.round(Math.random()) + 1
    const randomX = Math.round(BOARD_SIZE / 2) - 2 + Math.round(2 * Math.random())
    const randomY = Math.round(BOARD_SIZE / 2) - 2 + Math.round(2 * Math.random())
    if (this.playerFlag === 1) {
      this.board[randomX][randomY] = 1
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY + (Math.round(Math.random()) ? -1 : 1)] = 2
      return wrapInHTML('游戏开始，你随机到了先手(黑)\n输入两个数字以下棋，先行后列，例如：“5 6”\n' + this.printBoard())
    } else {
      this.board[randomX][randomY] = 1
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY + (Math.round(Math.random()) ? -1 : 1)] = 2
      this.board[randomX + (Math.round(Math.random()) ? -1 : 1)][randomY] = 1
      return wrapInHTML('游戏开始，你随机到了后手(白)\n输入两个数字以下棋，先行后列，例如：“5 6”\n' + this.printBoard())
    }
  }

  // 结束游戏，返回结果
  public override endGame = async () => {
    if (wasmMemoryPool.boardPtr) {
      wasmModule._free(wasmMemoryPool.boardPtr);
      wasmMemoryPool.boardPtr = null;
    }
    if (wasmMemoryPool.scoreBoardPtr) {
      wasmModule._free(wasmMemoryPool.scoreBoardPtr);
      wasmMemoryPool.scoreBoardPtr = null;
    }
    super.endGame()
    return { message: '五子棋游戏结束', win: this.winningFlag, gameName: '五子棋' }
  }

  /**
   * 处理玩家输入（落子坐标）
   * @param str 输入内容，格式为 "x y"
   */
  public override async processInput(str: string) {
    const [x, y] = str.split(' ').map(Number)
    if (isNaN(x) || isNaN(y)) return
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) return '坐标超出范围了'
    if (this.board[x][y] !== 0) return '这个位置已经有棋子了，别想耍赖'
    if (this.winningFlag !== winFlag.pending) return '游戏已结束'
    // 玩家落子
    this.board[x][y] = this.playerFlag
    logger.info(`level: ${this.level}, player: x: ${x}, y: ${y}`)

    if (this.checkWin(x, y)) return wrapInHTML(this.printBoard() + '\n游戏已结束，发送结束游戏退出')

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
    if (this.turnsCount > 5) this.session.send(this.generateChat(aiMove.score))
    this.lastScore = aiMove.score
    this.turnsCount++
    if (this.checkWin(aiMove.x, aiMove.y)) return wrapInHTML(this.printBoard() + '\n游戏已结束，发送结束游戏退出')
    return wrapInHTML(this.printBoard() + '\n我这一步下在这里哦(' + aiMove.x + ' ' + aiMove.y + ')')
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
      wasmModule.HEAP32.set(flatBoard, wasmMemoryPool.boardPtr / 4) // 将棋盘数据写入 WASM 内存
      temp.score = wasmModule._wholeScore(player, wasmMemoryPool.boardPtr);
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
    const flatBoard = this.board.flat();
    // 使用预分配的棋盘内存
    wasmModule.HEAP32.set(flatBoard, wasmMemoryPool.boardPtr / 4);

    // 调用 WASM 函数，传入预分配的 scoreBoardPtr
    const length: number = await wasmModule._inspireSearch(
      wasmMemoryPool.scoreBoardPtr, // 直接使用预分配指针
      player,
      wasmMemoryPool.boardPtr,      // 直接使用预分配指针
      inspireSearchLength
    );

    // 从预分配内存中读取结果
    const scoreBoard = new Int32Array(
      wasmModule.HEAP32.buffer,
      wasmMemoryPool.scoreBoardPtr,
      length * 3
    );

    let steps: Coordinate[] = [];
    for (let i = 0; i < length; i++) {
      steps.push(new Coordinate(
        scoreBoard[i * 3],
        scoreBoard[i * 3 + 1],
        scoreBoard[i * 3 + 2]
      ));
    }
    return steps;
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

  private generateChat(Score: number): string {
    if (this.lastScore < 5000000 && Score > 5000000) {
      return '我觉得你要输了哦~'
    }
    if (this.lastScore < 1000000 && Score > 1000000) {
      return '只能下在这里了~'
    }
    if (4000 <= Score && Score < 10000) {
      return '这招怎么样？'
    }
    if (2000 <= Score && Score < 4000 && Math.random() < 0.5) {
      return {
        0: '有点意思哦~',
        1: '真是焦灼的局面',
        2: '势均力敌呢~',
        3: '你在想什么呢？',
        4: '走这里会不会太冒险了？'
      }[Math.floor(Math.random() * 5)]
    }
    if (Score < 1000) {
      return '感觉有点不妙……'
    }
    if (Score < 0) {
      return '你还真是厉害呢~'
    }
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
  public override async startGame(session: Session, ctx: Context, args: string[]) {
    let level: number
    if (!isNaN(parseInt(args[0])))
      level = parseInt(args[0])
    else {
      setTimeout(() => {
        session.send('未输入难度等级(2-8)，默认设为4')
      }, 500);

      level = 4
    }
    if (level < 2 || level > 8) {
      level = level < 2 ? 2 : 8
      setTimeout(() => {
        session.send('难度等级必须在2到8之间,已调整为' + level)
      }, 500);
    }
    const game = await super.startGame(session, ctx, args) as goBangSingleGame
    game.level = level
    return game
  }
}

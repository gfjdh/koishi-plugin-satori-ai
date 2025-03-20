import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'

const logger = new Logger('satori-game-gobang')

const Module = require('../wasm/gobang.js')
let wasmModule
Module().then((mod) => {
  wasmModule = mod
})

export enum winFlag {
  win = 1,
  lose = 2,
  draw = 3,
  pending = 4
}

export interface goBangGameResult extends gameResult {
  win: winFlag
}

class goBangSingleGame extends abstractGameSingleGame {
  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  public override startGame = () => {
    this.board = new Array(12).fill(0).map(() => new Array(12).fill(0))
    this.playerFlag = Math.round(Math.random()) + 1
    if (this.playerFlag == 1) {
      return '游戏开始，你随机到了先手\n' + this.printBoard()
    } else {
      this.board[5][6] = 1
      return '游戏开始，你随机到了后手\n' + this.printBoard()
    }
  }

  public override endGame = () => {
    super.endGame()
    return { message: '五子棋游戏结束', win: this.winningFlag, gameName: '五子棋' }
  }

  private playerFlag: number
  private winningFlag: winFlag = winFlag.pending
  public level = 5

  public override async processInput(str: string) {
    const [x, y] = str.split(' ')
    if (isNaN(Number(x)) || isNaN(Number(y))) {
      return
    }
    const [xNum, yNum] = [Number(x), Number(y)]
    if (xNum < 0 || xNum >= 12 || yNum < 0 || yNum >= 12) {
      return
    }
    if (this.board[xNum][yNum] !== 0) {
      return '这个位置已经有棋子了'
    }
    if (this.winningFlag !== winFlag.pending) {
      return '游戏已结束，发送endGame退出'
    }
    this.board[xNum][yNum] = this.playerFlag
    if (this.checkWin(xNum, yNum)) {
      return this.printBoard() + '\n游戏已结束，发送endGame退出'
    }
    const boardArray = this.board.flat()
    const arrayLength = boardArray.length;
    const bytesPerElement = 4; // 32 bits = 4 bytes
    const arraySize = arrayLength * bytesPerElement;

    // Allocate memory in WASM for the array
    const arrayPtr = wasmModule._malloc(arraySize);
    wasmModule.HEAP32.set(boardArray, arrayPtr / bytesPerElement);

    const result = wasmModule._decideMove(arrayPtr, this.playerFlag, this.level);
    wasmModule._free(arrayPtr);
    if (result === -1) {
      this.winningFlag = winFlag.draw
      return '游戏已结束，发送endGame退出'
    }
    const [x1, y1] = [Math.floor(result / 1000), result % 1000]
    this.board[x1][y1] = 3 - this.playerFlag
    console.log(this.checkWin(x1, y1))
    if (this.checkWin(x1, y1)) {
      return this.printBoard() + '\n游戏已结束，发送endGame退出'
    }
    return this.printBoard()
  }

  private checkWin(x: number, y: number): boolean {
    const directions = [[1, 0], [0, 1], [1, 1], [1, -1]]
    for (let i = 0; i < 4; i++) {
      let count = 1
      for (let j = 1; j < 5; j++) {
        const [dx, dy] = directions[i]
        const [nx, ny] = [x + dx * j, y + dy * j]
        if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) {
          break
        }
        if (this.board[nx][ny] !== this.board[x][y]) {
          break
        }
        count++
      }
      for (let j = 1; j < 5; j++) {
        const [dx, dy] = directions[i]
        const [nx, ny] = [x - dx * j, y - dy * j]
        if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) {
          break
        }
        if (this.board[nx][ny] !== this.board[x][y]) {
          break
        }
        count++
      }
      if (count >= 5) {
        this.winningFlag = this.board[x][y] === this.playerFlag ? winFlag.win : winFlag.lose
        return true
      }
    }
    return false
  }

  static readonly numberEmojis = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟', '🔢']
  private printBoard(): string {
    // 带坐标的打印
    let res = '🟨'
    for (let i = 0; i < 12; i++) {
      res += goBangSingleGame.numberEmojis[i]
    }
    res += '\n'
    for (let i = 0; i < 12; i++) {
      res += goBangSingleGame.numberEmojis[i]
      for (let j = 0; j < 12; j++) {
        if (this.board[i][j] === 0) {
          res += '🟨'
        } else if (this.board[i][j] === 1) {
          res += '⚫'
        } else {
          res += '⚪'
        }
      }
      res += '\n'
    }
    return res
  }

  private board: number[][] = []
}

export class goBang extends abstractGame<goBangSingleGame> {
  constructor() {
    super(goBangSingleGame)
  }
  public override startGame(session: Session, ctx: Context, args: string[]) {
    const game = super.startGame(session, ctx, args) as goBangSingleGame
    if (!Number.isNaN(parseInt(args[0]))) {
      game.level = parseInt(args[0])
    }
    return game
  }
}

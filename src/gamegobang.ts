import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame } from './abstractGame'

const logger = new Logger('satori-game-gobang')

class goBangSingleGame extends abstractGameSingleGame {
  constructor(disposeListener: () => boolean) {
    super(disposeListener)
    this.board = new Array(15).fill(0).map(() => new Array(15).fill(0))
  }

  public processInput = (str: string) => {
    if (str == "endGame") {
      return "游戏结束"
    }
    const [x, y] = str.split(' ')
    if (isNaN(Number(x)) || isNaN(Number(y))) {
      return '输入不合法'
    }
    const [xNum, yNum] = [Number(x), Number(y)]
    if (xNum < 0 || xNum >= 15 || yNum < 0 || yNum >= 15) {
      return '输入不合法'
    }
    if (this.board[xNum][yNum] !== 0) {
      return '这个位置已经有棋子了'
    }
    this.board[xNum][yNum] = 1
    return this.printBoard()
  }

  private printBoard(): string {
    let res = ''
    for (let i = 0; i < 15; i++) {
      for (let j = 0; j < 15; j++) {
        res += this.board[i][j] === 0 ? '⚪' : this.board[i][j] === 1 ? '⚫' : '❌'
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
}

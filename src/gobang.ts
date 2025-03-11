import { Session, Logger, Context } from 'koishi'

const logger = new Logger('satori-game-gobang')

export class goBang {
  private board: number[][]
  private level: number


  public startGame(session: Session, args: string[]) {
    this.board = new Array(15).fill(0).map(() => new Array(15).fill(0))
    this.level = 1
    return
  }
}

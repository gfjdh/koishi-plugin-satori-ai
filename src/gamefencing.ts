import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame } from './abstractGame'

const logger = new Logger('satori-game-gobang')

class goBangSingleGame extends abstractGameSingleGame {
  constructor(disposeListener: () => boolean) {
    super(disposeListener)
  }

  public processInput = (str: string) => {
    return "你输入了：" + str
  }
}

export class goBang extends abstractGame<goBangSingleGame> {
  constructor() {
    super(goBangSingleGame)
  }
}

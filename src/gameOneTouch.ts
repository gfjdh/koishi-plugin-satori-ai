import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'

const logger = new Logger('satori-game-onetouch')

enum playerStatus {
  Normal,
  Stunned
}

interface PlayerState {
  left: number
  right: number
  hp: number
  shield: number
  strength: number
  bleed: number
  status: playerStatus
}

interface SkillEffect {
  damage?: number
  damageTimes?: number
  pierceDamage?: number
  heal?: number
  shield?: number
  bleed?: number
  stun?: boolean
  strengthChange?: number
}

export interface OneTouchResult extends gameResult {
  win: boolean
}

const SKILL_MAP: { [key: string]: SkillEffect } = {
  // 基础技能
  '3': { damage: 6 },
  '4': { shield: 1 },
  '5': { damage: 3, stun: true },
  '6': { heal: 6 },
  '7': { pierceDamage: 1 },
  '8': { damage: 16, stun: true },
  '9': { pierceDamage: 1, bleed: 1, strengthChange: -1 },
  '10': { strengthChange: 1 },

  // 组合技
  '1+8': { damage: 15, bleed: 3 },
  '5+5': { damage: 10, stun: true },
  '5+10': { strengthChange: 3 },
  '6+6': { heal: 15, strengthChange: 1 },
  '1+9': { pierceDamage: 5, bleed: 5, strengthChange: -1 },
  '4+4': { shield: 3, heal: 5 },
  '8+8': { damage: 15, damageTimes: 2, stun: true },
  '1+2': { pierceDamage: 5, bleed: 3, stun: true }
}

class OneTouchSingleGame extends abstractGameSingleGame {
  private players: [PlayerState, PlayerState]
  private currentPlayer: number
  public level: number
  private lastStunned: boolean = false // 上一回合是否被眩晕

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
    this.players = [
      {
        left: 0,
        right: 0,
        hp: 40,
        shield: 0,
        strength: 0,
        bleed: 0,
        status: playerStatus.Normal
      },
      {
        left: 0,
        right: 0,
        hp: 40,
        shield: 0,
        strength: 0,
        bleed: 0,
        status: playerStatus.Normal
      }
    ]
    this.currentPlayer = 0
    this.level = 3
  }

  private generateHands(): [number, number] {
    return [Math.ceil(Math.random()*10), Math.ceil(Math.random()*10)]
  }

  private applyEffect(target: PlayerState, effect: SkillEffect, isCombo: boolean) {
    if (effect.pierceDamage) {
      target.hp -= effect.pierceDamage + target.strength
    }

    if (effect.damage) {
      const actualShield = isCombo ? Math.min(target.shield, 2) : target.shield
      const blocked = Math.min(actualShield, effect.damage)
      target.shield -= blocked
      target.hp -= (effect.damage - blocked) + target.strength
    }

    if (effect.heal) target.hp += effect.heal
    if (effect.shield) target.shield = Math.min(target.shield + effect.shield, 3)
    if (effect.bleed) target.bleed += effect.bleed
    if (effect.stun)
      target.status = playerStatus.Stunned
    if (effect.strengthChange) target.strength = Math.max(0, target.strength + effect.strengthChange)
  }

  private checkCombo(a: number, b: number): SkillEffect | null {
    const key1 = `${Math.min(a,b)}+${Math.max(a,b)}`
    const key2 = `${a}+${b}`
    return SKILL_MAP[key1] || SKILL_MAP[key2] || null
  }

  private processTurn(attacker: number, handA: number, handB: number): string {
    const attackerState = this.players[attacker]
    const defender = 1 - attacker
    const defenderState = this.players[defender]

    const sum = (handA + handB) % 10
    let effect = SKILL_MAP[sum.toString()] || {}
    let isCombo = false
    // 检查组合技
    const combo = this.checkCombo(handA, handB)
    if (combo) {
      isCombo = true
      effect = { ...combo }
    }

    this.applyEffect(defenderState, effect, !!combo)

    // 处理流血
    defenderState.hp -= defenderState.bleed
    defenderState.bleed = Math.max(0, defenderState.bleed - 1)

    return this.buildResultMessage(effect, isCombo)
  }

  private buildResultMessage(effect: SkillEffect, isCombo: boolean): string {
    let msg = []
    if (effect.damage) msg.push(`造成${effect.damage}伤害`)
    if (effect.pierceDamage) msg.push(`穿刺伤害${effect.pierceDamage}`)
    if (effect.heal) msg.push(`恢复${effect.heal}生命`)
    if (effect.bleed) msg.push(`叠加${effect.bleed}层流血`)
    if (effect.stun) msg.push(`眩晕目标`)
    if (isCombo) msg.unshift('触发组合技！')

    return msg.join('，')
  }

  public override async startGame() {
    super.startGame()
    const [p1Left, p1Right] = this.generateHands()
    const [p2Left, p2Right] = this.generateHands()

    this.players[0].left = p1Left
    this.players[0].right = p1Right
    this.players[1].left = p2Left
    this.players[1].right = p2Right

    return `游戏开始！你的手势：左${p1Left} 右${p1Right}\n输入格式"左 右"选择要触碰的手`
  }

  public override async processInput(input: string) {
    if (this.players[this.currentPlayer].status === playerStatus.Stunned) {
      this.lastStunned = true
      this.currentPlayer = 1 - this.currentPlayer
      return "对方被眩晕，跳过回合"
    }

    const [handA, handB] = input.split(' ').map(Number)
    if (isNaN(handA) || isNaN(handB)) return "无效输入"

    const result = this.processTurn(this.currentPlayer, handA, handB)
    if (this.players[1 - this.currentPlayer].hp <= 0) {
      this.endGame()
      return `决胜一击！${result}，对手已战败`
    }

    this.currentPlayer = 1 - this.currentPlayer
    return `${result}\n当前状态：HP ${this.players[0].hp} | 护盾 ${this.players[0].shield} | 流血 ${this.players[0].bleed}`
  }

  private aiEvaluate(depth: number): number {
    // 需要实现DFS评分算法
    const score =
      (this.players[1].hp - this.players[0].hp) +
      this.players[1].strength * 2 -
      this.players[0].shield * 1.5 +
      this.players[0].bleed * 3
    return score
  }
}

export class OneTouchGame extends abstractGame<OneTouchSingleGame> {
  constructor() {
    super(OneTouchSingleGame)
  }

  public override async startGame(session: Session, ctx: Context, args: string[]) {
    let level: number
    if (!isNaN(parseInt(args[0])))
      level = parseInt(args[0])
    else {
      setTimeout(() => {
        session.send('未输入难度等级(2-6)，默认设为3')
      }, 500);

      level = 3
    }
    if (level < 2 || level > 6) {
      level = level < 2 ? 2 : 6
      setTimeout(() => {
        session.send('难度等级必须在2到6之间,已调整为' + level)
      }, 500);
    }
    const game = await super.startGame(session, ctx, args) as OneTouchSingleGame
    game.level = level
    return game
  }
}

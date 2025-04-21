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
    if (this.currentPlayer === 1) { // AI的回合
      let bestScore = -Infinity;
      let bestMove: [number, number] = [0, 0];

      const possibleMoves = this.generatePossibleMoves(1);
      for (const move of possibleMoves) {
          // 克隆当前状态
          const simulatedState: [PlayerState, PlayerState] = [
              this.cloneState(this.players[0]),
              this.cloneState(this.players[1])
          ];

          this.simulateMove(move, simulatedState, 1);

          // 根据难度设置搜索深度
          const depth = this.level > 5 ? 4 : this.level;
          const score = this.aiSearch(
              depth,
              false,
              simulatedState,
              -Infinity,
              Infinity
          );

          if (score > bestScore) {
              bestScore = score;
              bestMove = move;
          }
      }

      // 执行最佳动作
      return this.processTurn(1, bestMove[0], bestMove[1]);
    }
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

  private aiSearch(depth: number, isMaximizing: boolean, currentState: [PlayerState, PlayerState], alpha: number, beta: number): number {
    // 终止条件：达到最大深度或游戏结束
    if (depth === 0 || currentState[0].hp <= 0 || currentState[1].hp <= 0) {
        return this.evaluateState(currentState);
    }

    const possibleMoves = this.generatePossibleMoves(isMaximizing ? 1 : 0);
    let value = isMaximizing ? -Infinity : Infinity;

    for (const move of possibleMoves) {
        // 克隆当前状态
        const newState: [PlayerState, PlayerState] = [
            this.cloneState(currentState[0]),
            this.cloneState(currentState[1])
        ];

        // 模拟执行动作
        this.simulateMove(move, newState, isMaximizing ? 1 : 0);

        // 递归搜索
        const evalResult = this.aiSearch(
            depth - 1,
            !isMaximizing,
            newState,
            alpha,
            beta
        );

        // Alpha-Beta 剪枝
        if (isMaximizing) {
            value = Math.max(value, evalResult);
            alpha = Math.max(alpha, evalResult);
        } else {
            value = Math.min(value, evalResult);
            beta = Math.min(beta, evalResult);
        }

        if (beta <= alpha) break;
    }

    return value;
}

// 生成所有合法动作（左手/右手触碰对方左右手）
private generatePossibleMoves(playerIndex: number): [number, number][] {
    const moves: [number, number][] = [];
    const player = this.players[playerIndex];
    const opponent = this.players[1 - playerIndex];

    // 可触碰对方左右手（0: 左，1: 右）
    for (const targetHand of [0, 1]) {
        // 己方左右手均可选择
        moves.push([player.left, opponent[targetHand ? 'right' : 'left']]);
        moves.push([player.right, opponent[targetHand ? 'right' : 'left']]);
    }
    return moves.filter(([a, b]) => !isNaN(a) && !isNaN(b));
}

// 深度克隆玩家状态
private cloneState(state: PlayerState): PlayerState {
    return {
        left: state.left,
        right: state.right,
        hp: state.hp,
        shield: state.shield,
        strength: state.strength,
        bleed: state.bleed,
        status: state.status
    };
}

// 模拟执行动作并更新状态
private simulateMove(move: [number, number], state: [PlayerState, PlayerState], attackerIndex: number) {
    const [handA, handB] = move;
    const attacker = state[attackerIndex];
    const defender = state[1 - attackerIndex];

    // 处理组合技
    const combo = this.checkCombo(handA, handB);
    const effect = combo ? combo : SKILL_MAP[(handA + handB) % 10] || {};

    // 应用技能效果
    this.applySimulatedEffect(defender, effect, !!combo);

    // 处理流血和状态
    defender.hp -= defender.bleed;
    defender.bleed = Math.max(0, defender.bleed - 1);
}

// 模拟环境专用的效果应用
private applySimulatedEffect(target: PlayerState, effect: SkillEffect, isCombo: boolean) {
    // 穿刺伤害直接生效
    if (effect.pierceDamage) {
        target.hp -= effect.pierceDamage + this.players[1].strength;
    }

    // 普通伤害计算护盾
    if (effect.damage) {
        const shieldCost = isCombo ? 2 : 1;
        const blocked = Math.min(target.shield * shieldCost, effect.damage);
        target.shield -= Math.ceil(blocked / shieldCost);
        target.hp -= (effect.damage - blocked) + this.players[1].strength;
    }

    // 其他效果...
}

// 增强版局面评估函数
private evaluateState(state: [PlayerState, PlayerState]): number {
    const aiPlayer = state[1]; // AI始终是玩家1
    const humanPlayer = state[0];

    // 基础分差
    let score = (aiPlayer.hp - humanPlayer.hp) * 10;

    // 战斗属性加成
    score += aiPlayer.strength * 15;
    score -= humanPlayer.strength * 15;

    // 防御属性
    score += aiPlayer.shield * 8;
    score -= humanPlayer.shield * 8;

    // 异常状态
    score -= aiPlayer.bleed * 5;
    score += humanPlayer.bleed * 5;

    // 终局奖励
    if (humanPlayer.hp <= 0) score += 1000;
    if (aiPlayer.hp <= 0) score -= 1000;

    return score;
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

const instuction = `游戏说明：
这个游戏的基本玩法是：
两个人玩，两只手分别可以做出”一到十“的手势，每一种手势代表一个招式。
例如”三“是抓击，”四“是护盾等；当两只手符合特定组合时还可以触发组合技；
每个人在自己的回合可以选择用自己的一只手碰对方的另一只手，两者数值相加，如果超过十仅保留个位。
例如自己的”一“碰对方的”二“变成”三“可以触发技能”抓击”对对方造成伤害。
双方轮流行动。
每人初始有一定血量（例如40点），血量没有上限，率先将对方血量减到零的人获胜：
具体的技能设计如下：{
一：锥刺：造成1穿刺伤害，3流血;
二：点穴：造成1穿刺伤害，眩晕对方；
三：爪击：造成6伤害；
四：护盾：获得一层护盾；
五：巴掌：造成3伤害，若伤害没有被护盾阻挡则眩晕对方；
六：酒：恢复6生命，若有流血则减少一层流血；
七：钻击：造成1穿刺伤害，破坏对方至多两层护盾；
八：枪击：造成16伤害，眩晕自己；
九：钩：造成1穿刺伤害，1流血，减少对方一点力量；
十：握拳：增加自身1力量；
组合技：
一+八：短刀与手枪：对对方造成15伤害，3流血
五+五：五指山：对对方造成10伤害，眩晕一回合
五+十：拜师学艺：自身增加3力量
六+六：狂饮：恢复15生命，增加自身1力量
一+九：倒挂金钩：对对方造成5穿刺伤害，5流血，减少对方一点力量
四+四：壁垒：自身获得3护盾，恢复5生命
八+八：双枪：造成两次15伤害，眩晕自己
一+八：穿刺射击：造成16点穿刺伤害，眩晕自己
一+二：弱点刺击：造成5穿刺伤害，3流血，眩晕对方一回合
}
注：流血效果是：每次到自己回合开始时，收到流血层数点伤害，不可被护盾阻挡，然后流血层数减一;
护盾效果为：每一层护盾可阻挡下一次受到的伤害，如果伤害来源是组合技则消耗两层护盾。护盾上限为三层。
眩晕效果为：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（即不可被连续眩晕）
穿刺伤害：不被护盾影响的伤害（不会消耗护盾）
力量：每有一点力量，每次造成的伤害+1，若为负数则减一
每次开局两人初始手势随机，由玩家先手。`

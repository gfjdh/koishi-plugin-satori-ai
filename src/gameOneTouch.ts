import { Session, Logger, Context, is } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'
import { winFlag } from './game'

const logger = new Logger('satori-game-onetouch')

enum playerStatus {
  Normal, // 正常状态
  Stunned, // 眩晕状态
  lastStunned // 上一回合被眩晕
}

interface PlayerState {
  left: number // 左手势
  right: number // 右手势
  hp: number // 生命值
  shield: number // 护盾值
  strength: number // 力量值
  bleed: number // 流血层数
  status: playerStatus // 玩家状态
}

interface SkillEffect {
  name?: string // 技能名称
  damage?: number // 普通伤害
  damageTimes?: number // 伤害次数
  pierceDamage?: number // 穿刺伤害
  heal?: number // 治疗
  shield?: number // 护盾
  bleed?: number // 流血
  selfbleed?: number // 自身流血
  stun?: boolean // 眩晕
  destroyShield?: number // 破坏护盾
  weakStun?: boolean // 弱眩晕
  selfStun?: boolean // 自身眩晕
  strengthChange?: number // 力量变化
  selfstrengthChange?: number // 自身力量变化
}

export interface OneTouchResult extends gameResult {
  win: winFlag
  message: string
  playerId: number
}

const SKILL_MAP: { [key: string]: SkillEffect } = {
  // 基础技能
  '1': { pierceDamage: 1, bleed: 3, name: '锥刺' },
  '2': { pierceDamage: 1, stun: true, name: '点穴' },
  '3': { damage: 6, name: '爪击' },
  '4': { shield: 1, name: '护盾' },
  '5': { damage: 3, weakStun: true, name: '巴掌' },
  '6': { heal: 6 , selfbleed: -1, name: '酒' },
  '7': { pierceDamage: 1, destroyShield: 2, name: '钻击' },
  '8': { damage: 16, selfStun: true, name: '枪击' },
  '9': { pierceDamage: 1, bleed: 1, strengthChange: -1, name: '钩' },
  '0': { selfstrengthChange: 1, name: '蓄力' },

  // 组合技
  '1+8': { damage: 15, bleed: 3, name: '短刀与手枪' },
  '5+5': { damage: 10, stun: true, name: '五指山' },
  '5+0': { selfstrengthChange: 3, name: '拜师学艺' },
  '6+6': { heal: 15, selfstrengthChange: 1, name: '狂宴' },
  '1+9': { pierceDamage: 5, bleed: 5, strengthChange: -1, name: '倒挂金钩' },
  '4+4': { shield: 3, heal: 5, name: '壁垒' },
  '8+8': { damage: 15, damageTimes: 2, selfStun: true, name: '双持' },
  '1+2': { pierceDamage: 5, bleed: 3, stun: true, name: '弱点刺击' },
}

class OneTouchSingleGame extends abstractGameSingleGame {
  private player: PlayerState
  private ai: PlayerState
  public level: number

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  private generateHands(): [number, number] {
    return [Math.ceil(Math.random() * 10), Math.ceil(Math.random() * 10)]
  }

  public override async startGame() {
    super.startGame()

    this.player = {
      left: Math.round(Math.random() * 9) + 1,
      right: Math.round(Math.random() * 9) + 1,
      hp: 40,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }
    this.ai = {
      left: Math.round(Math.random() * 9) + 1,
      right: Math.round(Math.random() * 9) + 1,
      hp: 40,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }

    const [p1Left, p1Right] = this.generateHands()
    const [p2Left, p2Right] = this.generateHands()

    this.player.left = p1Left
    this.player.right = p1Right
    this.ai.left = p2Left
    this.ai.right = p2Right

    return `游戏开始！
对方的手势：左${p2Left} 右${p2Right}
你的手势：左${p1Left} 右${p1Right}
输入格式"左 右"选择要触碰的手
例如"左 右"表示用你的左手触碰对方的右手`
  }

  public override async processInput(input: string) {
    const [handA, handB] = input.split(' ')
    if (handA !== '左' && handA !== '右' || handB !== '左' && handB !== '右') return
    const numberA = this.player[handA === '左' ? 'left' : 'right']
    const numberB = this.ai[handB === '左' ? 'left' : 'right']
    const result = this.processPlayerTurn(numberA, numberB)
    if (this.ai.hp <= 0) {
      this.endGame()
      return `决胜一击！\n${result}  \n你赢了！发送结束游戏退出`
    }
    this.debugState()
    // AI的回合
    const bestMove = this.ai.status === playerStatus.Stunned ? [0,0] : this.aiSearchEntrance()
    const aiResult = this.processAiTurn(bestMove[0], bestMove[1]);
    if (this.player.hp <= 0) {
      this.endGame()
      return `决胜一击！\n${aiResult}  \n你输了！发送结束游戏退出`
    }
    this.debugState()
    return this.buildTurnResult(result, aiResult)
  }

  private buildTurnResult(result: string, aiResult:string): string {
    return `你的行动：${result}\n我的行动：${aiResult}
    我的当前手势：左${this.ai.left} 右${this.ai.right}
    你的当前手势：左${this.player.left} 右${this.player.right}
    我的当前状态：HP ${this.ai.hp} | 护盾 ${this.ai.shield} | 流血 ${this.ai.bleed} | 力量 ${this.ai.strength}
    你的当前状态：HP ${this.player.hp} | 护盾 ${this.player.shield} | 流血 ${this.player.bleed} | 力量 ${this.player.strength}`
  }

  private processPlayerTurn(handA: number, handB: number): string {
    if (this.player.status === playerStatus.lastStunned) {
      this.player.status = playerStatus.Normal
    }
    if (this.player.status === playerStatus.Stunned) {
      this.player.status = playerStatus.lastStunned
      return "你被眩晕，跳过回合"
    }
    const playerState = this.player
    const aiState = this.ai

    const sum = (handA + handB) % 10
    this.player[handA === playerState.left ? 'left' : 'right'] = sum
    let effect = SKILL_MAP[sum.toString()] || {}
    let isCombo = false
    // 检查组合技
    const combo = this.checkCombo(this.player['left'], this.player['right'])
    if (combo) {
      isCombo = true
      effect = { ...combo }
    }

    this.ai = this.applyEffectToEnemy(playerState, aiState, effect, !!combo)
    this.player = this.applyEffectToSelf(playerState, effect)

    return this.buildResultMessage(effect, isCombo, effect.name || '')
  }

  private processAiTurn(handA: number, handB: number): string {
    if (this.ai.status === playerStatus.lastStunned) {
      this.ai.status = playerStatus.Normal
    }
    if (this.ai.status === playerStatus.Stunned) {
      this.ai.status = playerStatus.lastStunned
      return "被眩晕，跳过回合"
    }
    const sum = (handA + handB) % 10
    this.ai[handA === this.ai.left ? 'left' : 'right'] = sum
    let effect = SKILL_MAP[sum.toString()] || {}
    let isCombo = false
    // 检查组合技
    const combo = this.checkCombo(this.ai['left'], this.ai['right'])
    if (combo) {
      isCombo = true
      effect = { ...combo }
    }

    this.player = this.applyEffectToEnemy(this.ai, this.player, effect, !!combo)
    this.ai = this.applyEffectToSelf(this.ai, effect)

    return this.buildResultMessage(effect, isCombo, effect.name || '')
  }

  // damage?: number // 普通伤害
  // damageTimes?: number // 伤害次数
  // pierceDamage?: number // 穿刺伤害
  // bleed?: number // 流血
  // stun?: boolean // 眩晕
  // destroyShield?: number // 破坏护盾
  // weakStun?: boolean // 弱眩晕
  // strengthChange?: number // 力量变化
  private applyEffectToEnemy(self: PlayerState, target: PlayerState, effect: SkillEffect, isCombo: boolean) {
    if (effect.pierceDamage) target.hp -= effect.pierceDamage + (self.strength || 0)
    if (effect.destroyShield) target.shield = Math.max(0, target.shield - effect.destroyShield)
    if (effect.bleed) target.bleed += effect.bleed
    if (effect.strengthChange) target.strength = target.strength + effect.strengthChange

    if (effect.damage) {
      effect.damageTimes = effect.damageTimes || 1
      for (let i = 0; i < effect.damageTimes; i++) {
        const blocked = target.shield > 0
        target.shield = Math.max(0, target.shield - (isCombo ? 2 : 1))
        if (!blocked) {
          target.hp -= effect.damage + (self.strength || 0)
          if (effect.weakStun && target.status !== playerStatus.lastStunned) {
            target.status = playerStatus.Stunned
          }
        }
      }
    }
    if (effect.stun && target.status !== playerStatus.lastStunned)
      target.status = playerStatus.Stunned
    return target
  }

  // heal?: number // 治疗
  // shield?: number // 护盾
  // selfbleed?: number // 自身流血
  // selfStun?: boolean // 自身眩晕
  // selfstrengthChange?: number // 自身力量变化
  private applyEffectToSelf(self: PlayerState, effect: SkillEffect) {
    if (effect.heal) self.hp += effect.heal
    if (effect.shield) self.shield = Math.min(self.shield + effect.shield, 3)
    if (effect.selfstrengthChange) self.strength = self.strength + effect.selfstrengthChange
    if (effect.selfbleed) self.bleed = self.bleed + effect.selfbleed
    if (effect.selfStun && self.status !== playerStatus.lastStunned)
      self.status = playerStatus.Stunned
    // 处理流血
    if (self.bleed > 0) self.hp -= self.bleed
    self.bleed = Math.max(0, self.bleed - 1)
    return self
  }

  private checkCombo(a: number, b: number): SkillEffect | null {
    const key = `${Math.min(a, b)}+${Math.max(a, b)}`
    return SKILL_MAP[key] || null
  }

  private buildResultMessage(effect: SkillEffect, isCombo: boolean, name: string): string {
    let msg = []
    if (name) msg.push(`${name}!`)
    if (effect.pierceDamage) msg.push(`对对方造成穿刺伤害${effect.pierceDamage}`)
    if (effect.damage) msg.push(`对对方造成${effect.damage}伤害`)
    if (effect.damageTimes) msg.push(`${effect.damageTimes}次`)
    if (effect.heal) msg.push(`自身恢复${effect.heal}生命`)
    if (effect.selfbleed) msg.push(`自身流血${effect.selfbleed > 0 ? '增加' : '减少'}${Math.abs(effect.selfbleed)}`)
    if (effect.bleed) msg.push(`对方叠加${effect.bleed}层流血`)
    if (effect.shield) msg.push(`自身获得${effect.shield}层护盾`)
    if (effect.destroyShield) msg.push(`破坏对方${effect.destroyShield}层护盾`)
    if (effect.strengthChange) msg.push(`对方力量${effect.strengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.strengthChange)}`)
    if (effect.selfstrengthChange) msg.push(`自身力量${effect.selfstrengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.selfstrengthChange)}`)
    if (effect.stun) msg.push(`眩晕对方`)
    if (effect.weakStun) msg.push(`弱眩晕对方`)
    if (effect.selfStun) msg.push(`眩晕自己`)
    if (isCombo) msg.unshift('触发组合技！')
    return msg.join('，')
  }

  private aiSearchEntrance() {
    let bestScore = -Infinity;
    let bestMove: [number, number] = [0, 0];

    const possibleMoves = this.generatePossibleMoves(this.player, this.ai);
    for (const move of possibleMoves) {
      // 克隆当前状态
      const simulatedState: [PlayerState, PlayerState] = [
        this.cloneState(this.player),
        this.cloneState(this.ai)
      ];

      const newState = this.simulateMove(move, simulatedState, 1);

      // 根据难度设置搜索深度
      const depth = this.level > 5 ? 4 : this.level;
      const score = this.aiSearch(
        depth,
        false,
        newState,
        -Infinity,
        Infinity
      );

      if (score > bestScore) {
        bestScore = score;
        bestMove = move;
      }
    }
    return bestMove;
  }

  private aiSearch(depth: number, isMaximizing: boolean, currentState: [PlayerState, PlayerState], alpha: number, beta: number): number {
    // 终止条件：达到最大深度或游戏结束
    if (depth === 0 || currentState[0].hp <= 0 || currentState[1].hp <= 0) {
      return this.evaluateState(currentState);
    }

    const possibleMoves = this.generatePossibleMoves(currentState[0], currentState[1]);
    let value = isMaximizing ? -Infinity : Infinity;

    for (const move of possibleMoves) {
      // 克隆当前状态
      const nowState: [PlayerState, PlayerState] = [
        this.cloneState(currentState[0]),
        this.cloneState(currentState[1])
      ];

      // 模拟执行动作
      const newState = this.simulateMove(move, nowState, isMaximizing ? 1 : 0);

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
  private generatePossibleMoves(player: PlayerState, opponent: PlayerState): [number, number][] {
    let moves: [number, number][] = [];

    // 可触碰对方左右手（0: 左，1: 右）
    for (const targetHand of [0, 1]) {
      // 己方左右手均可选择
      moves.push([player.left, opponent[targetHand ? 'right' : 'left']]);
      moves.push([player.right, opponent[targetHand ? 'right' : 'left']]);
    }
    return moves
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
    let attacker = state[attackerIndex];
    let defender = state[1 - attackerIndex];

    // 处理组合技
    const sum = (handA + handB) % 10
    attacker[handA === attacker.left ? 'left' : 'right'] = sum
    const combo = this.checkCombo(attacker.left, attacker.right)
    const effect = combo ? combo : SKILL_MAP[sum.toString()] || {};

    defender = this.applyEffectToEnemy(attacker, defender, effect, !!combo)
    attacker = this.applyEffectToSelf(attacker, effect)
    if (attackerIndex === 1) {
      const temp = attacker
      attacker = defender
      defender = temp
    }
    const result: [PlayerState, PlayerState] = [attacker, defender]
    return result
  }

  // 增强版局面评估函数
  private evaluateState(state: [PlayerState, PlayerState]): number {
    const aiPlayer = state[1]; // AI始终是玩家1
    const humanPlayer = state[0];

    // 基础分差
    let score = (aiPlayer.hp - humanPlayer.hp) * 10;

    // 战斗属性加成
    score += aiPlayer.strength * 5;
    score -= humanPlayer.strength * 5;

    // 防御属性
    score += aiPlayer.shield * 8;
    score -= humanPlayer.shield * 8;

    // 异常状态
    score -= aiPlayer.bleed * 5;
    score += humanPlayer.bleed * 5;

    // 终局奖励
    if (humanPlayer.hp <= 0) score += 10000;
    if (aiPlayer.hp <= 0) score -= 10000;

    return score;
  }

  private debugState(): void {
    const state = [this.player, this.ai]
    logger.info(`
AI手势: 左${state[1].left} 右${state[1].right}
玩家手势: 左${state[0].left} 右${state[0].right}
AI: HP ${state[1].hp} | 护盾 ${state[1].shield} | 流血 ${state[1].bleed} | 力量 ${state[1].strength} | 状态 ${state[1].status}
玩家: HP ${state[0].hp} | 护盾 ${state[0].shield} | 流血 ${state[0].bleed} | 力量 ${state[0].strength} | 状态 ${state[0].status}`)
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
十：蓄力：增加自身1力量；
组合技：
一+八：短刀与手枪：对对方造成15伤害，3流血
五+五：五指山：对对方造成10伤害，眩晕一回合
五+十：拜师学艺：自身增加3力量
六+六：狂宴：恢复15生命，增加自身1力量
一+九：倒挂金钩：对对方造成5穿刺伤害，5流血，减少对方一点力量
四+四：壁垒：自身获得3护盾，恢复5生命
八+八：双持：造成两次15伤害，眩晕自己
一+八：穿刺射击：造成16点穿刺伤害，眩晕自己
一+二：弱点刺击：造成5穿刺伤害，3流血，眩晕对方一回合
}
注：流血效果是：每次到自己回合开始时，收到流血层数点伤害，不可被护盾阻挡，然后流血层数减一;
护盾效果为：每一层护盾可阻挡下一次受到的伤害，如果伤害来源是组合技则消耗两层护盾。护盾上限为三层。
眩晕效果为：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（即不可被连续眩晕）
穿刺伤害：不被护盾影响的伤害（不会消耗护盾）
力量：每有一点力量，每次造成的伤害+1，若为负数则减一
每次开局两人初始手势随机，由玩家先手。`

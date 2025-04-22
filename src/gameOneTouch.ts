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
  '-1': { damage: 0, name: '无效' },
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
  '6+6': { heal: 15, selfstrengthChange: 1, selfbleed: -3, name: '狂宴' },
  '1+9': { pierceDamage: 5, bleed: 5, strengthChange: -1, name: '倒挂金钩' },
  '4+4': { shield: 3, heal: 5, name: '壁垒' },
  '8+8': { damage: 15, damageTimes: 2, selfStun: true, name: '双持' },
  '1+2': { pierceDamage: 5, bleed: 3, stun: true, name: '弱点刺击' },
}

class OneTouchSingleGame extends abstractGameSingleGame {
  private player: PlayerState
  private ai: PlayerState
  public level: number
  private winningFlag: winFlag = winFlag.pending // 当前胜负状态
  private turnCount: number // 当前回合数
  private baseHP: number = 30 // 初始血量
  private levelHP: number = 5 // 每级增加的血量
  private HPtoMax: number = 20 // 超出初始血量的最大值

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  public override async startGame() {
    super.startGame()
    this.turnCount = 0
    this.player = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }
    this.ai = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }
    return await wrapInHTML(`游戏开始！
对方的手势：左${this.ai.left} 右${this.ai.right}
你的手势：左${this.player.left} 右${this.player.right}
输入格式"左 右"选择要触碰的手
例如"左 右"表示用你的左手触碰对方的右手
注：
发送"游戏规则"查看游戏规则
发送"结束游戏"退出游戏`)
  }

  // 结束游戏，返回结果
  public override endGame = async () => {
    super.endGame()
    return { message: `${this.level}`, win: this.winningFlag, gameName: '一碰一', playerID: this.session.userId }
  }

  private initState(level: number) {
    this.player = {
      left: this.player.left,
      right: this.player.right,
      hp: this.baseHP + level * this.levelHP,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }
    this.ai = {
      left: this.ai.left,
      right: this.ai.right,
      hp: this.baseHP + level * this.levelHP,
      shield: 0,
      strength: 0,
      bleed: 0,
      status: playerStatus.Normal
    }
  }

  public override async processInput(input: string) {
    if (input === '游戏规则') return await wrapInHTML(instuction)
    if (this.turnCount === 0) this.initState(this.level)
    this.turnCount++
    if (this.winningFlag !== winFlag.pending) return '游戏已结束'
    // 处理输入
    const [handA, handB] = input.split(' ')
    if (handA !== '左' && handA !== '右' || handB !== '左' && handB !== '右') return
    const numberA = this.player[handA === '左' ? 'left' : 'right']
    const numberB = this.ai[handB === '左' ? 'left' : 'right']
    // 玩家回合
    const result = this.processPlayerTurn(numberA, numberB)
    // AI的回合
    const bestMove = this.ai.status === playerStatus.Stunned ? [0,0] : this.aiSearchEntrance()
    const aiResult = this.processAiTurn(bestMove[0], bestMove[1]);
    return await this.buildTurnResult(result, aiResult)
  }

  private async buildTurnResult(result: string, aiResult:string): Promise<string> {
    // 创建状态条生成函数
    const createStatusBar = (value: number, max: number, width: number) =>
      `[${'■'.repeat(Math.round(value / max * width))}${'□'.repeat(width - Math.round(value / max * width))}]`;

    // 创建状态标记生成函数
    const statusIcon = (value: number, icon: string) =>
      value > 0 ? `${icon}×${value}` : '';

    // 生成双方状态
    const aiStatusDisplay = [
      `❤️${createStatusBar(this.ai.hp, this.baseHP + this.HPtoMax + this.level * this.levelHP, 10)} ${this.ai.hp}HP`,
      `🛡️${this.ai.shield}`,
      statusIcon(this.ai.bleed, "🩸"),
      statusIcon(this.ai.strength, "💪"),
      this.ai.status === playerStatus.Stunned ? "💫 眩晕" : ""
    ].filter(Boolean).join(" | ");

    const playerStatusDisplay = [
      `❤️${createStatusBar(this.player.hp, this.baseHP + this.HPtoMax + this.level * this.levelHP, 10)} ${this.player.hp}HP`,
      `🛡️${this.player.shield}`,
      statusIcon(this.player.bleed, "🩸"),
      statusIcon(this.player.strength, "💪"),
      this.player.status === playerStatus.Stunned ? "💫 眩晕" : ""
    ].filter(Boolean).join(" | ");

    return wrapInHTML(`你的行动：${result}\n\n我的行动：${aiResult}

  我的当前手势：左${this.ai.left} 右${this.ai.right}
  你的当前手势：左${this.player.left} 右${this.player.right}

  图例：❤️ 生命值 | 🛡️ 护盾 | 🩸 流血 | 💪 力量 | 💫 眩晕
  ——————————————————我的状态———————————————————
  |${aiStatusDisplay}
  —————————————————————————————————————————

  ——————————————————你的状态———————————————————
  |${playerStatusDisplay}
  —————————————————————————————————————————
  ${this.judgeEnd() || ''}`);
  }

  private judgeEnd(): string {
    if (this.ai.hp <= 0) {
      this.winningFlag = winFlag.win
      this.endGame()
      return `你赢了！发送结束游戏退出`
    }
    if (this.player.hp <= 0) {
      this.winningFlag = winFlag.lose
      this.endGame()
      return `你输了！发送结束游戏退出`
    }
  }

  private processPlayerTurn(handA: number, handB: number): string {
    if (this.player.status === playerStatus.lastStunned) {
      this.player.status = playerStatus.Normal
    }
    if (this.player.status === playerStatus.Stunned) {
      this.player.status = playerStatus.lastStunned
      this.player = this.applyEffectToSelf(this.player, SKILL_MAP['-1'])
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

    return this.buildResultMessage(effect, isCombo, effect.name || '', this.ai, this.player)
  }

  private processAiTurn(handA: number, handB: number): string {
    if (this.ai.status === playerStatus.lastStunned) {
      this.ai.status = playerStatus.Normal
    }
    if (this.ai.status === playerStatus.Stunned) {
      this.ai.status = playerStatus.lastStunned
      this.ai = this.applyEffectToSelf(this.ai, SKILL_MAP['-1'])
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

    return handA + '碰' + handB + '，' + this.buildResultMessage(effect, isCombo, effect.name || '', this.player, this.ai)
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
    if (effect.shield) self.shield = Math.min(self.shield + effect.shield, 5)
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

  private buildResultMessage(effect: SkillEffect, isCombo: boolean, name: string, selfStatu: PlayerState, enemyStatu: PlayerState): string {
    let msg = []
    if (name) msg.push(`${name}!`)
    if (effect.pierceDamage) msg.push(`对对方造成穿刺伤害${effect.pierceDamage + (selfStatu.strength || 0)}`)
    if (effect.damage) msg.push(`对对方造成${effect.damage + (selfStatu.strength || 0)}伤害`)
    if (effect.damageTimes) msg.push(`${effect.damageTimes}次`)
    if (effect.heal) msg.push(`自身恢复${effect.heal}生命`)
    if (effect.selfbleed) msg.push(`自身流血${effect.selfbleed > 0 ? '增加' : '减少'}${Math.abs(effect.selfbleed)}`)
    if (effect.bleed) msg.push(`对方叠加${effect.bleed}层流血`)
    if (effect.shield) msg.push(`自身获得${effect.shield}层护盾`)
    if (effect.destroyShield) msg.push(`破坏对方${effect.destroyShield}层护盾`)
    if (effect.strengthChange) msg.push(`对方力量${effect.strengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.strengthChange)}`)
    if (effect.selfstrengthChange) msg.push(`自身力量${effect.selfstrengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.selfstrengthChange)}`)
    if (enemyStatu.status !== playerStatus.lastStunned) {
      if (effect.stun) msg.push(`眩晕对方`)
      if (effect.weakStun && enemyStatu.shield === 0) msg.push(`弱眩晕对方`)
    }
    if (effect.selfStun && selfStatu.status !== playerStatus.lastStunned) msg.push(`眩晕自己`)
    if (selfStatu.bleed > 0) msg.push(`自身受到流血伤害${selfStatu.bleed}`)
    if (isCombo) msg.unshift('触发组合技！\n')
    return msg.join(' ')
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
      const score = this.aiSearch(
        this.level,
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
    logger.info(`AI选择的动作：${bestMove[0]}碰${bestMove[1]}, 分数：${bestScore}`);
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

      if (isMaximizing) {
        value = Math.max(value, evalResult);
        alpha = Math.max(alpha, evalResult);
        if (alpha >= beta) break; // 剪枝
      } else {
        value = Math.min(value, evalResult);
        beta = Math.min(beta, evalResult);
        if (beta <= alpha) break; // 剪枝
      }
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

    if (attacker.status === playerStatus.lastStunned) attacker.status = playerStatus.Normal
    if (attacker.status === playerStatus.Stunned) {
      attacker.status = playerStatus.lastStunned
      attacker = this.applyEffectToSelf(attacker, SKILL_MAP['-1'])
    } else {
      const sum = (handA + handB) % 10
      attacker[handA === attacker.left ? 'left' : 'right'] = sum
      const combo = this.checkCombo(attacker.left, attacker.right)
      const effect = combo ? combo : SKILL_MAP[sum.toString()] || {};

      defender = this.applyEffectToEnemy(attacker, defender, effect, !!combo)
      attacker = this.applyEffectToSelf(attacker, effect)
    }

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
    const ai = state[1]; // AI始终是玩家1
    const player = state[0];

    // 基础分差
    let score = (ai.hp - player.hp);

    // 战斗属性加成
    score += Math.min(ai.strength * 5, 100);
    score -= Math.min(player.strength * 5, 100);

    // 防御属性
    score += ai.shield * 8;
    score -= player.shield * 8;

    // 异常状态
    score -= Math.min(Math.round(ai.bleed * ai.bleed / 2.5), 900);
    score += Math.min(Math.round(player.bleed * player.bleed / 2.5), 900);

    // 终局奖励
    if (player.hp <= 0) score += 100000;
    if (ai.hp <= 0) score -= 100000;

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
        session.send('未输入难度等级(2-10)，默认设为5')
      }, 500);

      level = 5
    }
    if (level < 2 || level > 10) {
      level = level < 2 ? 2 : 10
      setTimeout(() => {
        session.send('难度等级必须在2到10之间,已调整为' + level)
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
例如自己的”一“碰对方的”二“变成”三“可以触发技能”爪击”对对方造成伤害。
每次开局两人初始手势随机，由玩家先手，双方轮流行动。
每人初始有30 + 难度*5血量，血量没有上限，率先将对方血量减到零的人获胜：
具体的技能设计如下：{
一：${SKILL_MAP['1'].name}：造成${SKILL_MAP['1'].pierceDamage}穿刺伤害，${SKILL_MAP['1'].bleed}流血;
二：${SKILL_MAP['2'].name}：造成${SKILL_MAP['2'].pierceDamage}穿刺伤害，眩晕对方；
三：${SKILL_MAP['3'].name}：造成${SKILL_MAP['3'].damage}伤害；
四：${SKILL_MAP['4'].name}：获得${SKILL_MAP['4'].shield}层护盾；
五：${SKILL_MAP['5'].name}：造成${SKILL_MAP['5'].damage}伤害，弱眩晕对方；
六：${SKILL_MAP['6'].name}：恢复${SKILL_MAP['6'].heal}生命，若有流血则自身${SKILL_MAP['6'].selfbleed}流血；
七：${SKILL_MAP['7'].name}：造成${SKILL_MAP['7'].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP['7'].destroyShield}层护盾；
八：${SKILL_MAP['8'].name}：造成${SKILL_MAP['8'].damage}伤害，眩晕自己；
九：${SKILL_MAP['9'].name}：造成${SKILL_MAP['9'].pierceDamage}穿刺伤害，${SKILL_MAP['9'].bleed}流血，对方${SKILL_MAP['9'].strengthChange}力量；
十：${SKILL_MAP['0'].name}：增加自身${SKILL_MAP['0'].selfstrengthChange}力量；
组合技：
一+八：${SKILL_MAP['1+8'].name}：对对方造成${SKILL_MAP['1+8'].damage}穿刺伤害，${SKILL_MAP['1+8'].bleed}流血
五+五：${SKILL_MAP['5+5'].name}：对对方造成${SKILL_MAP['5+5'].damage}伤害，眩晕对方
五+十：${SKILL_MAP['5+0'].name}：自身增加${SKILL_MAP['5+0'].selfstrengthChange}力量
六+六：${SKILL_MAP['6+6'].name}：恢复${SKILL_MAP['6+6'].heal}生命，增加自身${SKILL_MAP['6+6'].selfstrengthChange}力量，自身${SKILL_MAP['6+6'].selfbleed}流血
一+九：${SKILL_MAP['1+9'].name}：对对方造成${SKILL_MAP['1+9'].pierceDamage}穿刺伤害，${SKILL_MAP['1+9'].bleed}流血，对方${SKILL_MAP['1+9'].strengthChange}力量
四+四：${SKILL_MAP['4+4'].name}：获得${SKILL_MAP['4+4'].shield}层护盾，恢复${SKILL_MAP['4+4'].heal}生命
八+八：${SKILL_MAP['8+8'].name}：造成${SKILL_MAP['8+8'].damage}伤害${SKILL_MAP['8+8'].damageTimes}次，眩晕自己
一+八：${SKILL_MAP['1+8'].name}：造成${SKILL_MAP['1+8'].damage}穿刺伤害，眩晕自己
一+二：${SKILL_MAP['1+2'].name}：造成${SKILL_MAP['1+2'].pierceDamage}穿刺伤害，${SKILL_MAP['1+2'].bleed}流血，眩晕对方
}
注：
流血效果：每次到自己回合结束时，收到流血层数点伤害，不可被护盾阻挡，然后流血层数减1;
护盾效果：每一层护盾可阻挡下一次受到的伤害，如果伤害来源是组合技则消耗两层护盾。护盾上限为五层。
眩晕效果：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（即不可被连续眩晕）
弱眩晕效果：若对方没有护盾，则眩晕对方一回合
穿刺伤害：不被护盾影响的伤害（不会消耗护盾）
力量效果：每有一点力量，每次造成的伤害+1，若为负数则减一
组合技：两只手势相加后符合组合技条件时触发组合技，组合技的效果会覆盖普通技能的效果
`


import { puppeteer } from '.'
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

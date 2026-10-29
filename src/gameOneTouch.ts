import { Session, Logger, Context } from 'koishi'
import { abstractGame, abstractGameSingleGame, gameResult } from './abstractGame'
import { winFlag } from './game'
import { evaluatePosition, handcraftedWeights, isValidWeights } from './oneTouchEngine'
import { ONETOUCH_EVAL_WEIGHTS } from './oneTouchWeights'

const logger = new Logger('satori-game-onetouch')

// 训练好的评估权重；权重文件损坏或维度不符时回退到手调权重（等价于旧评估）
const ONETOUCH_WEIGHTS = isValidWeights(ONETOUCH_EVAL_WEIGHTS)
  ? ONETOUCH_EVAL_WEIGHTS
  : handcraftedWeights()

export enum playerStatus {
  Normal, // 正常状态
  Stunned, // 眩晕状态
  lastStunned // 上一回合被眩晕
}

export interface PlayerState {
  left: number // 左手势
  right: number // 右手势
  hp: number // 生命值
  shield?: number // 护盾值
  strength?: number // 力量值
  bleed?: number // 流血层数
  counterAttack?: number // 反击伤害
  vulnerablility?: number // 易伤层数
  status: playerStatus // 玩家状态
}

export interface SkillEffect {
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
  addSelfLeft?: number // 自身左手势增加值
  addSelfRight?: number // 自身右手势增加值
  addLeft?: number // 对方左手势增加值
  addRight?: number // 对方右手势增加值
  counterAttack?: number // 反击伤害
  vulnerablility?: number // 易伤层数
  magnificentEnd?: boolean // 华丽收场
  revwersalOfStrength?: boolean // 力量反转
}

export interface OneTouchResult extends gameResult {
  win: winFlag
  bonus: number
}

export const SKILL_MAP: { [key: string]: SkillEffect } = {
  // 基础技能
  '-1': {},
  '1': { pierceDamage: 1, bleed: 3, name: '锥刺' }, //特性：流血
  '2': { pierceDamage: 1, stun: true, name: '点穴' }, //特性：眩晕
  '3': { damage: 6, counterAttack: 3, name: '爪击' }, //特性：反击
  '4': { shield: 1, name: '护盾' }, //特性：护盾
  '5': { damage: 4, weakStun: true, name: '巴掌' }, //特性：普通伤害+弱眩晕
  '6': { heal: 6, selfbleed: -2, name: '酒' }, //特性：回血
  '7': { pierceDamage: 1, destroyShield: 2, name: '钻击' }, //特性：破盾
  '8': { damage: 13, selfStun: true, name: '枪击' }, //特性：高伤+自眩晕
  '9': { pierceDamage: 1, bleed: 2, strengthChange: -1, name: '钩' }, //特性：削弱
  '0': { selfstrengthChange: 2, name: '蓄力' }, //特性：蓄力

  // 组合技
  '1+8': { damage: 15, bleed: 3, selfStun: true, name: '空尖弹' },
  '5+5': { damage: 5, stun: true, name: '镇压' },
  '0+5': { selfstrengthChange: 5, name: '拜师学艺', addSelfLeft: 1, addSelfRight: 2 },
  '6+6': { heal: 15, selfstrengthChange: 1, selfbleed: -3, name: '狂宴' },
  '5+6': { name: '包扎', heal: 6, selfbleed: -5 },
  '1+9': { pierceDamage: 3, bleed: 5, strengthChange: -2, name: '收割' },
  '4+4': { shield: 4, heal: 5, name: '壁垒' },
  '4+6': { shield: 2, heal: 5, selfbleed: -3, name: '固守' },
  '8+8': { damage: 13, damageTimes: 2, selfStun: true, name: '双持' },
  '1+2': { pierceDamage: 3, vulnerablility: 3, stun: true, name: '弱点刺击' },
  '2+8': { damage: 12, stun: true, selfStun: true, addLeft: 1, addRight: 9, name: '点射' },
  '3+4': { name: '防御反击', shield: 1, counterAttack: 15 },
  '7+7': { pierceDamage: 7, destroyShield: 5, name: '穿龙枪' },
  '7+8': { pierceDamage: 13, destroyShield: 3, selfStun: true, name: '穿甲弹' },
  '2+6': { damage: 5, heal: 6, selfbleed: -1, selfstrengthChange: 1, stun: true, name: '点辰' },
  '3+7': { name: '混沌', counterAttack: 7, destroyShield: 2, addLeft: 9, addRight: 1 },
  '0+9': { name: '将大局逆转吧', revwersalOfStrength: true, selfstrengthChange: 2, strengthChange: -1 },
  '0+0': { name: '华丽收场', bleed: 5, selfstrengthChange: -99, magnificentEnd: true }
}

class OneTouchSingleGame extends abstractGameSingleGame {
  private player: PlayerState
  private ai: PlayerState
  public level: number
  private winningFlag: winFlag = winFlag.pending // 当前胜负状态
  private turnCount: number // 当前回合数
  private baseHP: number = 40 // 初始血量
  private playerLevelHP: number = 10 // 每级增加的血量
  private aiLevelHp: number = 10 // AI每级增加的血量
  private lastScore: number = 0 // 上一回合的分数
  private bonus: number = 0 // 奖励分数
  private singleBonus: number = 0 // 单回合的分数
  private singleBonusMultiplier: number = 1 // 单回合的分数倍率
  private comboCombos: number = 0 // 组合技连击次数

  constructor(disposeListener: () => boolean, session: Session) {
    super(disposeListener, session)
  }

  public override async startGame() {
    super.startGame()
    this.turnCount = 0
    this.bonus = 0
    this.comboCombos = 0
    this.player = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      status: playerStatus.Normal
    }
    this.ai = {
      left: Math.round(Math.random() * 8) + 1,
      right: Math.round(Math.random() * 8) + 1,
      hp: this.baseHP,
      status: playerStatus.Normal
    }
    return await wrapInHTML(`游戏开始！
对方的手势：左${this.ai.left} 右${this.ai.right}
你的手势：左${this.player.left} 右${this.player.right}
输入格式"左 右"选择要触碰的手
例如"左 右"表示用你的左手触碰对方的右手
注：
发送"游戏规则"查看游戏规则
发送"技能列表"查看技能列表
发送"结束游戏"退出游戏`)
  }

  // 结束游戏，返回结果
  public override endGame = async (): Promise<OneTouchResult> => {
    if (this.winningFlag === winFlag.pending || this.winningFlag === winFlag.lose) {
      this.bonus = Math.abs(Math.floor(this.level * 0.2 * this.bonus))
      this.bonus -= Math.floor(this.level * this.level * (Math.random() * 2 + 2) + 50)
      this.bonus = Math.min(this.bonus, 0)
    }
    if (this.winningFlag === winFlag.win) {
      this.bonus = Math.floor(this.level * this.bonus * 0.1 * (Math.random() * 1 + 1))
    }
    const finalBonus = this.bonus
    super.endGame()
    return { win: this.winningFlag, gameName: '一碰一', playerID: this.session.userId, bonus: finalBonus, message: this.level.toString() }
  }

  private initState(level: number) {
    this.player = {
      left: this.player.left,
      right: this.player.right,
      hp: this.baseHP + level * this.playerLevelHP,
      shield: Math.round(6 - level / 2),
      strength: 0,
      bleed: 0,
      counterAttack: 0,
      vulnerablility: 0,
      status: playerStatus.Normal
    }
    this.ai = {
      left: this.ai.left,
      right: this.ai.right,
      hp: this.baseHP + level * this.aiLevelHp,
      shield: 0,
      strength: 0,
      bleed: 0,
      counterAttack: 0,
      vulnerablility: 0,
      status: playerStatus.Normal
    }
  }

  public override async processInput(input: string) {
    if (input === '游戏规则') return await wrapInHTML(this.instuction)
    if (input === '技能列表') return await wrapInHTML(this.skillList)
    if (this.turnCount === 0) this.initState(this.level)
    this.turnCount++
    // 处理输入
    const [handA, handB] = input.split(' ')
    if (handA !== '左' && handA !== '右' || handB !== '左' && handB !== '右') return
    if (this.winningFlag !== winFlag.pending) return '游戏已结束'
    const numberA = this.player[handA === '左' ? 'left' : 'right']
    const numberB = this.ai[handB === '左' ? 'left' : 'right']
    // 玩家回合
    const result = this.processPlayerTurn(numberA, numberB)
    // AI的回合
    const bestMove = this.ai.status === playerStatus.Stunned ? [0, 0] : this.aiSearchEntrance()
    const aiResult = this.processAiTurn(bestMove[0], bestMove[1]);
    if (this.player.status === playerStatus.Stunned && this.player.hp > 0 && this.ai.hp > 0)
      setTimeout(async () => { this.session.send(await this.processInput(input)) }, 1000)
    return await this.buildTurnResult(result, aiResult)
  }

  private async buildTurnResult(result: string, aiResult: string): Promise<string> {
    // 创建状态条生成函数
    const createStatusBar = (value: number, max: number, width: number) =>
      `[${'■'.repeat(Math.max(Math.ceil(value / max * width), 0))}${'□'.repeat(width - Math.max(Math.ceil(value / max * width)))}]`;

    // 创建状态标记生成函数
    const statusIcon = (value: number, icon: string) =>
      value != 0 ? `${icon}×${value}` : '';

    // 生成双方状态
    const aiStatusDisplay = [
      `❤️${createStatusBar(this.ai.hp, Math.max(this.baseHP + this.level * this.aiLevelHp, this.ai.hp), Math.round(this.baseHP / 8 + this.level * this.aiLevelHp / this.playerLevelHP))} ${this.ai.hp}HP`,
      `🛡️${this.ai.shield}`,
      statusIcon(this.ai.bleed, "🩸"),
      statusIcon(this.ai.strength, "💪"),
      statusIcon(this.ai.counterAttack, "🗡️"),
      statusIcon(this.ai.vulnerablility, "💔"),
      this.ai.status === playerStatus.Stunned ? "💫 眩晕" : "",
    ].filter(Boolean).join(" | ");

    const playerStatusDisplay = [
      `❤️${createStatusBar(this.player.hp, Math.max(this.baseHP + this.level * this.playerLevelHP, this.player.hp), Math.round(this.baseHP / 8 + this.level))} ${this.player.hp}HP`,
      `🛡️${this.player.shield}`,
      statusIcon(this.player.bleed, "🩸"),
      statusIcon(this.player.strength, "💪"),
      statusIcon(this.player.counterAttack, "🗡️"),
      statusIcon(this.player.vulnerablility, "💔"),
      this.player.status === playerStatus.Stunned ? "💫 眩晕" : ""
    ].filter(Boolean).join(" | ");

    return wrapInHTML(`▶️你的行动：${result}\n\n▶️我的行动：${aiResult}

  我的当前手势：左${this.ai.left} 右${this.ai.right}
  你的当前手势：左${this.player.left} 右${this.player.right}

  图例：❤️ 生命值 | 🛡️ 护盾 | 🩸 流血 | 💪 力量 | 🗡️ 反击 | 💔 易伤 | 💫 眩晕
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
      return `你赢了！发送"结束游戏"退出`
    }
    if (this.player.hp <= 0) {
      this.winningFlag = winFlag.lose
      return `你输了！发送"结束游戏"退出`
    }
  }

  private processPlayerTurn(handA: number, handB: number): string {
    if (this.player.status === playerStatus.lastStunned) {
      this.player.status = playerStatus.Normal
    }
    if (this.player.status === playerStatus.Stunned) {
      this.player.status = playerStatus.lastStunned
      this.applyEffect(this.player, this.ai, SKILL_MAP['-1'], false)
      return "你被眩晕，跳过回合" + this.buildResultMessage(SKILL_MAP['-1'], false, this.player, this.ai)
    }
    const sum = (handA + handB) % 10
    this.player[handA === this.player.left ? 'left' : 'right'] = sum
    let effect = SKILL_MAP[sum.toString()] || {}
    let isCombo = false
    // 检查组合技
    const combo = this.checkCombo(this.player['left'], this.player['right'])
    if (combo) {
      isCombo = true
      this.comboCombos++
      effect = { ...combo }
    } else {
      this.comboCombos = 0
    }
    const bonusMessage = this.buildMyTurnBonusMessage(effect, isCombo)
    this.applyEffect(this.player, this.ai, effect, !!combo)

    return this.buildResultMessage(effect, isCombo, this.player, this.ai) + (bonusMessage ? `\n\n${bonusMessage}` : '')
  }

  // 生成玩家回合奖励信息
  private buildMyTurnBonusMessage(effect: SkillEffect, isCombo: boolean): string {
    let bonusMessage = ''
    this.singleBonus = 0
    this.singleBonusMultiplier = 1
    if (isCombo) {
      this.singleBonus += 10
      bonusMessage += `触发组合技，获得10点分数!\n`
    }
    if ((effect.damage || 0) * (effect.damageTimes || 1) >= 20 && this.ai.shield === 0) {
      const effectBonus = Math.round((effect.damage || 0) * (effect.damageTimes || 1) * 0.8)
      this.singleBonus += effectBonus
      bonusMessage += `沉重一击！获得${effectBonus}点分数!\n`
    }
    if ((effect.pierceDamage || 0) >= 15) {
      const effectBonus = Math.round(effect.pierceDamage * 0.5)
      this.singleBonus += effectBonus
      bonusMessage += `穿刺一击！获得${effectBonus}点分数!\n`
    }
    if ((effect.destroyShield || 0) >= Math.min(this.ai.shield, 3) && this.ai.shield > 1) {
      const effectBonus = Math.round(this.ai.shield * 5)
      this.singleBonus += effectBonus
      bonusMessage += `快速破盾！获得${effectBonus}点分数!\n`
    }
    if ((effect.bleed || 0) + this.ai.bleed > 9) {
      const effectBonus = Math.round(this.ai.bleed)
      this.singleBonus += effectBonus
      bonusMessage += `流血打击！获得${effectBonus}点分数!\n`
    }
    if (effect.shield && (effect.shield || 0) + this.player.shield >= 5) {
      const effectBonus = Math.round(((effect.shield || 0) + this.player.shield) * 2)
      this.singleBonus += effectBonus
      bonusMessage += `强效护盾！获得${effectBonus}点分数!\n`
    }
    if ((effect.selfbleed || 0) < -2 && this.player.bleed > -effect.selfbleed) {
      const effectBonus = Math.round(this.player.bleed * 2)
      this.singleBonus += effectBonus
      bonusMessage += `关键治疗！获得${effectBonus}点分数!\n`
    }
    if ((effect.stun || effect.weakStun && this.ai.shield === 0) && this.ai.status === playerStatus.Normal && this.ai.bleed > 5) {
      const effectBonus = Math.round(this.ai.bleed * 2)
      this.singleBonus += effectBonus
      bonusMessage += `流血眩晕！获得${effectBonus}点分数!\n`
    }
    if ((effect.strengthChange || 0) < -1 && this.ai.strength < 0) {
      const effectBonus = Math.round(effect.strengthChange * -5)
      this.singleBonus += effectBonus
      bonusMessage += `强效削弱！获得${effectBonus}点分数!\n`
    }
    if (this.ai.counterAttack > 0 && !effect.damage && !effect.pierceDamage) {
      const effectBonus = Math.round(this.ai.counterAttack)
      this.singleBonus += effectBonus
      bonusMessage += `反击规避！获得${effectBonus}点分数!\n`
    }
    if (this.player.hp < 10 && !this.player.shield && (effect.damage || effect.pierceDamage)) {
      const effectBonus = (10 - this.player.hp) * 2
      this.singleBonus += effectBonus
      bonusMessage += `濒死反击！获得${effectBonus}点分数!\n`
    }
    if (effect.revwersalOfStrength && this.player.strength <= this.ai.strength - 5) {
      const effectBonus = Math.min((this.ai.strength - this.player.strength) * 3, 100)
      this.singleBonus += effectBonus
      bonusMessage += `逆转大局！获得${effectBonus}点分数!\n`
    }
    if ((effect.damage || 0) + (effect.pierceDamage || 0) >= 10 && this.ai.vulnerablility > 0) {
      const effectBonus = this.ai.vulnerablility * 0.1
      this.singleBonusMultiplier += effectBonus
      bonusMessage += `易伤打击！本回合分数增加${100 * effectBonus}%!\n`
    }
    if (this.turnCount === 4 + Math.round(this.level / 3) && this.player.hp > this.ai.hp * 1.2 &&
        this.player.shield > this.ai.shield && this.player.strength > this.ai.strength && this.player.bleed < this.ai.bleed) {
      const effectBonus = Math.round(this.player.hp * 0.1 + this.player.shield + this.player.strength * 0.5)
      this.singleBonus += effectBonus
      this.singleBonusMultiplier *= 2
      bonusMessage += `压倒性的优势！获得${effectBonus}点分数！本回合分数*2！\n`
    }
    if (effect.magnificentEnd && this.ai.bleed > 1) {
      const effectBonus = Math.round(this.ai.bleed * 1.5)
      this.singleBonusMultiplier *= effectBonus
      this.bonus *= 2
      bonusMessage += `华丽收场！当前总分数*2，本回合分数*${effectBonus}!\n`
    }

    if (this.comboCombos >= 1) {
      this.singleBonusMultiplier += (this.comboCombos / 5)
      bonusMessage += `组合技连击${this.comboCombos}次！本回合分数+${20 * this.comboCombos}%！`
    }
    return bonusMessage
  }

  private processAiTurn(handA: number, handB: number): string {
    if (this.ai.hp <= 0) return `已经结束游戏\n\n` + this.buildAiTurnBonusMessage(SKILL_MAP['-1'])
    if (this.ai.status === playerStatus.lastStunned) {
      this.ai.status = playerStatus.Normal
    }
    if (this.ai.status === playerStatus.Stunned) {
      this.ai.status = playerStatus.lastStunned
      this.applyEffect(this.ai, this.player, SKILL_MAP['-1'], false)
      return "被眩晕，跳过回合，本回合分数奖励继承到下一回合" + this.buildResultMessage(SKILL_MAP['-1'], false, this.ai, this.player)
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
    const bonusMessage = this.buildAiTurnBonusMessage(effect)
    this.applyEffect(this.ai, this.player, effect, !!combo)

    return handA + '碰' + handB + '，' + this.buildResultMessage(effect, isCombo, this.ai, this.player) + (bonusMessage ? `\n\n${bonusMessage}` : '')
  }

  private buildAiTurnBonusMessage(effect: SkillEffect): string {
    let bonusMessage = ''
    if ((effect.damage || effect.pierceDamage) && this.player.counterAttack > 0) {
      const effectBonus = Math.max(this.player.counterAttack + this.player.strength, 0)
      this.singleBonus += effectBonus
      bonusMessage += `反击！获得${effectBonus}点分数!\n`
    }
    if ((effect.damage || 0) > 12 && this.player.shield > 0) {
      const effectBonus = Math.round(effect.damage)
      this.singleBonus += effectBonus
      bonusMessage += `关键格挡！获得${effectBonus}点分数!\n`
    }
    if (this.player.shield > 0 && effect.damage && this.player.counterAttack > 0) {
      const effectBonus = Math.round(this.player.shield * 2 + this.player.counterAttack)
      this.singleBonus += effectBonus
      bonusMessage += `盾反！获得${effectBonus}点分数!\n`
    }
    if (effect.damage && this.player.vulnerablility > 0 && this.player.shield > 0) {
      const effectBonus = 0.5
      this.singleBonusMultiplier += effectBonus
      bonusMessage += `易伤保护！本回合分数增加${100 * (effectBonus)}%!\n`
    }
    if (effect.weakStun && this.player.shield > 0) {
      const effectBonus = 0.3
      this.singleBonusMultiplier += effectBonus
      bonusMessage += `眩晕格挡！本回合分数增加${100 * (effectBonus)}%!\n`
    }
    const turnBonus = Math.round(this.singleBonus * this.singleBonusMultiplier)
    this.bonus += turnBonus
    bonusMessage += `本回合总计获得${this.singleBonus}*${this.singleBonusMultiplier}=${turnBonus}点分数\n当前总分数：${this.bonus}`
    this.singleBonus = 0
    this.singleBonusMultiplier = 1
    return bonusMessage
  }

  // damage?: number // 普通伤害
  // damageTimes?: number // 伤害次数
  // pierceDamage?: number // 穿刺伤害
  // bleed?: number // 流血
  // stun?: boolean // 眩晕
  // destroyShield?: number // 破坏护盾
  // weakStun?: boolean // 弱眩晕
  // strengthChange?: number // 力量变化
  // heal?: number // 治疗
  // shield?: number // 护盾
  // selfbleed?: number // 自身流血
  // selfStun?: boolean // 自身眩晕
  // selfstrengthChange?: number // 自身力量变化
  private applyEffect(self: PlayerState, enemy: PlayerState, effect: SkillEffect, isCombo: boolean) {
    return applySkillEffect(self, enemy, effect, isCombo)
  }

  private checkCombo(a: number, b: number): SkillEffect | null {
    return resolveCombo(a, b)
  }

  private buildResultMessage(effect: SkillEffect, isCombo: boolean, self: PlayerState, enemy: PlayerState): string {
    return buildEffectMessage(effect, isCombo, self, enemy)
  }

  private aiSearchEntrance() {
    let bestScore = -Infinity;
    let bestMove: [number, number] = [0, 0];

    const possibleMoves = this.generatePossibleMoves(this.ai, this.player);
    for (const move of possibleMoves) {
      // 克隆当前状态
      const simulatedState: [PlayerState, PlayerState] = [
        this.cloneState(this.player),
        this.cloneState(this.ai)
      ];

      const newState = this.simulateMove(move, simulatedState, 1);

      // 根据难度设置搜索深度
      const score = this.aiSearch(
        Math.round(this.level / 2),
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
    if (this.turnCount > 5)
      this.session.sendQueued(this.generateChat(bestScore), 1000)
    this.lastScore = bestScore
    return bestMove;
  }

  private aiSearch(depth: number, isMaximizing: boolean, currentState: [PlayerState, PlayerState], alpha: number, beta: number): number {
    // 终止条件：达到最大深度或游戏结束
    if (depth === 0 || currentState[0].hp <= 0 || currentState[1].hp <= 0) {
      // isMaximizing 表示该节点轮到 AI；叶节点的行动方是另一方
      return evaluatePosition(currentState, 1, this.level, ONETOUCH_WEIGHTS, isMaximizing ? 1 : 0)
    }

    const possibleMoves = this.generatePossibleMoves(currentState[isMaximizing ? 1 : 0], currentState[isMaximizing ? 0 : 1]);
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
  private generatePossibleMoves(attacker: PlayerState, defender: PlayerState): [number, number][] {
    let moves: [number, number][] = [];

    // 可触碰对方左右手（0: 左，1: 右）
    for (const targetHand of [0, 1]) {
      // 己方左右手均可选择
      moves.push([attacker.left, defender[targetHand ? 'right' : 'left']]);
      moves.push([attacker.right, defender[targetHand ? 'right' : 'left']]);
    }
    return moves
  }

  // 克隆玩家状态
  private cloneState(state: PlayerState): PlayerState {
    return {
      left: state.left,
      right: state.right,
      hp: state.hp,
      shield: state.shield,
      strength: state.strength,
      bleed: state.bleed,
      counterAttack: state.counterAttack,
      vulnerablility: state.vulnerablility,
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
      this.applyEffect(attacker, defender, SKILL_MAP['-1'], false)
    } else {
      const sum = (handA + handB) % 10
      attacker[handA === attacker.left ? 'left' : 'right'] = sum
      const combo = this.checkCombo(attacker.left, attacker.right)
      const effect = combo ? combo : SKILL_MAP[sum.toString()] || {};
      this.applyEffect(attacker, defender, effect, !!combo)
    }

    if (attackerIndex === 1) {
      const temp = attacker
      attacker = defender
      defender = temp
    }
    const result: [PlayerState, PlayerState] = [attacker, defender]
    return result
  }

  // 局面评估统一走 oneTouchEngine.evaluatePosition：
  // 特征包含血量/力量/护盾/流血/眩晕/反击/易伤，以及双方本回合的
  // 一步战术（最好血量交换、能否直接击杀、组合技收益）和手牌组合技就绪。
  // 权重由 scripts/train-onetouch.ts 训练，见 oneTouchWeights.ts。


  private generateChat(Score: number): string {
    // 评估分已归一化为「总血量的比例」，10 点血量约等于 10 / 总血量
    if (this.lastScore < 90000 && Score > 90000) {
      return '我觉得你要输了哦~'
    }
    if (this.lastScore < 0 && Score > 0 && Math.random() > 0.5) {
      return '局势发生变化了呢~'
    }
    if (Score - this.lastScore > 10 / (this.baseHP + this.level * this.aiLevelHp) && Math.random() > 0.8)
      return '看招！'
  }

  private instuction = `游戏说明：
  这个游戏的基本玩法是：
  两个人玩，两只手分别可以做出"一到十"的手势，每一种手势代表一个招式。
  例如"三"是${SKILL_MAP['3'].name}，"四"是${SKILL_MAP['4'].name}等；当两只手符合特定组合时还可以触发组合技；
  每个人在自己的回合可以选择用自己的一只手碰对方的另一只手，两者数值相加，如果超过十仅保留个位。
  例如自己的"一"碰对方的"二"变成"三"同时触发技能"${SKILL_MAP['3'].name}"对对方造成伤害。
  每次开局两人初始手势随机，由玩家先手，双方轮流行动。
  当自身两手手势相同时，无论选择左手还是右手最终发生变化的都是左手。
  玩家初始有"${this.baseHP} + ${this.playerLevelHP} * 难度"血量。
  ai初始有"${this.baseHP} + ${this.aiLevelHp} * 难度"血量。
  玩家初始有"6 - 难度 / 2"护盾，四舍五入取整。
  血量没有上限，率先将对方血量减到零的人获胜：

  游戏名称说明：
  流血效果：每次到自己回合结束时，收到流血层数点伤害，不可被护盾阻挡，然后流血层数减1;
  护盾效果：每一层护盾可阻挡下一次受到的普通伤害，如果伤害来源是组合技则消耗两层护盾(若仅有一层则消耗一层)。护盾上限为五层。
  眩晕效果：跳过自己的下一个回合，若上回合已经被眩晕，则本回合不受眩晕影响（即不可被连续眩晕）
  弱眩晕效果：若对方没有护盾，则眩晕对方一回合
  反击：下一回合若对方行动中有攻击，则对方攻击前受到反击层数点穿刺伤害，此效果受力量加成，且仅持续一回合
  穿刺伤害：不被护盾影响的伤害（不会消耗护盾）
  力量效果：每有一点力量，每次造成的伤害+1，若为负数则减一
  易伤效果：受到的普通伤害+50%，自己的回合结束时减少一层
  组合技：在触碰完成后，若你的两只手手势符合组合技条件，则触发组合技，组合技的效果会覆盖普通技能的效果，组合无序
  bonus: 当行动导致关键效果时，获得额外奖励，在ai回合结束时结算，若ai被眩晕则奖励继承到下一回合
  `

  private skillList = ONE_TOUCH_SKILL_LIST
}

export const ONE_TOUCH_SKILL_LIST = `
  具体的技能设计如下：
  一：${SKILL_MAP['1'].name}：造成${SKILL_MAP['1'].pierceDamage}穿刺伤害，${SKILL_MAP['1'].bleed}流血;
  二：${SKILL_MAP['2'].name}：造成${SKILL_MAP['2'].pierceDamage}穿刺伤害，眩晕对方；
  三：${SKILL_MAP['3'].name}：造成${SKILL_MAP['3'].damage}伤害，获得${SKILL_MAP['3'].counterAttack}层反击；
  四：${SKILL_MAP['4'].name}：获得${SKILL_MAP['4'].shield}层护盾；
  五：${SKILL_MAP['5'].name}：造成${SKILL_MAP['5'].damage}伤害，弱眩晕对方；
  六：${SKILL_MAP['6'].name}：恢复${SKILL_MAP['6'].heal}生命，若有流血则自身${SKILL_MAP['6'].selfbleed}流血；
  七：${SKILL_MAP['7'].name}：造成${SKILL_MAP['7'].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP['7'].destroyShield}层护盾；
  八：${SKILL_MAP['8'].name}：造成${SKILL_MAP['8'].damage}伤害，眩晕自己；
  九：${SKILL_MAP['9'].name}：造成${SKILL_MAP['9'].pierceDamage}穿刺伤害，${SKILL_MAP['9'].bleed}流血，对方${SKILL_MAP['9'].strengthChange}力量；
  十：${SKILL_MAP['0'].name}：增加自身${SKILL_MAP['0'].selfstrengthChange}力量；
  组合技：
  一+八：${SKILL_MAP['1+8'].name}：对对方造成${SKILL_MAP['1+8'].damage}伤害，${SKILL_MAP['1+8'].bleed}流血，眩晕自己
  五+五：${SKILL_MAP['5+5'].name}：对对方造成${SKILL_MAP['5+5'].damage}伤害，眩晕对方
  五+十：${SKILL_MAP['0+5'].name}：自身增加${SKILL_MAP['0+5'].selfstrengthChange}力量，左手数值增加${SKILL_MAP['0+5'].addSelfLeft}，右手数值增加${SKILL_MAP['0+5'].addSelfRight}
  六+六：${SKILL_MAP['6+6'].name}：恢复${SKILL_MAP['6+6'].heal}生命，增加自身${SKILL_MAP['6+6'].selfstrengthChange}力量，自身${SKILL_MAP['6+6'].selfbleed}流血
  五+六：${SKILL_MAP['5+6'].name}：恢复${SKILL_MAP['5+6'].heal}生命，自身${SKILL_MAP['5+6'].selfbleed}流血
  一+九：${SKILL_MAP['1+9'].name}：对对方造成${SKILL_MAP['1+9'].pierceDamage}穿刺伤害，${SKILL_MAP['1+9'].bleed}流血，对方${SKILL_MAP['1+9'].strengthChange}力量
  四+四：${SKILL_MAP['4+4'].name}：获得${SKILL_MAP['4+4'].shield}层护盾，恢复${SKILL_MAP['4+4'].heal}生命
  四+六：${SKILL_MAP['4+6'].name}：获得${SKILL_MAP['4+6'].shield}层护盾，自身${SKILL_MAP['4+6'].selfbleed}流血，恢复${SKILL_MAP['4+6'].heal}生命
  八+八：${SKILL_MAP['8+8'].name}：造成${SKILL_MAP['8+8'].damage}伤害${SKILL_MAP['8+8'].damageTimes}次，眩晕自己
  一+二：${SKILL_MAP['1+2'].name}：给于对方${SKILL_MAP['1+2'].vulnerablility}易伤，造成${SKILL_MAP['1+2'].pierceDamage}穿刺伤害，眩晕对方
  二+八：${SKILL_MAP['2+8'].name}：造成${SKILL_MAP['2+8'].damage}伤害，对方左手数值增加${SKILL_MAP['2+8'].addLeft}，右手数值增加${SKILL_MAP['2+8'].addRight}，眩晕对方，眩晕自己
  三+四：${SKILL_MAP['3+4'].name}：获得${SKILL_MAP['3+4'].shield}层护盾，获得${SKILL_MAP['3+4'].counterAttack}层反击。
  七+七：${SKILL_MAP['7+7'].name}：造成${SKILL_MAP['7+7'].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP['7+7'].destroyShield}层护盾
  七+八：${SKILL_MAP['7+8'].name}：造成${SKILL_MAP['7+8'].pierceDamage}穿刺伤害，破坏对方${SKILL_MAP['7+8'].destroyShield}层护盾，眩晕自己
  六+二：${SKILL_MAP['2+6'].name}：造成${SKILL_MAP['2+6'].damage}伤害，恢复${SKILL_MAP['2+6'].heal}生命，自身${SKILL_MAP['2+6'].selfbleed}流血，自身增加${SKILL_MAP['2+6'].selfstrengthChange}力量，眩晕对方
  三+七：${SKILL_MAP['3+7'].name}：获得${SKILL_MAP['3+7'].counterAttack}层反击，破坏对方${SKILL_MAP['3+7'].destroyShield}层护盾，对方左手数值增加${SKILL_MAP['3+7'].addLeft}，右手数值增加${SKILL_MAP['3+7'].addRight}
  九+十：${SKILL_MAP['0+9'].name}：逆转双方力量，然后增加自身${SKILL_MAP['0+9'].selfstrengthChange}力量，对方${SKILL_MAP['0+9'].strengthChange}力量
  十+十：${SKILL_MAP['0+0'].name}：对对方造成${SKILL_MAP['0+0'].bleed}流血，自身${SKILL_MAP['0+0'].selfstrengthChange}力量，然后立即结算对方全部流血
  `

// ——— 以下为对战模式复用的规则核心 ———

export function resolveCombo(a: number, b: number): SkillEffect | null {
  const key = `${Math.min(a, b)}+${Math.max(a, b)}`
  return SKILL_MAP[key] || null
}

export function applySkillEffect(self: PlayerState, enemy: PlayerState, effect: SkillEffect, isCombo: boolean) {
  // 处理力量反转
  if (effect.revwersalOfStrength) {
    const temp = self.strength
    self.strength = enemy.strength
    enemy.strength = temp
  }

  // 处理基础属性
  if (effect.pierceDamage) enemy.hp -= Math.max(effect.pierceDamage + (self.strength || 0), 0)
  if (effect.destroyShield) enemy.shield = Math.max(0, enemy.shield - effect.destroyShield)
  if (effect.bleed) enemy.bleed += effect.bleed
  if (effect.strengthChange) enemy.strength = enemy.strength + effect.strengthChange
  if (effect.addLeft) enemy.left = (enemy.left + effect.addLeft) % 10
  if (effect.addRight) enemy.right = (enemy.right + effect.addRight) % 10
  if (effect.vulnerablility) enemy.vulnerablility = (enemy.vulnerablility || 0) + effect.vulnerablility

  if (effect.heal) self.hp += effect.heal
  if (effect.shield) self.shield = Math.min(self.shield + effect.shield, 5)
  if (effect.selfstrengthChange) self.strength = self.strength + effect.selfstrengthChange
  if (effect.addSelfLeft) self.left = (self.left + effect.addSelfLeft) % 10
  if (effect.addSelfRight) self.right = (self.right + effect.addSelfRight) % 10

  // 处理伤害
  if (effect.damage) {
    effect.damageTimes = effect.damageTimes || 1
    for (let i = 0; i < effect.damageTimes; i++) {
      const blocked = enemy.shield > 0
      enemy.shield = Math.max(0, enemy.shield - (isCombo ? 2 : 1))
      if (!blocked) {
        enemy.hp -= Math.round(Math.max(0, effect.damage + (self.strength || 0)) * (enemy.vulnerablility ? 1.5 : 1))
        if (effect.weakStun && enemy.status !== playerStatus.lastStunned) {
          enemy.status = playerStatus.Stunned
        }
      }
    }
  }

  // 处理反击
  if (self.counterAttack) self.counterAttack = 0
  if (effect.counterAttack) self.counterAttack = effect.counterAttack
  if (enemy.counterAttack > 0 && (effect.damage > 0 || effect.pierceDamage > 0))
    self.hp -= Math.max(enemy.counterAttack + (enemy.strength || 0), 0)

  // 处理流血
  if (effect.selfbleed) self.bleed += effect.selfbleed
  if (self.bleed > 0) self.hp -= self.bleed
  self.bleed = Math.max(0, self.bleed - 1)

  // 处理华丽收场
  if (effect.magnificentEnd) {
    enemy.hp -= enemy.bleed * (enemy.bleed + 1) / 2
    enemy.bleed = 0
  }

  // 处理易伤
  if (self.vulnerablility) self.vulnerablility = Math.max(0, self.vulnerablility - 1)

  // 处理眩晕
  if (effect.stun && enemy.status !== playerStatus.lastStunned)
    enemy.status = playerStatus.Stunned
  if (effect.selfStun && self.status !== playerStatus.lastStunned)
    self.status = playerStatus.Stunned
}

export function buildEffectMessage(effect: SkillEffect, isCombo: boolean, self: PlayerState, enemy: PlayerState): string {
  let msg = []
  if (effect.name) msg.push(`${effect.name}!`)
  if (effect.revwersalOfStrength) msg.push(`双方力量反转！`)
  if (effect.pierceDamage) msg.push(`对对方造成穿刺伤害${Math.max(0, effect.pierceDamage + (self.strength || 0))}`)
  if (effect.damage) msg.push(`对对方造成${Math.round(Math.max(0, effect.damage + (self.strength || 0)) * (enemy.vulnerablility ? 1.5 : 1))}伤害`)
  if (effect.damageTimes) msg.push(`${effect.damageTimes}次`)
  if (effect.heal) msg.push(`自身恢复${effect.heal}生命`)
  if (effect.selfbleed) msg.push(`自身流血${effect.selfbleed > 0 ? '增加' : '减少'}${Math.abs(effect.selfbleed)}`)
  if (effect.bleed) msg.push(`对方叠加${effect.bleed}层流血`)
  if (effect.shield) msg.push(`自身获得${effect.shield}层护盾`)
  if (effect.destroyShield) msg.push(`破坏对方${effect.destroyShield}层护盾`)
  if (effect.vulnerablility) msg.push(`给予对方易伤${effect.vulnerablility}层`)
  if (effect.strengthChange) msg.push(`对方力量${effect.strengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.strengthChange)}`)
  if (effect.selfstrengthChange) msg.push(`自身力量${effect.selfstrengthChange > 0 ? '增加' : '减少'}${Math.abs(effect.selfstrengthChange)}`)
  if (effect.counterAttack) msg.push(`获得${effect.counterAttack}层反击`)
  if (effect.addSelfLeft) msg.push(`自身左手增加${effect.addSelfLeft}`)
  if (effect.addSelfRight) msg.push(`自身右手增加${effect.addSelfRight}`)
  if (effect.addLeft) msg.push(`对方左手增加${effect.addLeft}`)
  if (effect.addRight) msg.push(`对方右手增加${effect.addRight}`)
  if (effect.magnificentEnd) msg.push(`结算对方所有流血`)
  if (enemy.status !== playerStatus.lastStunned) {
    if (effect.stun) msg.push(`眩晕对方`)
    if (effect.weakStun && enemy.shield === 0) msg.push(`弱眩晕对方`)
  }
  if (effect.selfStun) msg.push(`眩晕自己`)
  if (enemy.counterAttack > 0 && (effect.damage > 0 || effect.pierceDamage > 0)) msg.push(`被反击${enemy.counterAttack + (enemy.strength || 0)}穿刺伤害`)
  if (self.bleed > 0) msg.push(`自身受到流血伤害${self.bleed + 1}`)
  if (isCombo) msg.unshift('触发组合技！\n')
  return msg.join(' ')
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
        session.send('未输入难度等级(2-10)，默认设为3')
      }, 500);
      level = 3
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


import { puppeteer } from '.'
export async function wrapInHTML(str: string): Promise<string> {
  if (!puppeteer) {
    logger.warn('puppeteer未就绪')
    return '出现错误，请联系管理员'
  }
  // 对局内容可能包含昵称等玩家输入，转义后再交给 puppeteer
  const escaped = str
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll(/\n/g, '<BR>')
  return puppeteer.render(`<html><body>${escaped}</body>
          <style>
          body {
            padding: 10px;
            display: inline-block;
           }
          </style>
          </html>`);
}

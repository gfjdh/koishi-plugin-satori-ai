/**
 * 一碰一（OneTouch）的纯规则引擎（暂未使用）。
 *
 * 这里只放不依赖 koishi / puppeteer 的逻辑：状态、技能结算、动作模拟、
 * 局面评估。线上游戏（gameOneTouch.ts）与离线训练脚本共用同一份实现，
 * 避免出现「训练时一套规则、线上另一套规则」。
 */

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

export function cloneState(state: PlayerState): PlayerState {
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
  }
}

// 生成所有合法动作（己方左手/右手触碰对方左手/右手）
export function generatePossibleMoves(attacker: PlayerState, defender: PlayerState): [number, number][] {
  const moves: [number, number][] = []
  for (const targetHand of [0, 1]) {
    moves.push([attacker.left, defender[targetHand ? 'right' : 'left']])
    moves.push([attacker.right, defender[targetHand ? 'right' : 'left']])
  }
  return moves
}

/**
 * 执行一步动作，返回新状态（[玩家0, 玩家1] 顺序不变，入参不会被修改）。
 *
 * 与 processPlayerTurn / processAiTurn / simulateMove 保持同一套结算顺序。
 */
export function stepState(
  state: [PlayerState, PlayerState],
  move: [number, number],
  actorIndex: 0 | 1,
): [PlayerState, PlayerState] {
  const next: [PlayerState, PlayerState] = [cloneState(state[0]), cloneState(state[1])]
  const attacker = next[actorIndex]
  const defender = next[1 - actorIndex]

  if (attacker.status === playerStatus.lastStunned) attacker.status = playerStatus.Normal
  if (attacker.status === playerStatus.Stunned) {
    attacker.status = playerStatus.lastStunned
    applySkillEffect(attacker, defender, SKILL_MAP['-1'], false)
  } else {
    const [handA, handB] = move
    const sum = (handA + handB) % 10
    attacker[handA === attacker.left ? 'left' : 'right'] = sum
    const combo = resolveCombo(attacker.left, attacker.right)
    const effect = combo ? combo : SKILL_MAP[sum.toString()] || {}
    applySkillEffect(attacker, defender, effect, !!combo)
  }

  return next
}

// ——— 局面评估 ———
//
// 评估函数是可离线训练的线性模型： score = w · φ(state)
// φ 为固定特征向量，w 由 scripts/train-onetouch.ts 自对弈训练得到。
// 未训练时回退到手调权重（handcraftedWeights），行为与旧版评估基本一致。

export const BASE_HP = 40
export const HP_PER_LEVEL = 10
export const TERMINAL_SCORE = 1e6

export function totalHp(level: number) {
  return BASE_HP + HP_PER_LEVEL * level
}

export const FEATURE = {
  HP_DIFF: 0,
  SELF_LOW_HALF: 1,
  SELF_LOW_QUARTER: 2,
  SELF_LOW_EIGHTH: 3,
  OPP_LOW_HALF: 4,
  OPP_LOW_QUARTER: 5,
  OPP_LOW_EIGHTH: 6,
  SELF_STRENGTH: 7,
  OPP_STRENGTH: 8,
  SELF_SHIELD: 9,
  OPP_SHIELD: 10,
  SELF_BLEED_SQ: 11,
  OPP_BLEED_SQ: 12,
  SELF_STUN: 13,
  OPP_STUN: 14,
  SELF_COUNTER: 15,
  OPP_COUNTER: 16,
  SELF_VULN: 17,
  OPP_VULN: 18,
  SELF_LEFT: 19, // 19..28 十维 one-hot
  SELF_RIGHT: 29, // 29..38
  OPP_LEFT: 39, // 39..48
  OPP_RIGHT: 49, // 49..58
  SELF_COMBO_READY: 59,
  OPP_COMBO_READY: 60,
  BIAS: 61,
  TEMPO: 62, // 是否轮到我方行动（叶节点深度固定时是常数，训练时需要它分离先后手）
} as const

export const FEATURE_COUNT = 63

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}

function handIndex(value: number) {
  const n = Math.round(value) % 10
  return n < 0 ? n + 10 : n
}

/** 当前手牌是否能在本回合直接凑出组合技 */
export function canTriggerCombo(self: PlayerState, opp: PlayerState): boolean {
  const own = [self.left, self.right]
  const targets = [opp.left, opp.right]
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const sum = (own[i] + targets[j]) % 10
      // 与结算逻辑一致：左手值等于自身左手时写入左手（两手相同时总是写左手）
      const writeLeft = own[i] === self.left
      const other = writeLeft ? self.right : self.left
      if (resolveCombo(sum, other)) return true
    }
  }
  return false
}

function bleedFeature(bleed: number | undefined) {
  const value = clamp(bleed || 0, 0, 20)
  return value * value / 100
}

/**
 * 将局面写成特征向量。perspective 为「我方」下标（0 或 1）。
 * 线上 AI 固定是 1，训练脚本两侧都会用到。
 */
export function writeFeatures(
  state: [PlayerState, PlayerState],
  perspective: 0 | 1,
  out: Float64Array | number[],
  level: number,
  toMove?: 0 | 1,
) {
  out.fill(0)
  const self = state[perspective]
  const opp = state[1 - perspective]
  const H = totalHp(level)

  out[FEATURE.HP_DIFF] = (self.hp - opp.hp) / H

  // 低血量阈值特征与原手调评估一致：跨过阈值就整体扣分
  out[FEATURE.SELF_LOW_HALF] = self.hp < H / 2 ? 1 : 0
  out[FEATURE.SELF_LOW_QUARTER] = self.hp < H / 4 ? 1 : 0
  out[FEATURE.SELF_LOW_EIGHTH] = self.hp < H / 8 ? 1 : 0
  out[FEATURE.OPP_LOW_HALF] = opp.hp < H / 2 ? 1 : 0
  out[FEATURE.OPP_LOW_QUARTER] = opp.hp < H / 4 ? 1 : 0
  out[FEATURE.OPP_LOW_EIGHTH] = opp.hp < H / 8 ? 1 : 0

  out[FEATURE.SELF_STRENGTH] = clamp(self.strength || 0, -20, 20) / 20
  out[FEATURE.OPP_STRENGTH] = clamp(opp.strength || 0, -20, 20) / 20
  out[FEATURE.SELF_SHIELD] = clamp(self.shield || 0, 0, 5) / 5
  out[FEATURE.OPP_SHIELD] = clamp(opp.shield || 0, 0, 5) / 5
  out[FEATURE.SELF_BLEED_SQ] = bleedFeature(self.bleed)
  out[FEATURE.OPP_BLEED_SQ] = bleedFeature(opp.bleed)

  out[FEATURE.SELF_STUN] = self.status === playerStatus.Stunned ? 1 : 0
  out[FEATURE.OPP_STUN] = opp.status === playerStatus.Stunned ? 1 : 0

  out[FEATURE.SELF_COUNTER] = clamp((self.counterAttack || 0) + (self.strength || 0), 0, 20) / 20
  out[FEATURE.OPP_COUNTER] = clamp((opp.counterAttack || 0) + (opp.strength || 0), 0, 20) / 20

  out[FEATURE.SELF_VULN] = clamp(self.vulnerablility || 0, 0, 5) / 5
  out[FEATURE.OPP_VULN] = clamp(opp.vulnerablility || 0, 0, 5) / 5

  out[FEATURE.SELF_LEFT + handIndex(self.left)] = 1
  out[FEATURE.SELF_RIGHT + handIndex(self.right)] = 1
  out[FEATURE.OPP_LEFT + handIndex(opp.left)] = 1
  out[FEATURE.OPP_RIGHT + handIndex(opp.right)] = 1

  out[FEATURE.SELF_COMBO_READY] = canTriggerCombo(self, opp) ? 1 : 0
  out[FEATURE.OPP_COMBO_READY] = canTriggerCombo(opp, self) ? 1 : 0
  out[FEATURE.BIAS] = 1
  out[FEATURE.TEMPO] = toMove === perspective ? 1 : 0
}

export function featureScore(features: Float64Array | number[], weights: ArrayLike<number>) {
  let score = 0
  for (let i = 0; i < FEATURE_COUNT; i++) score += weights[i] * features[i]
  return score
}

const featureScratch = new Float64Array(FEATURE_COUNT)

/**
 * 从 perspective 视角评估局面。终局直接返回极值，与权重无关。
 */
export function evaluatePosition(
  state: [PlayerState, PlayerState],
  perspective: 0 | 1,
  level: number,
  weights: ArrayLike<number>,
  toMove?: 0 | 1,
): number {
  if (state[perspective].hp <= 0) return -TERMINAL_SCORE
  if (state[1 - perspective].hp <= 0) return TERMINAL_SCORE
  writeFeatures(state, perspective, featureScratch, level, toMove)
  return featureScore(featureScratch, weights)
}

/**
 * 旧版手调评估在特征空间中的等价权重（以 5 级、总血量 90 为参照）。
 * 用作训练起点和未训练时的回退。
 */
export function handcraftedWeights(): number[] {
  const w = new Array(FEATURE_COUNT).fill(0)
  const scale = totalHp(5) // 90
  w[FEATURE.HP_DIFF] = 1
  w[FEATURE.SELF_LOW_HALF] = -0.25
  w[FEATURE.SELF_LOW_QUARTER] = -0.25
  w[FEATURE.SELF_LOW_EIGHTH] = -0.25
  w[FEATURE.OPP_LOW_HALF] = 0.25
  w[FEATURE.OPP_LOW_QUARTER] = 0.25
  w[FEATURE.OPP_LOW_EIGHTH] = 0.25
  w[FEATURE.SELF_STRENGTH] = 100 / scale
  w[FEATURE.OPP_STRENGTH] = -100 / scale
  w[FEATURE.SELF_SHIELD] = 40 / scale
  w[FEATURE.OPP_SHIELD] = -40 / scale
  w[FEATURE.SELF_BLEED_SQ] = -40 / scale
  w[FEATURE.OPP_BLEED_SQ] = 40 / scale
  w[FEATURE.SELF_STUN] = -10 / scale
  w[FEATURE.OPP_STUN] = 10 / scale
  w[FEATURE.SELF_COUNTER] = 20 / scale
  w[FEATURE.OPP_COUNTER] = -20 / scale
  w[FEATURE.SELF_VULN] = -20 / scale
  w[FEATURE.OPP_VULN] = 20 / scale
  return w
}

export function isValidWeights(weights: unknown): weights is number[] {
  return Array.isArray(weights)
    && weights.length === FEATURE_COUNT
    && weights.every((value) => typeof value === 'number' && Number.isFinite(value))
}

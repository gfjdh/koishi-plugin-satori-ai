/**
 * 训练前诊断：线性特征 + handcraftedWeights 能否复现旧版手调评估？
 *
 * 运行（在 external/satori-ai 目录）：
 *   ../../node_modules/.bin/tsx scripts/diag-onetouch.ts
 */

import {
  PlayerState,
  playerStatus,
  generatePossibleMoves,
  stepState,
  writeFeatures,
  featureScore,
  FEATURE_COUNT,
  handcraftedWeights,
  totalHp,
} from '../src/oneTouchEngine'

type StatePair = [PlayerState, PlayerState]

let seed = 12345
function rng() {
  seed = (seed + 0x6d2b79f5) >>> 0
  let t = seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function randomHand() {
  return 1 + Math.floor(rng() * 9)
}

function newGame(level: number): StatePair {
  const hp = totalHp(level)
  const base = (): PlayerState => ({
    left: randomHand(), right: randomHand(), hp, shield: 0, strength: 0,
    bleed: 0, counterAttack: 0, vulnerablility: 0, status: playerStatus.Normal,
  })
  const player = base()
  player.shield = Math.round(6 - level / 2)
  return [player, base()]
}

// 旧版 evaluateState 的逐行复刻
function oldEval(state: StatePair, level: number) {
  const ai = state[1]
  const player = state[0]
  const aiBaseHP = 40 + level * 10
  const playerBaseHP = 40 + level * 10
  let score = (ai.hp - player.hp)
  if (ai.hp < aiBaseHP / 2) score -= Math.round(aiBaseHP / 4)
  if (player.hp < playerBaseHP / 2) score += Math.round(playerBaseHP / 4)
  if (ai.hp < aiBaseHP / 4) score -= Math.round(aiBaseHP / 4)
  if (player.hp < playerBaseHP / 4) score += Math.round(playerBaseHP / 4)
  if (ai.hp < aiBaseHP / 8) score -= Math.round(aiBaseHP / 4)
  if (player.hp < playerBaseHP / 8) score += Math.round(playerBaseHP / 4)
  score += Math.min(ai.strength * 5, 100)
  score -= Math.max(player.strength * 5, -100)
  score += ai.shield * 8
  score -= player.shield * 8
  score -= Math.min(Math.round(ai.bleed * ai.bleed / 2.5))
  score += Math.min(Math.round(player.bleed * player.bleed / 2.5))
  if (ai.status === playerStatus.Stunned) score -= 10
  if (player.status === playerStatus.Stunned) score += 10
  if (ai.counterAttack > 0) score += Math.max(ai.counterAttack + (ai.strength || 0), 0)
  if (player.counterAttack > 0) score -= Math.max(player.counterAttack + (player.strength || 0), 0)
  if (ai.vulnerablility > 0) score -= Math.round(ai.vulnerablility * 4)
  if (player.vulnerablility > 0) score += Math.round(player.vulnerablility * 4)
  if (player.hp <= 0) score += 100000
  if (ai.hp <= 0) score -= 1000000
  return score
}

function randomPlayState(level: number, plies: number): StatePair {
  let state = newGame(level)
  for (let i = 0; i < plies; i++) {
    const actor = (i % 2) as 0 | 1
    if (state[0].hp <= 0 || state[1].hp <= 0) break
    const moves = generatePossibleMoves(state[actor], state[1 - actor])
    state = stepState(state, moves[Math.floor(rng() * moves.length)], actor)
  }
  return state
}

const weights = handcraftedWeights()
const phi = new Float64Array(FEATURE_COUNT)
const samples: { old: number; lin: number }[] = []

for (let i = 0; i < 5000; i++) {
  const level = 2 + Math.floor(rng() * 9)
  const state = randomPlayState(level, 2 + Math.floor(rng() * 40))
  if (state[0].hp <= 0 || state[1].hp <= 0) continue
  writeFeatures(state, 1, phi, level, 0)
  samples.push({ old: oldEval(state, level), lin: featureScore(phi, weights) })
}

const n = samples.length
const meanOld = samples.reduce((s, v) => s + v.old, 0) / n
const meanLin = samples.reduce((s, v) => s + v.lin, 0) / n
let cov = 0, varOld = 0, varLin = 0, mse = 0, maxDiff = 0
for (const { old, lin } of samples) {
  cov += (old - meanOld) * (lin - meanLin)
  varOld += (old - meanOld) ** 2
  varLin += (lin - meanLin) ** 2
  mse += (old - lin) ** 2
  maxDiff = Math.max(maxDiff, Math.abs(old - lin))
}
console.log(`样本 ${n}`)
console.log(`旧评估均值 ${meanOld.toFixed(2)}，线性均值 ${meanLin.toFixed(2)}`)
console.log(`相关系数 ${(cov / Math.sqrt(varOld * varLin)).toFixed(4)}`)
console.log(`均方误差 ${(mse / n).toFixed(2)}，最大绝对误差 ${maxDiff.toFixed(2)}`)

// 成对排序一致性：随机取两个局面，比较两种评估的排序是否一致
let agree = 0
let pairs = 0
for (let i = 0; i < 20000; i++) {
  const a = samples[Math.floor(rng() * n)]
  const b = samples[Math.floor(rng() * n)]
  const dOld = Math.sign(a.old - b.old)
  const dLin = Math.sign(a.lin - b.lin)
  if (dOld === 0 || dLin === 0) continue
  pairs++
  if (dOld === dLin) agree++
}
console.log(`成对排序一致率 ${(agree / pairs * 100).toFixed(2)}%（${pairs} 对）`)

// 权重概览
console.log('权重：')
weights.forEach((value, index) => {
  if (Math.abs(value) > 1e-9) console.log(`  [${index}] ${value.toFixed(4)}`)
})

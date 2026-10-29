/**
 * 一碰一评估函数的自对弈训练脚本。
 *
 * 评估函数已被参数化为线性模型 score = w · φ(state)（见 oneTouchEngine）。
 * 训练有两种信号来源：
 *
 *   distill（默认）：搜索蒸馏。
 *     自对弈产生局面，对每个局面用「固定参考权重」多搜几层，得到深搜值作为标签，
 *     再用岭回归一次性拟合线性模型。等价于把 depth+K 的棋力压缩进 depth 的叶节点评估。
 *     相比用一局胜负当标签，信号密集得多，也不会因为 SGD 步长把权重带偏。
 *
 *   mc：蒙特卡洛回归。
 *     用整局胜负当标签，回归实际走法子树里的叶节点。作为对照保留。
 *
 *   es：直接优化对基线的胜率（每局只有 1 bit，噪声大，基本不推荐）。
 *
 *   regret（推荐）：深度遗憾值。
 *     先固定一批中局局面，用「基线权重 + 深 K 层」算出每个走法的 Q 值；
 *     再用候选权重做线上同样深度的浅搜，适应度是「浅搜选中的走法比深搜最优差多少血」。
 *     信号连续、每个局面都有贡献；深搜 Q 只算一次，所有候选复用。
 *     用 CEM/ES 优化。默认冻结 40 维手牌 one-hot（没有先验，几千个局面就能拟合噪声）。
 *
 *   check：加载训练产出的权重文件，在全新局面上比较浅搜遗憾值，并与手调基线对局。
 *
 * 自对抗部分：局面由 AI 对 AI 自对弈产生；对手从「当前权重 / 手调基线 / 历史快照」
 * 中抽取（league），而不是双方同时更新，避免策略互相追逐造成的震荡。
 *
 * 运行（在 external/satori-ai 目录）：
 *   ../../node_modules/.bin/tsx scripts/train-onetouch.ts --mode regret
 *   ../../node_modules/.bin/tsx scripts/train-onetouch.ts --mode check --weights .scratch/onetouch.json
 *   ../../node_modules/.bin/tsx scripts/train-onetouch.ts --games 8000 --rounds 2
 *
 * 教师/起点可以换成带一步战术特征的手调权重，或上一轮训练结果（迭代蒸馏）：
 *   --baseline tactical --init tactical
 *   --baseline-weights .scratch/round1.json --init-weights .scratch/round1.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  PlayerState,
  playerStatus,
  generatePossibleMoves,
  stepState,
  evaluatePosition,
  writeFeatures,
  featureScore,
  FEATURE_COUNT,
  HAND_FEATURE_START,
  handcraftedWeights,
  tacticalWeights,
  totalHp,
} from '../src/oneTouchEngine'

type StatePair = [PlayerState, PlayerState]
type Weights = Float64Array

// ——— 参数 ———

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next !== undefined && !next.startsWith('--')) {
      args[key] = next
      i++
    } else {
      args[key] = 'true'
    }
  }
  return args
}

const argv = parseArgs(process.argv.slice(2))
const int = (key: string, fallback: number) => (argv[key] ? parseInt(argv[key], 10) : fallback)
const num = (key: string, fallback: number) => (argv[key] ? parseFloat(argv[key]) : fallback)

const config = {
  mode: (argv.mode || 'distill') as 'distill' | 'mc' | 'es' | 'regret' | 'check',
  games: int('games', 4000),
  rounds: int('rounds', 1),
  levels: (argv.levels || '2,3,4,5,6').split(',').map((v) => parseInt(v, 10)),
  epsilon: num('epsilon', 0.12),
  opponentEpsilon: num('opponent-epsilon', 0.08),
  learningRate: num('lr', 0.002),
  ridge: num('ridge', 1e-3),
  l2: num('l2', 1e-4),
  weightClip: num('weight-clip', 5),
  maxPlies: int('max-plies', 300),

  // mc 模式
  maxLeaves: int('max-leaves', 800),

  // distill 模式
  distillExtra: int('distill-extra', 2), // 参考深搜比线上搜索多几层
  samplesPerGame: int('samples-per-game', 24),
  sampleRate: num('sample-rate', 0.6),
  targetClip: num('target-clip', 1.5), // 标签按总血量归一化后的截断
  residual: argv.residual !== 'false', // 只学习手调评估的残差，未训练时等价于原评估

  snapshotEvery: int('snapshot-every', 500),
  poolSize: int('pool-size', 6),
  evalEvery: int('eval-every', 1000),
  evalLevels: (argv['eval-levels'] || '2,4,6,8').split(',').map((v) => parseInt(v, 10)),
  evalGamesPerLevel: int('eval-games', 24),

  // es 模式：直接优化对基线的胜率
  esGenerations: int('es-generations', 30),
  esPopulation: int('es-population', 20),
  esElites: int('es-elites', 5),
  esLevels: (argv['es-levels'] || '2,4,6').split(',').map((v) => parseInt(v, 10)),
  esScenariosPerLevel: int('es-scenarios', 40),
  esSigma: num('es-sigma', 0.3),

  // regret 模式：优化「浅搜选中的走法比深搜最优差多少」
  regretPositions: int('regret-positions', 400),
  regretLevels: (argv['regret-levels'] || '2,3,4,5,6,7,8').split(',').map((v) => parseInt(v, 10)),
  regretExtra: int('regret-extra', 3), // 深搜比线上搜索多几层
  regretMinSpread: num('regret-min-spread', 2), // 该局面各走法深搜值差距小于此值则不参与训练
  regretGenerations: int('regret-generations', 40),
  regretPopulation: int('regret-population', 24),
  regretElites: int('regret-elites', 6),
  regretSigma: num('regret-sigma', 0.3),
  regretSigmaFloor: num('regret-sigma-floor', 0.01),
  regretValidation: int('regret-validation', 1000),
  // 手牌 one-hot 共 40 维、没有手调先验，几千个局面就能拟合出纯噪声；默认冻结
  regretFreezeHands: argv['regret-freeze-hands'] !== 'false',
  // 深搜 Q 的参考权重（教师）与 CEM 起点：handcrafted = 旧手调评估，tactical = 带一步战术特征
  baseline: (argv.baseline || 'handcrafted') as 'handcrafted' | 'tactical',
  init: (argv.init || 'handcrafted') as 'handcrafted' | 'tactical',
  // 直接指定权重文件（迭代蒸馏：用上一轮训练结果当教师/起点）
  baselineWeights: argv['baseline-weights'] || '',
  initWeights: argv['init-weights'] || '',

  out: argv.out || '.scratch/onetouch-weights.json',
  seed: int('seed', 20261021),
}

// ——— 可复现的随机数 ———

let rngState = config.seed >>> 0
function rng() {
  // mulberry32
  rngState = (rngState + 0x6d2b79f5) >>> 0
  let t = rngState
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function clamp(value: number, min: number, max: number) {
  return value < min ? min : value > max ? max : value
}

// ——— 对局构造 ———

function randomHand() {
  return 1 + Math.floor(rng() * 9)
}

function newGame(level: number): StatePair {
  const hp = totalHp(level)
  const base = (): PlayerState => ({
    left: randomHand(),
    right: randomHand(),
    hp,
    shield: 0,
    strength: 0,
    bleed: 0,
    counterAttack: 0,
    vulnerablility: 0,
    status: playerStatus.Normal,
  })
  const player = base()
  player.shield = Math.round(6 - level / 2)
  return [player, base()]
}

// ——— 搜索 ———

function dot(phi: Float64Array, weights: ArrayLike<number>) {
  let value = 0
  for (let i = 0; i < FEATURE_COUNT; i++) value += weights[i] * phi[i]
  return value
}

function searchValue(
  state: StatePair,
  toMove: 0 | 1,
  perspective: 0 | 1,
  depth: number,
  level: number,
  weights: Weights,
  alpha: number,
  beta: number,
  leaves: Float64Array[] | null,
): number {
  const terminal = state[0].hp <= 0 || state[1].hp <= 0
  if (depth <= 0 || terminal) {
    // 终局局面不进入训练集：标签已经是确定值，学不到东西
    if (leaves && !terminal && leaves.length < config.maxLeaves) {
      const phi = new Float64Array(FEATURE_COUNT)
      writeFeatures(state, perspective, phi, level, toMove)
      leaves.push(phi)
      return dot(phi, weights)
    }
    return evaluatePosition(state, perspective, level, weights, toMove)
  }

  const maximizing = toMove === perspective
  const moves = generatePossibleMoves(state[toMove], state[1 - toMove])
  let value = maximizing ? -Infinity : Infinity

  for (const move of moves) {
    const next = stepState(state, move, toMove)
    const score = searchValue(next, (1 - toMove) as 0 | 1, perspective, depth - 1, level, weights, alpha, beta, leaves)
    if (maximizing) {
      if (score > value) value = score
      if (score > alpha) alpha = score
      if (alpha >= beta) break
    } else {
      if (score < value) value = score
      if (score < beta) beta = score
      if (beta <= alpha) break
    }
  }

  return value
}

// ——— 单局自对弈 ———

interface GameOutcome {
  z: number // 学习方视角：+1 胜 / -1 负 / 0 未分胜负
  leaves: Float64Array[]
  plies: number
}

type DecisionHook = (state: StatePair, actor: 0 | 1, learnerSide: 0 | 1, level: number) => void

function playGame(
  level: number,
  learnerSide: 0 | 1,
  learnerWeights: Weights,
  opponentWeights: Weights,
  collectLeaves: boolean,
  epsilon: number,
  opponentEpsilon: number,
  onDecision?: DecisionHook,
): GameOutcome {
  return playFrom(
    newGame(level), level, learnerSide, learnerWeights, opponentWeights,
    epsilon, opponentEpsilon, collectLeaves, onDecision,
  )
}

function playFrom(
  initial: StatePair,
  level: number,
  learnerSide: 0 | 1,
  learnerWeights: Weights,
  opponentWeights: Weights,
  epsilon: number,
  opponentEpsilon: number,
  collectLeaves: boolean,
  onDecision?: DecisionHook,
): GameOutcome {
  let state = initial
  const depth = Math.round(level / 2)
  const leaves: Float64Array[] = []
  let plies = 0

  while (plies < config.maxPlies && state[0].hp > 0 && state[1].hp > 0) {
    const actor = (plies % 2) as 0 | 1
    const isLearner = actor === learnerSide
    const weights = isLearner ? learnerWeights : opponentWeights

    // 眩晕回合没有可选动作
    if (state[actor].status === playerStatus.Stunned) {
      state = stepState(state, [0, 0], actor)
      plies++
      continue
    }

    if (onDecision) onDecision(state, actor, learnerSide, level)

    const moves = generatePossibleMoves(state[actor], state[1 - actor])
    const nextStates = moves.map((move) => stepState(state, move, actor))
    const scores = nextStates.map((next) =>
      searchValue(next, (1 - actor) as 0 | 1, actor, depth, level, weights, -Infinity, Infinity, null))

    let chosen = 0
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[chosen]) chosen = i
    }
    const eps = isLearner ? epsilon : opponentEpsilon
    if (rng() < eps) chosen = Math.floor(rng() * moves.length)

    const chosenState = nextStates[chosen]
    if (isLearner && collectLeaves && leaves.length < config.maxLeaves) {
      // 只记录实际走法子树中的局面，避免用「没走的那步」的叶节点配当局的胜负标签
      searchValue(chosenState, (1 - actor) as 0 | 1, actor, depth, level, weights, -Infinity, Infinity, leaves)
    }

    state = chosenState
    plies++
  }

  const learner = state[learnerSide]
  const opponent = state[1 - learnerSide]
  const z = opponent.hp <= 0 ? 1 : learner.hp <= 0 ? -1 : 0
  return { z, leaves, plies }
}

// ——— 闭式岭回归 ———

/** 累积 XᵀX 与 Xᵀy，避免把上万个样本存进内存 */
class NormalEquations {
  readonly A = new Float64Array(FEATURE_COUNT * FEATURE_COUNT)
  readonly b = new Float64Array(FEATURE_COUNT)
  count = 0
  sumY = 0
  sumYY = 0
  sumAbsY = 0
  saturated = 0

  add(phi: Float64Array, y: number, saturated = false) {
    const n = FEATURE_COUNT
    for (let i = 0; i < n; i++) {
      const vi = phi[i]
      if (vi === 0) continue
      this.b[i] += vi * y
      const row = i * n
      for (let j = 0; j <= i; j++) {
        this.A[row + j] += vi * phi[j]
      }
    }
    this.count++
    this.sumY += y
    this.sumYY += y * y
    this.sumAbsY += Math.abs(y)
    if (saturated) this.saturated++
  }

  /**
   * 岭回归。prior 不为空时惩罚 ||w - prior||² 而不是 ||w||²，
   * 这样样本里几乎不出现的特征（力量、护盾、手牌）会保留手调先验，
   * 而不是被收缩到 0。
   */
  solve(ridge: number, prior?: ArrayLike<number>): Weights {
    const n = FEATURE_COUNT
    const M = Float64Array.from(this.A)
    // 对称化 + 岭项
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < i; j++) {
        const value = (M[i * n + j] + M[j * n + i]) / 2
        M[i * n + j] = value
        M[j * n + i] = value
      }
      M[i * n + i] += ridge * Math.max(1, this.count)
    }
    const rhs = Float64Array.from(this.b)
    if (prior) {
      const lambda = ridge * Math.max(1, this.count)
      for (let i = 0; i < n; i++) rhs[i] += lambda * prior[i]
    }
    const L = new Float64Array(n * n)
    // Cholesky 分解 A = L Lᵀ
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        let sum = M[i * n + j]
        for (let k = 0; k < j; k++) sum -= L[i * n + k] * L[j * n + k]
        if (i === j) L[i * n + j] = Math.sqrt(Math.max(sum, 1e-12))
        else L[i * n + j] = sum / L[j * n + j]
      }
    }
    const y = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      let sum = rhs[i]
      for (let k = 0; k < i; k++) sum -= L[i * n + k] * y[k]
      y[i] = sum / L[i * n + i]
    }
    const x = new Float64Array(n)
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i]
      for (let k = i + 1; k < n; k++) sum -= L[k * n + i] * x[k]
      x[i] = sum / L[i * n + i]
    }
    return x
  }

  r2(weights: Weights) {
    // SSE = wᵀAw - 2wᵀb + Σy²（岭项不参与，仅用于诊断）
    let quad = 0
    let cross = 0
    for (let i = 0; i < FEATURE_COUNT; i++) {
      cross += weights[i] * this.b[i]
      for (let j = 0; j < FEATURE_COUNT; j++) quad += weights[i] * this.A[i * FEATURE_COUNT + j] * weights[j]
    }
    const sse = Math.max(0, quad - 2 * cross + this.sumYY)
    const mean = this.sumY / Math.max(1, this.count)
    const sst = Math.max(1e-12, this.sumYY - this.count * mean * mean)
    return { r2: 1 - sse / sst, mse: sse / Math.max(1, this.count), count: this.count }
  }
}

// ——— Adam（mc 模式用） ———

class Adam {
  private m = new Float64Array(FEATURE_COUNT)
  private v = new Float64Array(FEATURE_COUNT)
  private t = 0

  step(weights: Weights, gradient: Float64Array, lr: number) {
    this.t++
    const beta1 = 0.9
    const beta2 = 0.999
    const eps = 1e-8
    const bc1 = 1 - Math.pow(beta1, this.t)
    const bc2 = 1 - Math.pow(beta2, this.t)
    for (let i = 0; i < FEATURE_COUNT; i++) {
      const g = gradient[i]
      this.m[i] = beta1 * this.m[i] + (1 - beta1) * g
      this.v[i] = beta2 * this.v[i] + (1 - beta2) * g * g
      weights[i] -= lr * (this.m[i] / bc1) / (Math.sqrt(this.v[i] / bc2) + eps)
      weights[i] = clamp(weights[i], -config.weightClip, config.weightClip)
    }
  }
}

function sigmoid(x: number) {
  if (x >= 30) return 1
  if (x <= -30) return 0
  return 1 / (1 + Math.exp(-x))
}

function trainOnLeaves(weights: Weights, adam: Adam, outcome: GameOutcome) {
  if (outcome.z === 0 || outcome.leaves.length === 0) return
  const target = (outcome.z + 1) / 2
  const gradient = new Float64Array(FEATURE_COUNT)

  for (const phi of outcome.leaves) {
    const error = sigmoid(featureScore(phi, weights)) - target
    for (let i = 0; i < FEATURE_COUNT; i++) gradient[i] += error * phi[i]
  }

  const scale = 1 / outcome.leaves.length
  for (let i = 0; i < FEATURE_COUNT; i++) {
    gradient[i] = gradient[i] * scale + config.l2 * weights[i]
  }
  adam.step(weights, gradient, config.learningRate)
}

// ——— 评估 ———

interface EvalResult {
  wins: number
  losses: number
  draws: number
  rate: number
}

function evaluate(candidate: Weights, opponent: Weights): EvalResult {
  let wins = 0
  let losses = 0
  let draws = 0
  for (const level of config.evalLevels) {
    for (let game = 0; game < config.evalGamesPerLevel; game++) {
      const side = (game % 2) as 0 | 1
      const outcome = playGame(level, side, candidate, opponent, false, 0, 0)
      if (outcome.z > 0) wins++
      else if (outcome.z < 0) losses++
      else draws++
    }
  }
  return { wins, losses, draws, rate: wins + losses ? wins / (wins + losses) : 0.5 }
}

// ——— ES 模式：直接优化对基线的胜率 ———
//
// 搜索树对权重不可微，但「胜率」本身可以直接用进化策略优化。
// 所有候选在完全相同的初始局面集合上对局（配对比较），把随机性带来的
// 评估噪声压到最低；另外用一套独立生成的局面做验证，避免过拟合训练局面。

function gaussian() {
  let u = 0
  let v = 0
  while (u === 0) u = rng()
  while (v === 0) v = rng()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

interface Scenario {
  level: number
  initial: StatePair
  side: 0 | 1
}

function buildScenarios(levels: number[], perLevel: number): Scenario[] {
  const scenarios: Scenario[] = []
  for (const level of levels) {
    for (let i = 0; i < perLevel; i++) {
      scenarios.push({ level, initial: newGame(level), side: (i % 2) as 0 | 1 })
    }
  }
  return scenarios
}

function scoreScenarios(candidate: Weights, opponent: Weights, scenarios: Scenario[]) {
  let total = 0
  for (const scenario of scenarios) {
    const outcome = playFrom(
      scenario.initial, scenario.level, scenario.side,
      candidate, opponent, 0, 0, false,
    )
    total += outcome.z > 0 ? 1 : outcome.z < 0 ? 0 : 0.5
  }
  return total / scenarios.length
}

function runEs() {
  const baseline = Float64Array.from(handcraftedWeights())
  const scenarios = buildScenarios(config.esLevels, config.esScenariosPerLevel)
  const validationLevels = Array.from(new Set([...config.evalLevels, 8, 10]))
  const validation = buildScenarios(validationLevels, Math.max(8, Math.round(config.evalGamesPerLevel / 2)))

  let mean = Float64Array.from(baseline)
  let sigma = new Float64Array(FEATURE_COUNT)
  for (let i = 0; i < FEATURE_COUNT; i++) {
    sigma[i] = config.esSigma * Math.max(1, Math.abs(mean[i]))
  }

  const started = Date.now()
  let bestWeights = Float64Array.from(mean)
  let bestTrainScore = -1
  let bestValidation = 0

  console.log(`  ES：种群 ${config.esPopulation}，精英 ${config.esElites}，${config.esGenerations} 代`)
  console.log(`  训练局面 ${scenarios.length}，验证局面 ${validation.length}（难度 ${validationLevels.join('/')}）`)

  const baselineTrain = scoreScenarios(baseline, baseline, scenarios)
  const baselineValidation = scoreScenarios(baseline, baseline, validation)
  console.log(`  基线在训练局面 ${(baselineTrain * 100).toFixed(1)}%，验证局面 ${(baselineValidation * 100).toFixed(1)}%`)

  for (let generation = 1; generation <= config.esGenerations; generation++) {
    const candidates: Weights[] = []
    const scores: number[] = []

    for (let member = 0; member < config.esPopulation; member++) {
      let candidate: Weights
      if (member === 0) {
        candidate = Float64Array.from(mean)
      } else {
        candidate = new Float64Array(FEATURE_COUNT)
        for (let i = 0; i < FEATURE_COUNT; i++) {
          candidate[i] = clamp(mean[i] + sigma[i] * gaussian(), -config.weightClip, config.weightClip)
        }
      }
      candidates.push(candidate)
      scores.push(scoreScenarios(candidate, baseline, scenarios))
    }

    const order = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score)
    const elites = order.slice(0, Math.min(config.esElites, order.length))

    if (order[0].score > bestTrainScore) {
      bestTrainScore = order[0].score
      bestWeights = Float64Array.from(candidates[order[0].index])
    }

    // 精英均值 / 方差
    const newMean = new Float64Array(FEATURE_COUNT)
    for (const elite of elites) {
      for (let i = 0; i < FEATURE_COUNT; i++) newMean[i] += candidates[elite.index][i]
    }
    for (let i = 0; i < FEATURE_COUNT; i++) newMean[i] /= elites.length

    const newSigma = new Float64Array(FEATURE_COUNT)
    for (let i = 0; i < FEATURE_COUNT; i++) {
      let variance = 0
      for (const elite of elites) {
        const diff = candidates[elite.index][i] - newMean[i]
        variance += diff * diff
      }
      variance /= Math.max(1, elites.length)
      const floor = 0.03 * Math.max(1, Math.abs(newMean[i]))
      newSigma[i] = Math.max(Math.sqrt(variance), floor)
    }

    // 与上一代混合，避免过早收敛
    for (let i = 0; i < FEATURE_COUNT; i++) {
      mean[i] = mean[i] * 0.3 + newMean[i] * 0.7
      sigma[i] = sigma[i] * 0.4 + newSigma[i] * 0.6
    }

    const eliteMean = scores.reduce((sum, value) => sum + value, 0) / scores.length
    let line = `[gen ${generation}] ${((Date.now() - started) / 1000).toFixed(1)}s  ` +
      `best ${(order[0].score * 100).toFixed(1)}%  mean ${(eliteMean * 100).toFixed(1)}%  ` +
      `σ均值 ${(Array.from(sigma).reduce((s, v) => s + v, 0) / FEATURE_COUNT).toFixed(3)}`

    if (generation % 5 === 0 || generation === config.esGenerations) {
      const validationScore = scoreScenarios(mean, baseline, validation)
      line += `  | 验证 ${(validationScore * 100).toFixed(1)}%`
      if (validationScore > bestValidation) {
        bestValidation = validationScore
      }
    }
    console.log(line)
  }

  // 最终用独立的完整评估协议复核
  const result = evaluate(bestWeights, baseline)
  console.log(
    `最终 best vs 手调 ${result.wins}/${result.losses}/${result.draws} = ` +
    `${(result.rate * 100).toFixed(1)}%（难度 ${config.evalLevels.join('/')}）`,
  )

  return { weights: bestWeights, rate: result.rate, result }
}

// ——— regret 模式：让浅搜选中的走法尽量接近深搜最优 ———
//
// 相比「回归深搜值」，直接看走法后悔值：
//   regret(s) = Q_deep(最优走法) - Q_deep(浅搜选中的走法)
// 信号连续、每局局面都有贡献，且深搜 Q 值只算一次，可被所有候选复用。
// 优化器仍是 CEM/ES：搜索对权重不可微，但遗憾值本身可以直接优化。

interface PositionSample {
  level: number
  toMove: 0 | 1
  nextStates: StatePair[]
  deep: number[]
  bestValue: number
}

function collectPositions(target: number, baseline: Weights): PositionSample[] {
  const samples: PositionSample[] = []
  let attempts = 0
  const rejected = { dead: 0, stunned: 0, spread: 0, terminal: 0 }

  while (samples.length < target && attempts++ < target * 30) {
    const level = config.regretLevels[Math.floor(rng() * config.regretLevels.length)]
    const depth = Math.min(Math.round(level / 2) + config.regretExtra, 6)
    const shallowDepth = Math.round(level / 2)

    // 用基线浅搜走到中局（随机走子增加多样性）
    let state = newGame(level)
    const plies = 4 + Math.floor(rng() * 15)
    for (let p = 0; p < plies && state[0].hp > 0 && state[1].hp > 0; p++) {
      const actor = (p % 2) as 0 | 1
      if (state[actor].status === playerStatus.Stunned) {
        state = stepState(state, [0, 0], actor)
        continue
      }
      const moves = generatePossibleMoves(state[actor], state[1 - actor])
      let chosen = Math.floor(rng() * moves.length)
      if (rng() > 0.25) {
        let bestScore = -Infinity
        for (let i = 0; i < moves.length; i++) {
          const score = searchValue(
            stepState(state, moves[i], actor), (1 - actor) as 0 | 1, actor,
            shallowDepth, level, baseline, -Infinity, Infinity, null,
          )
          if (score > bestScore) {
            bestScore = score
            chosen = i
          }
        }
      }
      state = stepState(state, moves[chosen], actor)
    }
    if (state[0].hp <= 0 || state[1].hp <= 0) {
      rejected.dead++
      continue
    }
    // 残局几乎总能一步击杀，深搜值全是终局分，没有评估权重能影响的决策
    if (state[0].hp < totalHp(level) * 0.45 || state[1].hp < totalHp(level) * 0.45) {
      rejected.dead++
      continue
    }

    const actor = (plies % 2) as 0 | 1
    if (state[actor].status === playerStatus.Stunned) {
      rejected.stunned++
      continue
    }

    const moves = generatePossibleMoves(state[actor], state[1 - actor])
    const nextStates = moves.map((move) => stepState(state, move, actor))
    const deep = nextStates.map((next) =>
      searchValue(next, (1 - actor) as 0 | 1, actor, depth, level, baseline, -Infinity, Infinity, null))

    const bestValue = Math.max(...deep)
    const spread = bestValue - Math.min(...deep)
    // 分数单位约等于「血量 / 总血量」，换算回血量再判断
    const spreadHp = spread * totalHp(level)
    // 差距太小的局面没有训练价值；含终局走法（±1e6）的局面会让遗憾值失去血量尺度，
    // 也一并排除，否则单个「浅搜选到立即送死」会淹没其余样本。
    if (!isFinite(spreadHp) || spreadHp < config.regretMinSpread) {
      rejected.spread++
      continue
    }
    if (deep.some((value) => !isFinite(value) || Math.abs(value) > 1000)) {
      rejected.terminal++
      continue
    }

    samples.push({ level, toMove: actor, nextStates, deep, bestValue })
  }

  if (argv.debug) console.log(`    collect 拒绝：终局/残局 ${rejected.dead}，眩晕 ${rejected.stunned}，差距小 ${rejected.spread}，含终局走法 ${rejected.terminal}，尝试 ${attempts}`)

  return samples
}

interface RegretResult {
  regret: number // 按总血量归一化，跨难度可比
  hpRegret: number // 平均绝对血量
  match: number // 与深搜最优走法一致的比例
}

function evaluatePositions(weights: Weights, samples: PositionSample[]): RegretResult {
  let normalized = 0
  let absolute = 0
  let matches = 0

  for (const sample of samples) {
    const depth = Math.round(sample.level / 2)
    let pick = 0
    let bestScore = -Infinity
    for (let i = 0; i < sample.nextStates.length; i++) {
      const score = searchValue(
        sample.nextStates[i], (1 - sample.toMove) as 0 | 1, sample.toMove,
        depth, sample.level, weights, -Infinity, Infinity, null,
      )
      if (score > bestScore) {
        bestScore = score
        pick = i
      }
    }
    const regret = sample.bestValue - sample.deep[pick]
    const hpScale = totalHp(sample.level)
    // 分数单位约为「血量 / 总血量」，乘回去得到血量；normalized 保持分数单位
    absolute += regret * hpScale
    normalized += regret
    if (regret <= 1e-9) matches++
  }

  const n = Math.max(1, samples.length)
  return { regret: normalized / n, hpRegret: absolute / n, match: matches / n }
}

function loadWeightsFile(file: string): Weights {
  const payload = JSON.parse(readFileSync(file, 'utf8'))
  const weights = Float64Array.from(payload.weights as number[])
  if (weights.length !== FEATURE_COUNT) {
    throw new Error(`${file} 的权重维度是 ${weights.length}，与当前 FEATURE_COUNT=${FEATURE_COUNT} 不一致`)
  }
  return weights
}

function runRegret() {
  const baseline = config.baselineWeights
    ? loadWeightsFile(config.baselineWeights)
    : Float64Array.from(config.baseline === 'tactical' ? tacticalWeights() : handcraftedWeights())
  const init = config.initWeights
    ? loadWeightsFile(config.initWeights)
    : config.init === 'tactical' ? tacticalWeights() : handcraftedWeights()

  console.log('  生成训练局面……')
  const train = collectPositions(config.regretPositions, baseline)
  console.log('  生成验证局面……')
  const validation = collectPositions(config.regretValidation, baseline)
  console.log(`  训练局面 ${train.length}，验证局面 ${validation.length}`)

  const baseTrain = evaluatePositions(baseline, train)
  const baseValidation = evaluatePositions(baseline, validation)
  console.log(
    `  基线：训练 regret ${baseTrain.hpRegret.toFixed(2)} HP（匹配 ${(baseTrain.match * 100).toFixed(1)}%），` +
    `验证 regret ${baseValidation.hpRegret.toFixed(2)} HP（匹配 ${(baseValidation.match * 100).toFixed(1)}%）`,
  )

  let mean = Float64Array.from(init)
  let sigma = new Float64Array(FEATURE_COUNT)
  const active = new Uint8Array(FEATURE_COUNT).fill(1)
  if (config.regretFreezeHands) active.fill(0, HAND_FEATURE_START, FEATURE_COUNT) // 手牌 one-hot
  for (let i = 0; i < FEATURE_COUNT; i++) {
    sigma[i] = active[i] ? config.regretSigma * Math.max(1, Math.abs(mean[i])) : 0
  }

  let best = Float64Array.from(init)
  let bestValidation = baseValidation.regret
  const started = Date.now()

  for (let generation = 1; generation <= config.regretGenerations; generation++) {
    const candidates: Weights[] = []
    const results: RegretResult[] = []

    for (let member = 0; member < config.regretPopulation; member++) {
      let candidate: Weights
      if (member === 0) {
        candidate = Float64Array.from(mean)
      } else {
        candidate = new Float64Array(FEATURE_COUNT)
        for (let i = 0; i < FEATURE_COUNT; i++) {
          candidate[i] = active[i]
            ? clamp(mean[i] + sigma[i] * gaussian(), -config.weightClip, config.weightClip)
            : mean[i]
        }
      }
      candidates.push(candidate)
      results.push(evaluatePositions(candidate, train))
    }

    // 遗憾值越低越好
    const order = results.map((result, index) => ({ result, index })).sort((a, b) => a.result.regret - b.result.regret)
    const elites = order.slice(0, Math.min(config.regretElites, order.length))

    const newMean = new Float64Array(FEATURE_COUNT)
    for (const elite of elites) {
      for (let i = 0; i < FEATURE_COUNT; i++) newMean[i] += candidates[elite.index][i]
    }
    for (let i = 0; i < FEATURE_COUNT; i++) newMean[i] /= elites.length

    const newSigma = new Float64Array(FEATURE_COUNT)
    for (let i = 0; i < FEATURE_COUNT; i++) {
      let variance = 0
      for (const elite of elites) {
        const diff = candidates[elite.index][i] - newMean[i]
        variance += diff * diff
      }
      variance /= Math.max(1, elites.length)
      const floor = active[i] ? config.regretSigmaFloor * Math.max(1, Math.abs(newMean[i])) : 0
      newSigma[i] = active[i] ? Math.max(Math.sqrt(variance), floor) : 0
    }

    for (let i = 0; i < FEATURE_COUNT; i++) {
      if (!active[i]) continue
      mean[i] = mean[i] * 0.3 + newMean[i] * 0.7
      sigma[i] = sigma[i] * 0.4 + newSigma[i] * 0.6
    }

    const validationResult = evaluatePositions(mean, validation)
    if (validationResult.regret < bestValidation) {
      bestValidation = validationResult.regret
      best = Float64Array.from(mean)
    }

    console.log(
      `[gen ${generation}] ${((Date.now() - started) / 1000).toFixed(1)}s  ` +
      `train ${order[0].result.hpRegret.toFixed(2)} HP / 匹配 ${(order[0].result.match * 100).toFixed(1)}%  ` +
      `验证 ${validationResult.hpRegret.toFixed(2)} HP / 匹配 ${(validationResult.match * 100).toFixed(1)}%  ` +
      `σ均值 ${(Array.from(sigma).reduce((s, v) => s + v, 0) / FEATURE_COUNT).toFixed(3)}`,
    )
  }

  const result = evaluate(best, baseline)
  console.log(
    `最终 best vs 手调 ${result.wins}/${result.losses}/${result.draws} = ` +
    `${(result.rate * 100).toFixed(1)}%（难度 ${config.evalLevels.join('/')}）`,
  )

  return { weights: best, rate: result.rate, result }
}

// ——— 主循环 ———

function main() {
  if (config.mode === 'check') {
    const file = argv.weights || config.out
    const payload = JSON.parse(readFileSync(file, 'utf8'))
    const weights = Float64Array.from(payload.weights as number[])
    if (weights.length !== FEATURE_COUNT) {
      throw new Error(`${file} 的权重维度是 ${weights.length}，与当前 FEATURE_COUNT=${FEATURE_COUNT} 不一致，需要重新训练`)
    }
    const baseline = Float64Array.from(handcraftedWeights())
    console.log(`校验 ${file}（${weights.length} 维）`)
    console.log('  生成验证局面……')
    const samples = collectPositions(config.regretValidation, baseline)
    const base = evaluatePositions(baseline, samples)
    const cand = evaluatePositions(weights, samples)
    console.log(
      `  验证局面 ${samples.length}：手调 ${base.hpRegret.toFixed(2)} HP / 匹配 ${(base.match * 100).toFixed(1)}%，` +
      `候选 ${cand.hpRegret.toFixed(2)} HP / 匹配 ${(cand.match * 100).toFixed(1)}%`,
    )
    const result = evaluate(weights, baseline)
    console.log(
      `  候选 vs 手调 ${result.wins}/${result.losses}/${result.draws} = ${(result.rate * 100).toFixed(1)}%` +
      `（难度 ${config.evalLevels.join('/')}，每级 ${config.evalGamesPerLevel} 局）`,
    )
    return
  }

  if (config.mode === 'es') {
    mkdirSync(dirname(config.out), { recursive: true })
    console.log('一碰一评估训练')
    console.log(`  模式 es，世代 ${config.esGenerations}，难度 ${config.esLevels.join('/')}，lr 无关`)
    const { weights, rate, result } = runEs()
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      seed: config.seed,
      featureCount: FEATURE_COUNT,
      config,
      bestWinRate: rate,
      bestEval: result,
      weights: Array.from(weights),
    }
    writeFileSync(config.out, JSON.stringify(payload, null, 2))
    console.log(`权重已写入 ${config.out}`)
    console.log('weights = ' + JSON.stringify(Array.from(weights).map((v) => Number(v.toFixed(6)))))
    return
  }

  if (config.mode === 'regret') {
    mkdirSync(dirname(config.out), { recursive: true })
    console.log('一碰一评估训练')
    console.log(
      `  模式 regret，局面 ${config.regretPositions}，世代 ${config.regretGenerations}，` +
      `难度 ${config.regretLevels.join('/')}`,
    )
    const { weights, rate, result } = runRegret()
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      seed: config.seed,
      featureCount: FEATURE_COUNT,
      config,
      bestWinRate: rate,
      bestEval: result,
      weights: Array.from(weights),
    }
    writeFileSync(config.out, JSON.stringify(payload, null, 2))
    console.log(`权重已写入 ${config.out}`)
    console.log('weights = ' + JSON.stringify(Array.from(weights).map((v) => Number(v.toFixed(6)))))
    return
  }

  const weights: Weights = Float64Array.from(handcraftedWeights())
  const baseline: Weights = Float64Array.from(handcraftedWeights())
  const pool: Weights[] = []

  mkdirSync(dirname(config.out), { recursive: true })

  console.log('一碰一评估训练')
  console.log(`  模式 ${config.mode}，每轮对局 ${config.games}，轮数 ${config.rounds}，难度 ${config.levels.join('/')}`)
  console.log(`  特征维度 ${FEATURE_COUNT}，评估难度 ${config.evalLevels.join('/')}，每级 ${config.evalGamesPerLevel} 局`)

  const sanity = evaluate(baseline, baseline)
  console.log(`  基线镜像对局 ${sanity.wins}/${sanity.losses}/${sanity.draws} = ${(sanity.rate * 100).toFixed(1)}%（应接近 50%）`)

  const started = Date.now()
  let totalSamples = 0
  let totalGames = 0
  let chunkWins = 0
  let chunkLosses = 0
  let chunkDraws = 0
  let bestRate = -1
  let bestWeights = Float64Array.from(weights)
  let bestResult: EvalResult | null = null

  for (let round = 1; round <= config.rounds; round++) {
    const isDistill = config.mode === 'distill'
    const normal = new NormalEquations()
    const adam = new Adam()
    chunkWins = chunkLosses = chunkDraws = 0

    for (let game = 1; game <= config.games; game++) {
      const level = config.levels[Math.floor(rng() * config.levels.length)]
      const learnerSide = (game % 2) as 0 | 1

      // league：当前权重 / 手调基线 / 历史快照
      const roll = rng()
      let opponent: Weights
      if (roll < 0.45 || pool.length === 0) opponent = weights
      else if (roll < 0.7) opponent = baseline
      else opponent = pool[Math.floor(rng() * pool.length)]

      if (isDistill) {
        const deepDepth = Math.round(level / 2) + config.distillExtra
        const onDecision: DecisionHook = (state, actor, persp, lvl) => {
          if (normal.count >= config.games * config.samplesPerGame) return
          if (rng() > config.sampleRate) return
          const value = searchValue(state, actor, persp, deepDepth, lvl, baseline, -Infinity, Infinity, null)
          const phi = new Float64Array(FEATURE_COUNT)
          writeFeatures(state, persp, phi, lvl, actor)
          const base = featureScore(phi, baseline)
          const raw = value / totalHp(lvl) - (config.residual ? base : 0)
          normal.add(phi, clamp(raw, -config.targetClip, config.targetClip), Math.abs(raw) >= config.targetClip)
        }
        const outcome = playGame(
          level, learnerSide, weights, opponent, false,
          config.epsilon, config.opponentEpsilon, onDecision,
        )
        if (outcome.z > 0) chunkWins++
        else if (outcome.z < 0) chunkLosses++
        else chunkDraws++
        totalGames++
      } else {
        const outcome = playGame(
          level, learnerSide, weights, opponent, true,
          config.epsilon, config.opponentEpsilon,
        )
        if (outcome.z > 0) chunkWins++
        else if (outcome.z < 0) chunkLosses++
        else chunkDraws++
        totalSamples += outcome.leaves.length
        totalGames++
        trainOnLeaves(weights, adam, outcome)
      }

      if (game % config.snapshotEvery === 0) {
        pool.push(Float64Array.from(weights))
        if (pool.length > config.poolSize) pool.shift()
      }

      if (!isDistill && (game % config.evalEvery === 0 || game === config.games)) {
        report(game, weights, baseline, chunkWins, chunkLosses, chunkDraws, totalSamples, totalGames, started)
        const result = evaluate(weights, baseline)
        if (result.rate > bestRate) {
          bestRate = result.rate
          bestWeights = Float64Array.from(weights)
          bestResult = result
        }
        console.log(`    vs 手调 ${result.wins}/${result.losses}/${result.draws} = ${(result.rate * 100).toFixed(1)}%`)
        chunkWins = chunkLosses = chunkDraws = 0
      }
    }

    if (isDistill) {
      const fitted = normal.solve(config.ridge, config.residual ? undefined : baseline)
      const diag = normal.r2(fitted)
      for (let i = 0; i < FEATURE_COUNT; i++) {
        weights[i] = config.residual ? baseline[i] + fitted[i] : fitted[i]
      }
      totalSamples = normal.count
      const meanAbs = normal.count ? normal.sumAbsY / normal.count : 0
      console.log(
        `[round ${round}] 样本 ${diag.count}，饱和 ${(normal.saturated / Math.max(1, normal.count) * 100).toFixed(1)}%，` +
        `|y|均值 ${meanAbs.toFixed(3)}，R² ${diag.r2.toFixed(3)}，MSE ${diag.mse.toFixed(5)}  ` +
        `self-play ${chunkWins}/${chunkLosses}/${chunkDraws}`,
      )
      const result = evaluate(weights, baseline)
      console.log(`    vs 手调 ${result.wins}/${result.losses}/${result.draws} = ${(result.rate * 100).toFixed(1)}%`)
      if (result.rate > bestRate) {
        bestRate = result.rate
        bestWeights = Float64Array.from(weights)
        bestResult = result
      }
    }
  }

  const payload = {
    version: 1,
    createdAt: new Date().toISOString(),
    seed: config.seed,
    featureCount: FEATURE_COUNT,
    config,
    bestWinRate: bestRate,
    bestEval: bestResult,
    weights: Array.from(bestWeights),
  }
  writeFileSync(config.out, JSON.stringify(payload, null, 2))

  console.log('')
  console.log(`最佳胜率 ${(bestRate * 100).toFixed(1)}%，权重已写入 ${config.out}`)
  console.log('weights = ' + JSON.stringify(Array.from(bestWeights).map((v) => Number(v.toFixed(6)))))
}

function report(
  game: number, weights: Weights, baseline: Weights,
  wins: number, losses: number, draws: number,
  totalSamples: number, totalGames: number, started: number,
) {
  const elapsed = (Date.now() - started) / 1000
  const rate = wins + losses ? wins / (wins + losses) : 0
  const meanWeight = Array.from(weights).reduce((sum, v) => sum + Math.abs(v), 0) / FEATURE_COUNT
  console.log(
    `[${game}/${config.games}] ${elapsed.toFixed(1)}s  ` +
    `self-play ${wins}/${losses}/${draws} (${(rate * 100).toFixed(1)}%)  ` +
    `样本/局 ${(totalSamples / Math.max(1, totalGames)).toFixed(0)}  |w|均值 ${meanWeight.toFixed(2)}`,
  )
}

main()

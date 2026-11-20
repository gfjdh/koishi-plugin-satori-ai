// 关系惯性（2.4）的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-relationship-inertia.ts
// 覆盖：近 6 个完整记忆日 + 当天 ×2 的加分口径、日界线切分、关系等级提升、好感度 0 以下不加分。
import { buildRelationshipInertia } from '../src/memory/stats'
import { getFavorabilityLevel } from '../src/favorability'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const TZ = 8
const BOUNDARY = 4
const DAY = 86_400_000

interface Call { from: Date, to: Date, kinds?: string[] }
const calls: Call[] = []
let previousCount = 0
let todayCount = 0
let todayStart: Date

const repo: any = {
  async countDialoguesBetween(_scopeId: string, from: Date, to: Date, kinds?: string[]) {
    calls.push({ from, to, kinds })
    return from.getTime() === todayStart.getTime() ? todayCount : previousCount
  },
}

async function main() {
  // ---------- 场景 1：6 天各 30 轮 + 当天 10 轮 ----------
  {
    calls.length = 0
    previousCount = 6 * 30
    todayCount = 10
    const now = new Date('2026-11-20T12:00:00+08:00')
    todayStart = new Date('2026-11-20T04:00:00+08:00')
    const bonus = await buildRelationshipInertia(repo, 'u1', 140, TZ, BOUNDARY, now)
    assert(bonus === 6 * 30 + 2 * 10, `加分为 6*30 + 2*10 = 200（实际 ${bonus}）`)

    assert(calls.length === 2, '只查两个窗口：之前 6 天、当天')
    const previous = calls[0]
    const today = calls[1]
    assert(
      previous.from.getTime() === new Date('2026-11-14T04:00:00+08:00').getTime()
      && previous.to.getTime() === todayStart.getTime(),
      '之前窗口覆盖昨天到 6 天前（6 个完整记忆日）',
    )
    assert(
      today.from.getTime() === todayStart.getTime()
      && today.to.getTime() === new Date('2026-11-21T04:00:00+08:00').getTime(),
      '当天窗口从今天的日界线到下一条日界线',
    )
    assert(
      previous.kinds?.join(',') === 'turn,legacy' && today.kinds?.join(',') === 'turn,legacy',
      '只统计用户与 bot 的对话轮次（不含群聊环境消息）',
    )
  }

  // ---------- 场景 2：日界线之前的时间算前一天 ----------
  {
    calls.length = 0
    previousCount = 100
    todayCount = 3
    const now = new Date('2026-11-20T03:30:00+08:00')
    todayStart = new Date('2026-11-19T04:00:00+08:00')
    const bonus = await buildRelationshipInertia(repo, 'u1', 140, TZ, BOUNDARY, now)
    assert(bonus === 100 + 3 * 2, '凌晨 4 点前仍属于前一个记忆日')
    assert(
      calls[0].from.getTime() === new Date('2026-11-13T04:00:00+08:00').getTime(),
      '窗口起点随之回退到 6 天前的日界线',
    )
  }

  // ---------- 场景 3：没有对话时加分为 0 ----------
  {
    calls.length = 0
    previousCount = 0
    todayCount = 0
    const now = new Date('2026-11-20T12:00:00+08:00')
    todayStart = new Date('2026-11-20T04:00:00+08:00')
    const bonus = await buildRelationshipInertia(repo, 'u1', 140, TZ, BOUNDARY, now)
    assert(bonus === 0, '没有近期对话时不加分')
  }

  // ---------- 场景 4：加分让注入的关系等级上升 ----------
  {
    const config: any = {
      favorability_div_1: 15,
      favorability_div_2: 150,
      favorability_div_3: 500,
      favorability_div_4: 1000,
    }
    const user: any = { favorability: 140, items: {} }
    const base = getFavorabilityLevel(user, config)
    assert(base === '陌生', `140 点本身是陌生（实际 ${base}）`)
    const effective = getFavorabilityLevel({ ...user, favorability: user.favorability + 200 }, config)
    assert(effective === '朋友', `加上 200 后注入等级变成朋友（实际 ${effective}）`)
    assert(user.favorability === 140, '只读计算，不改写存储的好感度')
  }

  // ---------- 场景 5：好感度 0 或负值不计算加分 ----------
  {
    calls.length = 0
    previousCount = 6 * 30
    todayCount = 10
    const now = new Date('2026-11-20T12:00:00+08:00')
    todayStart = new Date('2026-11-20T04:00:00+08:00')
    const zero = await buildRelationshipInertia(repo, 'u1', 0, TZ, BOUNDARY, now)
    const negative = await buildRelationshipInertia(repo, 'u1', -10, TZ, BOUNDARY, now)
    assert(zero === 0, '好感度正好为 0 时不加分')
    assert(negative === 0, '负好感不因近期活跃被抬高')
    assert(calls.length === 0, '不满足条件时直接返回，不查询对话次数')
  }

  console.log('ALL PASS')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

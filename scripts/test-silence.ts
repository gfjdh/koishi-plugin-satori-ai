// 静默 / 封禁逻辑的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-silence.ts
// 覆盖：触发词识别与时长解析、数据库持久化、到期自动解除、管理员封禁与解封、
// 统一解除入口，以及静默期间中间件不回复。
import {
  SilenceManager, stripSilenceMarker, isMuteControlCommand, silenceRemainingMinutes, parseBanMinutes,
} from '../src/silence'
import { createMiddleware } from '../src/middleware'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const realNow = Date.now
let now = 1_700_000_000_000
Date.now = () => now

// 内存假数据库
const rows: any[] = []
let nextId = 1
const db = {
  async get(_table: string, query: any) {
    return rows.filter(row => row.userId === query.userId)
  },
  async remove(_table: string, query: any) {
    let removed = 0
    for (let i = rows.length - 1; i >= 0; i--) {
      if (rows[i].userId === query.userId) {
        rows.splice(i, 1)
        removed++
      }
    }
    return { removed }
  },
  async create(_table: string, row: any) {
    rows.push({ id: nextId++, ...row })
    return row
  },
}
const manager = new SilenceManager({ database: db } as any)

const privateSession: any = {
  userId: 'u1', selfId: 'bot', channelId: 'private:u1', subtype: 'private', username: '群友', content: '你好', elements: [],
}
const groupSession: any = {
  userId: 'u1', selfId: 'bot', channelId: 'g1', subtype: undefined, isDirect: false, username: '群友', content: '你好呀', elements: [],
}

const baseConfig: any = {
  enable_favorability: false,
  enable_warning: false,
  warning_group: '',
  private: true,
  nick_name: false,
  random_min_tokens: 2,
  max_tokens: 30,
}

async function main() {
  // ---------- 场景 1：触发词识别、剥离与时长解析 ----------
  {
    const plain = stripSilenceMarker('今天就聊到这里。')
    assert(!plain.triggered && plain.content === '今天就聊到这里。', '普通回复不触发静默')

    const half = stripSilenceMarker('……够了。[沉默30]')
    assert(half.triggered && half.content === '……够了。', '识别触发词并把它从回复里剥离')
    assert(half.minutes === 30, '分钟数由模型在触发词里指定')

    const full = stripSilenceMarker('【沉默10分钟】')
    assert(full.triggered && full.content === '' && full.minutes === 10, '全角括号与「分钟」单位也能识别')

    const hours = stripSilenceMarker('[沉默1小时]')
    assert(hours.triggered && hours.minutes === 60, '小时单位换算为分钟')

    const bare = stripSilenceMarker('[沉默]')
    assert(bare.triggered && bare.minutes === 30, '模型没写数字时使用兜底时长')

    const twice = stripSilenceMarker('[沉默5]别理我了[沉默60]')
    assert(twice.triggered && twice.content === '别理我了' && twice.minutes === 60, '多次出现时全部剥离，时长取较大值')
  }

  // ---------- 场景 2：模型静默持久化与到期解除 ----------
  {
    now = 1_700_000_000_000
    rows.length = 0
    assert(!(await manager.isMuted('u1')), '初始没有被静默')

    const row = await manager.apply('u1', 30, 'model')
    assert(row.source === 'model' && row.until!.getTime() === now + 30 * 60_000, '模型静默按时长写入数据库')
    assert(await manager.isMuted('u1'), '静默后立即生效')
    assert(silenceRemainingMinutes((await manager.info('u1'))!) === 30, '剩余时长按模型指定值计算')

    now += 29 * 60_000
    assert(await manager.isMuted('u1'), '未到期前一直静默')
    now += 60_000
    assert(!(await manager.isMuted('u1')), '到期后自动解除')
    assert(rows.length === 0, '到期记录被清理')
  }

  // ---------- 场景 3：管理员封禁与统一解封 ----------
  {
    now = 1_700_000_000_000
    rows.length = 0
    const row = await manager.apply('u2', 0, 'admin', 'admin')
    assert(row.until === null && row.operator === 'admin', '时长 0 表示永久封禁并记录操作者')
    now += 365 * 86_400_000
    assert(await manager.isMuted('u2'), '永久封禁不会自动到期')

    assert(await manager.lift('u2'), '解封入口同时解除封禁')
    assert(!(await manager.isMuted('u2')), '解封后不再封禁')
    assert(!(await manager.lift('u2')), '重复解封返回未处理')

    await manager.apply('u3', 10, 'model')
    assert(await manager.lift('u3'), '解封入口同时解除模型主动静默')
  }

  // ---------- 场景 4：重复静默覆盖旧记录 ----------
  {
    now = 1_700_000_000_000
    rows.length = 0
    await manager.apply('u4', 5, 'model')
    await manager.apply('u4', 60, 'admin', 'admin2')
    assert(rows.filter(row => row.userId === 'u4').length === 1, '同一用户只保留一条记录')
    const replaced = await manager.info('u4')
    assert(replaced?.source === 'admin' && replaced.until!.getTime() === now + 60 * 60_000,
      '后一次静默/封禁覆盖前一次')
  }

  // ---------- 场景 5：运维指令放行判定 ----------
  {
    assert(isMuteControlCommand('sat.silence'), '查看状态的指令放行')
    assert(isMuteControlCommand('封禁'), '管理员封禁指令放行')
    assert(isMuteControlCommand('解封'), '统一解封指令放行')
    assert(!isMuteControlCommand('sat.memory.view'), '其它指令不放行')
    assert(!isMuteControlCommand('sat.silence.clear'), '旧的单独解除入口已移除')

    assert(parseBanMinutes('10') === 10, '封禁时长按文本解析为分钟数')
    assert(parseBanMinutes('0') === 0, '0 表示永久封禁')
    assert(parseBanMinutes('') === null && parseBanMinutes('abc') === null && parseBanMinutes('-5') === null,
      '非法时长返回 null')
  }

  // ---------- 场景 6：静默期间中间件不回复 ----------
  const calls: string[] = []
  let silenced = true
  const sat: any = {
    broadcastManager: { seedBroadcast: async () => {} },
    isMuted: async () => silenced,
    coldRescue: { observe: () => null, arm: () => calls.push('arm') },
    proactive: { touch: () => calls.push('touch') },
    isGameActive: () => false,
    handleNickNameMiddleware: async () => { calls.push('reply') },
    handleChannelMemoryManager: async () => { calls.push('record'); return true },
    handleRandomMiddleware: async () => { calls.push('random') },
  }

  await createMiddleware({} as any, sat, baseConfig)(privateSession, async () => calls.push('next'))
  assert(calls.length === 0, '静默期间的私聊消息不回复')

  calls.length = 0
  await createMiddleware({} as any, sat, { ...baseConfig, private: false, randnum: 1 })(groupSession, async () => calls.push('next'))
  assert(calls.join(',') === 'record,next', '静默期间的群消息不随机插话，只记录环境')

  calls.length = 0
  sat.coldRescue.observe = () => 1
  await createMiddleware({} as any, sat, { ...baseConfig, private: false, randnum: 0 })(groupSession, async () => calls.push('next'))
  assert(calls.join(',') === 'record,next', '静默期间不武装冷场救场')

  silenced = false
  calls.length = 0
  await createMiddleware({} as any, sat, { ...baseConfig, private: false, randnum: 1 })(groupSession, async () => calls.push('next'))
  assert(calls.join(',') === 'record,random', '非静默时随机插话照常')

  calls.length = 0
  await createMiddleware({} as any, sat, { ...baseConfig, private: false, randnum: 0 })(groupSession, async () => calls.push('next'))
  assert(calls.join(',') === 'record,arm,next', '非静默时冷场救场照常武装')

  Date.now = realNow
  console.log('ALL PASS')
}

main().catch((error) => {
  Date.now = realNow
  console.error(error)
  process.exit(1)
})

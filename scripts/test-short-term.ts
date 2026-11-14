// 短期记忆 TTL 的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-short-term.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
import { ShortTermMemory } from '../src/memory/short-term'

let fakeNow = 0
const now = () => new Date(fakeNow)

const config: any = {
  bracket_filter: false,
  memory_filter: '示例1-示例2',
  message_max_length: 12,
  personal_memory: true,
  channel_dialogues: true,
  channel_dialogues_max_length: 10,
  enhanceReasoningProtection: false,
  enable_self_memory: true,
}

const session = (userId: string, channelId: string, username = 'tester') => ({
  userId,
  channelId,
  username,
}) as any

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const minutes = (n: number) => n * 60_000

// ---------- 场景 1：持续对话续期，静默超过 TTL 后清空 ----------
fakeNow = 0
const mem = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem.updateChannelMemory(session('u1', 'c1'), '你好', config, '你好呀')
assert(mem.getChannelMemory('u1').length === 2, '首轮对话保留 2 条')

fakeNow = minutes(30)
mem.updateChannelMemory(session('u1', 'c1'), '还在吗', config, '在的')
assert(mem.getChannelMemory('u1').length === 4, '30 分钟后的新对话续期并追加')

fakeNow = minutes(80)
mem.updateChannelMemory(session('u1', 'c1'), '等我一下', config, '好的')
assert(mem.getChannelMemory('u1').length === 6, '80 分钟时距上次发言 50 分钟，上下文仍在')

fakeNow = minutes(151)
assert(mem.getChannelMemory('u1').length === 0, '静默 71 分钟后上下文被懒清空')

// ---------- 场景 2：主动消息不续期 ----------
fakeNow = 0
const mem2 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem2.updateChannelMemory(session('u2', 'c2'), '早上好', config, '早上好')
fakeNow = minutes(10)
mem2.recordAssistant(session('u2', 'c2'), '今天的日记写好了', config)
assert(mem2.getChannelMemory('u2').length === 3, '主动消息写入短期记忆')
fakeNow = minutes(61)
assert(mem2.getChannelMemory('u2').length === 0, '主动消息不续期：仍在首次发言 61 分钟后清空')

// ---------- 场景 3：sweep 只清过期作用域 ----------
fakeNow = 0
const mem3 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem3.updateChannelMemory(session('a', 'ca'), 'hi', config, 'hi')
fakeNow = minutes(30)
mem3.updateChannelMemory(session('b', 'cb'), 'hi', config, 'hi')
fakeNow = minutes(70)
assert(mem3.sweep() === 1, 'sweep 清掉 a，保留 b')
assert(mem3.getScopeCount() === 1, 'sweep 后只剩 1 个作用域')

// ---------- 场景 4：群聊环境不参与 TTL ----------
fakeNow = 0
const mem4 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem4.updateChannelMemory(session('u1', 'c4'), '群里说话', config, '收到')
mem4.sweep()
fakeNow = minutes(61)
assert(mem4.getChannelMemory('u1').length === 0, '对话记忆已清空')
const ambient = mem4.getChannelDialogue(session('u1', 'c4'), config)
assert(ambient.includes('群里说话'), '群聊环境仍然保留')

// ---------- 场景 5：TTL 关闭时不清理 ----------
fakeNow = 0
const mem5 = new ShortTermMemory({} as any, { ttlMs: 0, now })
mem5.updateChannelMemory(session('u1', 'c5'), '你好', config, '你好')
fakeNow = minutes(10_000)
assert(mem5.getChannelMemory('u1').length === 2, 'ttlMs=0 时上下文永不过期')

// ---------- 场景 6：沉默后第一次发言不继承旧上下文 ----------
fakeNow = 0
const mem6 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem6.updateChannelMemory(session('u1', 'c6'), '第一轮', config, '收到')
fakeNow = minutes(90)
mem6.updateChannelMemory(session('u1', 'c6'), '回来了', config, '欢迎回来')
assert(mem6.getChannelMemory('u1').length === 2, '过期后直接写入也只保留新的一轮')

// ---------- 场景 7：bot 自己的随机插话以「昵称（你）」进入群聊环境 ----------
fakeNow = 0
const mem7 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem7.updateChannelDialogue(session('u1', 'c7'), '刚看到一本新书', '觉大人（你）', config)
const selfLine = mem7.getChannelDialogue(session('u1', 'c7'), config)
assert(selfLine.includes('"觉大人（你）" 说: 刚看到一本新书'), '自发发言按群友格式记录在群聊环境')

// ---------- 场景 8：随机插话的群聊记录顺序 = 触发消息 → bot 发言 ----------
fakeNow = 0
const mem8 = new ShortTermMemory({} as any, { ttlMs: minutes(60), now })
mem8.updateChannelDialogue(session('u1', 'c8', '群友'), '今天在整理藏书', '群友', config)
mem8.updateChannelDialogue(session('u1', 'c8'), '藏书又乱了', '觉大人（你）', config)
const ordered = mem8.getChannelDialogue(session('u1', 'c8'), config)
assert(
  ordered.indexOf('"群友" 说: 今天在整理藏书') < ordered.indexOf('"觉大人（你）" 说: 藏书又乱了'),
  '群聊记录里触发消息排在 bot 发言之前',
)

console.log('ALL PASS')

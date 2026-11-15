// 群聊记忆切块测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-group-blocks.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：群聊按时间块切分，切块不花模型调用；过短和过长的发言被过滤；
// 归档输入里的发言人只由消息的 kind 决定，不从内容里猜。
import {
  GROUP_GAP_MS, GROUP_MAX_MESSAGES, GROUP_MIN_BLOCK_MESSAGES, compressGroupRows, selectGroupBlock,
} from '../src/memory/group'
import { formatGroupRows } from '../src/memory/summarizer'
import {
  buildGroupArchivePrompt, buildGroupProfilePrompt, buildGroupSummaryPrompt,
} from '../src/memory/prompts'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

const tz = 8
const at = (minute: number) => new Date(Date.UTC(2026, 10, 14, 12, minute))
const dayEnd = new Date(at(0).getTime() + 86_400_000)
let nextId = 0

const msg = (
  minute: number,
  text: string,
  name = '灵梦',
  kind = 'ambient',
) => ({
  id: ++nextId,
  scopeId: 'g:123',
  userId: kind === 'ambient-bot' ? 'self' : `u:${name}`,
  username: name,
  kind,
  userContent: text,
  aiContent: '',
  createdAt: at(minute),
})

// ---------- 场景 1：间隔超过阈值就断开 ----------
{
  const rows = [msg(0, '第一句话'), msg(5, '第二句话'), msg(40, '第三句话')]
  const { block, closed } = selectGroupBlock(rows, dayEnd, at(60))
  assert(block.length === 2, `间隔 35 分钟处断开，只取前两条（实际 ${block.length}）`)
  assert(closed, '后面还有消息，说明这块已经闭合')
}

// ---------- 场景 2：块内条数上限 ----------
{
  const rows = Array.from({ length: 5 }, (_, i) => msg(i, `消息${i}`))
  const { block, closed } = selectGroupBlock(rows, dayEnd, at(10), { maxMessages: 3 })
  assert(block.length === 3, '到条数上限立即断开')
  assert(closed, '到上限的块可以立即归档')
}

// ---------- 场景 3：块内跨度上限 ----------
{
  const rows = [msg(0, '第一句话'), msg(100, '第二句话'), msg(200, '第三句话')]
  const { block } = selectGroupBlock(rows, dayEnd, at(240), {
    gapMs: 3 * 3_600_000,
    maxSpanMs: 2 * 3_600_000,
  })
  assert(block.length === 2, '跨度超过 2 小时后断开')
}

// ---------- 场景 4：还在沉默阈值内的尾巴不能归档 ----------
{
  const rows = [msg(0, '第一句话')]
  const open = selectGroupBlock(rows, dayEnd, at(5))
  assert(!open.closed, '沉默未满 20 分钟，块还可能继续变长')

  const settled = selectGroupBlock(rows, dayEnd, at(25))
  assert(settled.closed, '沉默满 20 分钟后闭合')
}

// ---------- 场景 5：不足最小条数时跨过沉默继续攒 ----------
{
  const rows = [msg(0, '第一句话'), msg(5, '第二句话'), msg(40, '第三句话')]
  const small = selectGroupBlock(rows, dayEnd, at(60), { minMessages: 10 })
  assert(small.block.length === 3, '不足 10 条时沉默间隔不作为断点，继续往后攒')
  assert(!small.closed, '没攒够、当天也没结束时不归档')

  const settledMany = Array.from({ length: 12 }, (_, i) => msg(i, `消息${i + 1}`))
  const enough = selectGroupBlock(settledMany, dayEnd, at(35), { minMessages: 10 })
  assert(enough.closed, '攒够最小条数且沉默满 20 分钟后才闭合')
}

// ---------- 场景 6：跨过日界线就闭合 ----------
{
  const rows = [msg(0, '第一句话')]
  const { closed } = selectGroupBlock(rows, dayEnd, new Date(dayEnd.getTime() + 60_000))
  assert(closed, '这一天已经结束，块闭合')

  const few = selectGroupBlock(rows, dayEnd, new Date(dayEnd.getTime() + 60_000), { minMessages: 10 })
  assert(few.closed, '日结束时连接不足最小条数的块也会闭合，但由调用方跳过而不归档')
}

// ---------- 场景 7：抽取式压缩 ----------
{
  const rows = [
    msg(0, '草'),
    msg(1, '今天天气不错'),
    msg(2, '我们去吃饭吧'),
    msg(3, 'x'.repeat(201)),
    msg(4, '换个话题'),
  ]
  const out = compressGroupRows(rows)
  assert(out.length === 1, `同一人的连续发言合并成一条（实际 ${out.length} 条）`)
  assert(
    out[0].userContent === '今天天气不错；我们去吃饭吧；换个话题',
    '过短与过长的发言被丢掉，其余内容按顺序保留',
  )
  assert(!out.some(row => row.userContent.includes('xxxx')), '超过 200 字的发言不进入归档')
  assert(!out.some(row => row.userContent.includes('草')), '过短的发言不进入归档')
}

// ---------- 场景 8：不同的人不会被合并 ----------
{
  const out = compressGroupRows([
    msg(0, '第一句话', '灵梦'),
    msg(1, '第二句话', '魔理沙'),
  ])
  assert(out.length === 2, '不同发言人各自保留一行')
}

// ---------- 场景 9：发言人只由 kind 决定 ----------
{
  const text = formatGroupRows([
    msg(0, '今天天气不错', '灵梦'),
    msg(1, '嗯，确实', '', 'ambient-bot'),
    msg(2, '觉：我们走吧', '魔理沙'),
  ], tz)
  const lines = text.split('\n')
  assert(lines[0].includes('用户（灵梦）说「今天天气不错」'), '群友发言带昵称标签')
  assert(lines[1] === '[2026/11/14 20:01] AI说「嗯，确实」', '机器人发言用固定标签 AI')
  assert(lines[2].includes('用户（魔理沙）说「觉：我们走吧」'), '内容里的「觉：」不会把发言人换成机器人')
  assert(!lines.some(line => line.includes('] 觉')), '内容里的名字不会变成发言人标签')
}

// ---------- 场景 10：提示词 ----------
{
  const archive = buildGroupArchivePrompt('对话').map(item => item.content).join('\n')
  assert(archive.includes('只有标签决定谁在说话'), '群归档提示词声明标签是唯一判据')
  assert(archive.includes('group_state'), '群归档输出群状态而不是用户状态')
  assert(archive.includes('这是群聊，不是一对一对话'), '群归档提示词说明记忆对象是整个群')

  const summary = buildGroupSummaryPrompt('day', '子记忆').map(item => item.content).join('\n')
  assert(summary.includes('群聊记忆'), '群汇总提示词面向群聊')
  assert(summary.includes('group_state'), '群汇总输出群状态')

  const profile = buildGroupProfilePrompt([], '材料').map(item => item.content).join('\n')
  assert(profile.includes('member:昵称'), '群画像用 member:昵称 作为稳定 key')
  assert(profile.includes('群友关系'), '群画像包含群友关系类别')
  assert(profile.includes('隐私信息'), '群画像禁止记录隐私信息')
}

// ---------- 场景 11：默认常量 ----------
{
  assert(GROUP_GAP_MS === 20 * 60_000, '默认沉默阈值 20 分钟')
  assert(GROUP_MAX_MESSAGES === 300, '默认单块上限 300 条')
  assert(GROUP_MIN_BLOCK_MESSAGES === 100, '默认单块最少 100 条才归档')
}

console.log('\n全部通过')
// 显式退出：esbuild-register / koishi 可能留下活动句柄，不退出会让脚本挂住
process.exit(0)

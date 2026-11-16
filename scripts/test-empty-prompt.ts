// 「只 @ 了 bot」这类空消息的回归测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-empty-prompt.ts
// 纯逻辑测试，不启动 Koishi、不连数据库。
//
// 要保证的事：
//   1. 只 @ bot 时保留 @ 的称呼，不把消息删成空串；
//   2. 保留下来的称呼不能被当成审查命中，否则每条只 @ 的消息都会按输入屏蔽词扣一档好感度。
import * as assert from 'assert'
import { EMPTY_PROMPT, hasCensorMark, processPrompt } from '../src/utils'

const BOT_ID = 'bot-1'
const BOT_NAME = '觉'

// ---------- 场景 1：只 @ bot ----------
const onlyAt = processPrompt(`<at id="${BOT_ID}" name="${BOT_NAME}"/>`, [BOT_NAME], [BOT_ID])
assert.strictEqual(onlyAt, BOT_NAME, '只 @ bot 时保留 @ 的称呼')
assert.strictEqual(hasCensorMark(onlyAt), false, '保留下来的称呼不能被当成审查命中')

// ---------- 场景 2：at 元素不带 name ----------
assert.strictEqual(
  processPrompt(`<at id="${BOT_ID}"/>`, [BOT_NAME], [BOT_ID]),
  BOT_NAME,
  'at 不带 name 时退回配置里的称呼',
)

// ---------- 场景 2b：群名片里带星号 ----------
const starryName = processPrompt(`<at id="${BOT_ID}" name="**${BOT_NAME}**"/>`, [BOT_NAME], [BOT_ID])
assert.strictEqual(starryName, BOT_NAME, '@ 的昵称同样剥掉星号')
assert.strictEqual(hasCensorMark(starryName), false, '昵称里的星号不能冒充审查命中')

// ---------- 场景 3：只喊昵称 ----------
// 只喊昵称时保留原样（避免把消息变成空串），同样不能算审查命中
assert.strictEqual(processPrompt(BOT_NAME, [BOT_NAME], [BOT_ID]), BOT_NAME, '只喊昵称时保留原样')
assert.strictEqual(hasCensorMark(processPrompt(BOT_NAME, [BOT_NAME], [BOT_ID])), false, '只喊昵称不扣好感度')

// ---------- 场景 4：@ bot 后还有正文 ----------
assert.strictEqual(
  processPrompt(`<at id="${BOT_ID}" name="${BOT_NAME}"/> 早上好`, [BOT_NAME], [BOT_ID]),
  '早上好',
  '称呼被去掉，正文保留',
)
assert.strictEqual(hasCensorMark('早上好'), false, '正常正文不命中')

// ---------- 场景 5：真正的审查命中仍然要被识别 ----------
assert.strictEqual(hasCensorMark('**'), true, '审查命中标记（屏蔽词整体被替换）')
assert.strictEqual(hasCensorMark('你好**啊'), true, '正文中间的审查命中标记')
assert.strictEqual(hasCensorMark(EMPTY_PROMPT), false, '兜底占位符不含星号')

// ---------- 场景 6：用户手打的 '**' 不会冒充审查命中 ----------
assert.strictEqual(processPrompt('**', [BOT_NAME], [BOT_ID]), EMPTY_PROMPT, '手打星号被剥离后走兜底占位符')
assert.strictEqual(hasCensorMark(processPrompt('**', [BOT_NAME], [BOT_ID])), false, '手打星号不扣好感度')

// ---------- 场景 7：没有任何称呼信息时才用兜底占位符 ----------
assert.strictEqual(processPrompt('   ', [BOT_NAME], [BOT_ID]), EMPTY_PROMPT, '纯空白走兜底占位符')

console.log('test-empty-prompt: 全部通过')

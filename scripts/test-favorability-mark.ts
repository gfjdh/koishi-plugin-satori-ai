// 好感度标记去重测试。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-favorability-mark.ts
//
// 要保证的事：被骚扰时模型会按提示词自己写「好感↓」，此时插件不再追加
// 重复的「(好感↓)」；输入屏蔽词的「(好感↓↓)」与上升标记照常追加。
import * as assert from 'assert'
import { shouldAppendFavorabilityMark } from '../src/favorability'

// ---------- 模型已经自己写了「好感↓」 ----------
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我……（好感↓）', '(好感↓)'),
  false,
  '输出屏蔽词触发时，模型已写「好感↓」就不再追加（好感↓）',
)
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我……（好感↓）', '(好感↓↓)'),
  true,
  '输入屏蔽词的（好感↓↓）保留，它表示用户的发言本身违规',
)
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我……(好感↓)', '(好感↓)'),
  false,
  '半角括号同样识别',
)
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我……好感↓', '(好感↓)'),
  false,
  '不带括号的「好感↓」同样识别',
)

// ---------- 模型没写，照常追加 ----------
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我', '(好感↓)'),
  true,
  '模型没写下降标记时插件照常追加',
)

// ---------- 上升标记不受影响 ----------
assert.strictEqual(
  shouldAppendFavorabilityMark('那你可得听我的（好感↑）', '(好感↑)'),
  true,
  '上升标记照常追加',
)
assert.strictEqual(
  shouldAppendFavorabilityMark('别碰我……（好感↓）', '(好感↑)'),
  true,
  '模型写了下降也不影响上升标记的追加',
)

// ---------- 没有标记 ----------
assert.strictEqual(shouldAppendFavorabilityMark('早上好', null), false, '没有标记时不追加')
assert.strictEqual(shouldAppendFavorabilityMark('早上好', ''), false, '空标记不追加')

console.log('test-favorability-mark: 全部通过')

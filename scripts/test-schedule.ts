// 觉的日程的脚本级验证。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-schedule.ts
// 用测试专用的日程内容，不读插件数据目录里的 schedule.json，改实际日程不会弄坏测试。
import * as fs from 'fs'
import * as path from 'path'
import { buildScheduleText, createExampleSchedule, loadScheduleFile, parseScheduleFile } from '../src/schedule'

const raw = {
  template: '你现在正在做的事：{activity}。',
  variationChance: 0.35,
  vars: {
    book: ['《甲》', '《乙》', '《丙》'],
    food: ['烤鱼', '炖菜'],
    pet: ['阿燐', '阿空'],
  },
  items: [
    {
      start: '08:00', end: '12:00',
      activities: ['在书房读{book}', '整理书架'],
      variations: ['{pet}把书页抓出了印子'],
    },
    {
      start: '12:00', end: '13:00',
      activities: ['在吃{food}'],
      variations: ['{food}还热着'],
    },
    { start: '23:00', end: '01:00', activities: ['睡前看书'] },
    { days: ['周六'], start: '09:00', end: '10:00', activities: ['去旧书摊'] },
  ],
}

const file = parseScheduleFile(raw)!
const at = (date: string, time: string) => new Date(`${date}T${time}:00+08:00`)

const text = (date: string, time: string, extra: Record<string, any> = {}) =>
  buildScheduleText({ file, timezoneOffset: 8, now: () => at(date, time), ...extra })

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

// ---------- 场景 1：同一时段内文本逐字节相同 ----------
const friday10 = text('2026-11-13', '10:00')
const friday1045 = text('2026-11-13', '10:45')
assert(friday10 === friday1045, '同一时段内不同分钟得到完全相同的日程文本')

// ---------- 场景 2：起止时间精确到分钟 ----------
assert(text('2026-11-13', '11:59') !== text('2026-11-13', '12:00'), '跨过结束时间后切换到下一条日程')
assert(text('2026-11-13', '12:00').includes('在吃'), '12:00 命中午饭时段')

// ---------- 场景 3：跨午夜的条目 ----------
assert(text('2026-11-14', '00:30').includes('睡前看书'), '00:30 仍命中前一天的跨午夜条目')
assert(text('2026-11-13', '23:30').includes('睡前看书'), '23:30 命中跨午夜条目的前半段')

// ---------- 场景 4：星期限定的条目优先 ----------
assert(text('2026-11-14', '09:30').includes('旧书摊'), '周六命中只属于周六的日程')
assert(!text('2026-11-13', '09:30').includes('旧书摊'), '周五不会命中周六的日程')

// ---------- 场景 5：没有条目命中的时段不注入 ----------
assert(text('2026-11-13', '14:00') === null, '没有条目命中的时段返回 null，不注入日程')

// ---------- 场景 6：小插曲按概率出现，且当天固定 ----------
const noVariation = text('2026-11-13', '10:00', { file: { ...file, variationChance: 0 } })
const alwaysVariation = text('2026-11-13', '10:00', { file: { ...file, variationChance: 1 } })
assert(!noVariation.includes('把书页抓出了印子'), '概率为 0 时不出现小插曲')
assert(alwaysVariation.includes('把书页抓出了印子'), '概率为 1 时出现小插曲')
assert(
  alwaysVariation === text('2026-11-13', '10:45', { file: { ...file, variationChance: 1 } }),
  '小插曲在同一时段内固定不变',
)

// ---------- 场景 7：变量替换，同一时段内固定 ----------
const lunch = text('2026-11-13', '12:30', { file: { ...file, variationChance: 1 } })
assert(!lunch.includes('{'), '变量占位符全部被替换')
const food = ['烤鱼', '炖菜'].find(item => lunch.includes(item))
assert(!!food, '午饭活动用变量池里的食物')
assert(lunch.split('\n')[1] === `${food}还热着。`, '同一时段内活动与插曲里的 {food} 取同一个值')

// ---------- 场景 8：变量缺失时按空字符串处理，只告警一次 ----------
let warnings = 0
const unknown = buildScheduleText({
  file: parseScheduleFile({ items: [{ start: '08:00', end: '09:00', activities: ['读{missing}'] }] })!,
  timezoneOffset: 8,
  now: () => at('2026-11-13', '08:30'),
  warn: () => warnings++,
})
assert(unknown.includes('读。'), '缺失的变量被替换为空字符串，不影响其余文字')
assert(warnings === 1, '同一个缺失变量只告警一次')

// ---------- 场景 9：自定义句式与说明 ----------
assert(
  text('2026-11-13', '10:00', { file: { ...file, template: '此刻：{activity}' } }).startsWith('此刻：'),
  '自定义 template 生效',
)
assert(text('2026-11-13', '10:00').includes('如果与用户没有具体的互动'), '默认 hint 会跟在日程后面')
assert(
  text('2026-11-13', '10:00', { file: { ...file, hint: '按计划去做就好。' } }).endsWith('按计划去做就好。'),
  '自定义 hint 生效',
)

// ---------- 场景 10：没有配置条目时不注入 ----------
assert(buildScheduleText({ file: { ...file, items: [] }, timezoneOffset: 8 }) === null, '没有日程条目时返回 null')

// ---------- 场景 11：空 days / 空 end 等同省略 ----------
const normalized = parseScheduleFile({
  items: [{ start: '06:00', end: '', days: [], activities: ['睡觉'] }],
})!
assert(
  buildScheduleText({ file: normalized, timezoneOffset: 8, now: () => at('2026-11-13', '22:00') })?.includes('睡觉'),
  '空 days 视为每天、空 end 视为到当天结束',
)

// ---------- 场景 12：变量简介一起注入 ----------
const noted = parseScheduleFile({
  items: [{ start: '08:00', end: '13:00', activities: ['在读{book}'] }],
  vars: { book: [{ text: '《乙》', note: '一本讲梦的书。' }] },
})!
const notedText = buildScheduleText({ file: noted, timezoneOffset: 8, now: () => at('2026-11-13', '09:00') })
assert(notedText.includes('《乙》：一本讲梦的书。'), '变量的 note 会作为补充信息一起注入')

// ---------- 场景 13：内置示例本身是合法的 ----------
const example = parseScheduleFile(createExampleSchedule())
assert(!!example && example.items.length > 0, '内置示例能解析出日程条目')
assert(
  !!buildScheduleText({ file: example, timezoneOffset: 8, now: () => at('2026-11-13', '09:00') }),
  '内置示例能正常生成日程文本',
)

// ---------- 场景 14：缺少文件时自动写入示例 ----------
const dir = path.join('.scratch', 'schedule-test')
fs.rmSync(dir, { recursive: true, force: true })
const loaded = loadScheduleFile(dir)
assert(!!loaded && loaded.items.length > 0, '缺少日程文件时自动写入示例并加载')
assert(fs.existsSync(path.join(dir, 'schedule.json')), '示例文件已落盘')

console.log('ALL PASS')

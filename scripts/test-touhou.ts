// 东方角色匹配测试（纯逻辑，不连数据库）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-touhou.ts
//
// 要保证的事：特征明显的描述能命中对应角色；无关描述不产生候选；
// 候选说明的格式固定。
import {
  buildCharacterNote, buildMatchQuery, extractFeatureLines, getTouhouCharacters, loadTouhouCharacters,
  matchCharacters, summarizeAppearance, TOUHOU_CHARACTERS_FILE,
} from '../src/touhou'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const assert = (cond: any, message: string) => {
  if (!cond) {
    console.error(`FAIL: ${message}`)
    process.exit(1)
  }
  console.log(`ok: ${message}`)
}

// ---------- 场景 1：特征明显的描述命中对应角色 ----------
{
  const reimu = matchCharacters('一位黑发红眼的巫女，头戴红色大蝴蝶结，身穿红白配色的巫女服，手里拿着御币。')
  assert(reimu[0]?.name === '博丽灵梦', `红白巫女命中博丽灵梦（实际 ${reimu[0]?.name}）`)

  const sanae = matchCharacters('绿发少女穿着蓝白配色的露腋巫女服，头顶有青蛙发饰，手里拿着御币。')
  assert(sanae[0]?.name === '东风谷早苗', `蓝白巫女命中东风谷早苗（实际 ${sanae[0]?.name}）`)

  const sakuya = matchCharacters('银发女性穿着黑白女仆装，头戴白色女仆帽，胸前有绿色领结，手里端着托盘。')
  assert(sakuya[0]?.name === '十六夜咲夜', `黑白女仆命中十六夜咲夜（实际 ${sakuya[0]?.name}）`)
}

// ---------- 场景 2：无关描述不给候选 ----------
{
  const none = matchCharacters('一张手绘的风景画，有山和河流，天空中有云。')
  assert(none.length === 0, `无关描述不产生候选（实际 ${none.map(m => m.name).join('、')}）`)

  assert(matchCharacters('').length === 0, '空描述不产生候选')
  assert(matchCharacters('一个粉发女孩。').length === 0, '特征太少的短描述不产生候选')
}

// ---------- 场景 3：候选数量与格式 ----------
{
  const matches = matchCharacters('绿发黑帽，帽上有黄色大蝴蝶结和红色心形饰品，穿着黄色上衣。')
  assert(matches.length > 0 && matches.length <= 3, '候选数量在 1~3 之间')
  assert(matches.every(m => m.score > 0), '候选都有正的匹配分')
  assert(matches.every(m => m.summary.length > 0), '候选都带外观摘要')

  const note = buildCharacterNote([{
    name: '博丽灵梦', aliases: ['灵梦'], score: 30, summary: '黑发，黑色或棕色眼瞳，红色巫女服',
  }])
  assert(
    note === '[角色候选：博丽灵梦（黑发，黑色或棕色眼瞳，红色巫女服）]'
      + '（按识图描述检索，仅供参考；候选特征与图中对不上就忽略，不要仅凭候选否定用户说的角色）',
    '候选说明带外观摘要且格式固定',
  )
  assert(buildCharacterNote([{ name: '无资料角色', aliases: [], score: 20, summary: '' }]) === '[角色候选：无资料角色]'
    + '（按识图描述检索，仅供参考；候选特征与图中对不上就忽略，不要仅凭候选否定用户说的角色）', '没有摘要时只给名字')
  assert(buildCharacterNote([]) === '', '没有候选时不输出说明')
}

// ---------- 场景 3.5：摘要取发色/瞳色/标志物 ----------
{
  const koishi = getTouhouCharacters().find(character => character.name === '古明地恋')!
  const summary = summarizeAppearance(koishi.appearance, koishi.name)
  assert(summary.includes('浅绿'), `摘要带发色（实际 ${summary}）`)
  assert(summary.includes('第三只眼'), `摘要带标志物（实际 ${summary}）`)
  assert(!summary.startsWith('恋有着'), '摘要去掉开头的角色名')
  assert(summary.length <= 80, `摘要不超过 80 字（实际 ${summary.length}）`)

  const yuyuko = getTouhouCharacters().find(character => character.name === '西行寺幽幽子')!
  assert(summarizeAppearance(yuyuko.appearance, yuyuko.name).includes('粉色短发'),
    '发型行不会被身高/年龄的设定行抢走')
  assert(summarizeAppearance('暂无相关资料') === '', '没有资料时不生成摘要')
}

// ---------- 场景 3.6：检索查询只取特征行 + 用户正文 ----------
{
  // 线上真实案例：识图描述把恋恋的第三只眼写成「紫色线条、紫色球体」，
  // 整段描述去检索会排到 12 名开外，特征行 + 用户正文才能命中。
  const description = [
    '图1：一位浅绿卷发少女，右手抬到脑后，歪头微笑看向前方，绿色眼睛。',
    '穿墨绿色短袖T恤，胸前可见白色字母“MULIIKER”；下穿深灰蓝色百褶裙，裙摆有白色条纹，斜挎黑色单肩包。',
    '头发右侧有蓝色小蝴蝶结，周围缠绕紫色线条，线端连接紫色球体，左上有音符气泡。背景为浅蓝色花纹边框。',
    '特征：浅绿发、微卷中长发、绿瞳、墨绿T恤与深灰百褶裙、蓝色蝴蝶结。',
  ].join('\n')

  const features = extractFeatureLines(description)
  assert(features.startsWith('特征：浅绿发') && !features.includes('MULIIKER'), '只抽特征行')
  assert(extractFeatureLines('没有特征行') === '', '没有特征行时返回空串')

  const query = buildMatchQuery(description, '看这个恋恋')
  assert(query.startsWith('特征：浅绿发') && query.endsWith('看这个恋恋'), '检索查询带特征行和用户正文')
  assert(matchCharacters(query)[0]?.name === '古明地恋', `特征行 + 用户正文命中古明地恋（实际 ${matchCharacters(query)[0]?.name}）`)

  const noFeatures = buildMatchQuery('一位浅绿卷发少女，绿色眼睛。', '')
  assert(noFeatures === '一位浅绿卷发少女，绿色眼睛。', '没有特征行时退回整段描述')
}

// ---------- 场景 4：从 dataDir 的 JSON 加载角色库 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'touhou-'))
  const file = join(dir, TOUHOU_CHARACTERS_FILE)

  assert(loadTouhouCharacters(dir).length === 176, '首次加载写出默认角色库')
  assert(existsSync(file), '默认 JSON 已写入 dataDir')

  writeFileSync(file, JSON.stringify([{
    name: '测试角色',
    alias: ['测试'],
    appearance: '红色短发，蓝色眼睛，白色连衣裙',
    introduction: '测试用',
    abilities: '',
  }]), 'utf8')
  assert(loadTouhouCharacters(dir).length === 1, '加载用户自定义角色库')
  assert(matchCharacters('红色短发，蓝色眼睛，白色连衣裙')[0]?.name === '测试角色', '匹配使用自定义角色库')

  writeFileSync(file, '{bad json', 'utf8')
  assert(loadTouhouCharacters(dir).length === 176, '解析失败退回内置默认值')
  assert(readFileSync(file, 'utf8') === '{bad json', '解析失败不覆盖用户文件')

  // 恢复默认，避免影响后续用例
  loadTouhouCharacters(mkdtempSync(join(tmpdir(), 'touhou-')))
  assert(getTouhouCharacters().length === 176, '恢复默认角色库')
}

console.log('\n全部通过')

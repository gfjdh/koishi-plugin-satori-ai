// 角色识别测试（纯逻辑，不连数据库）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-characters.ts
//
// 要保证的事：特征明显的描述能命中对应角色；无关描述不产生候选；
// 候选说明的格式固定；词表和角色库都从 JSON 读取。
import {
  buildCharacterNote, buildCharacterNoteFromGroups, buildMatchQuery, CHARACTER_GROUP_MIN_SCORE, CHARACTER_IDENTITY_RULE,
  CHARACTER_MAX_GROUPS, CHARACTERS_FILE, extractFeatureGroups, extractFeatureLines, findSignatures,
  getCharacters, LEGACY_CHARACTERS_FILE, loadCharacters, matchCharacterGroups, matchCharacters, stripTransientFeatures,
  summarizeAppearance,
} from '../src/character-recognition'
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

  const tail = '（这些是按识图描述检索出的猜测，按可能性从高到低排列。'
    + '第一个候选吻合就用第一个，不要因为服装不同改选后面的。'
    + '没有候选、或候选和描述都对不上的角色，直接说认不出来，绝对不要凭记忆或印象编一个名字；'
    + '候选本身也只是猜测，不要把猜测说成确定答案，也不要仅凭候选否定用户说的角色）'
  const note = buildCharacterNote([{
    name: '博丽灵梦', aliases: ['灵梦'], score: 30, summary: '黑发，黑色或棕色眼瞳，红色巫女服',
  }])
  assert(
    note === `[角色候选：博丽灵梦（黑发，黑色或棕色眼瞳，红色巫女服）]${tail}`,
    '候选说明带外观摘要且格式固定',
  )
  assert(buildCharacterNote([{ name: '无资料角色', aliases: [], score: 20, summary: '' }]) === `[角色候选：无资料角色]${tail}`,
    '没有摘要时只给名字')
  assert(buildCharacterNote([]) === '', '没有候选时不输出说明')
}

// ---------- 场景 3.5：摘要取发色/瞳色/标志物 ----------
{
  const koishi = getCharacters().find(character => character.name === '古明地恋')!
  const summary = summarizeAppearance(koishi.appearance, koishi.name)
  assert(summary.includes('浅绿'), `摘要带发色（实际 ${summary}）`)
  assert(summary.includes('第三只眼'), `摘要带标志物（实际 ${summary}）`)
  assert(!summary.startsWith('恋有着'), '摘要去掉开头的角色名')
  assert(summary.length <= 120, `摘要不超过 120 字（实际 ${summary.length}）`)

  const yuyuko = getCharacters().find(character => character.name === '西行寺幽幽子')!
  const yuyukoSummary = summarizeAppearance(yuyuko.appearance, yuyuko.name)
  assert(yuyukoSummary.includes('粉色') && yuyukoSummary.includes('短发'),
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

// ---------- 场景 3.7：多角色图按角色分别检索 + 发色冲突过滤 ----------
{
  // 线上真实误认案例（2026-11-18 14:51）：粉发角色旁边是浅金发戴帽的角色，
  // 整段描述检索会把金色短发的秋穰子排到第一，主模型照抄成「旁边那个是秋穰子」。
  const description = [
    '图1：画面中央是一个粉色短发的角色，正趴在桌面上闭眼睡觉，头枕着双臂。画面左侧另有一个浅金色头发的角色，戴着帽子，绿瞳。',
    '特征：粉发、短发、闭眼、蓝色荷叶边长袖衣、黑色发带带黄色爱心装饰。',
    '图2：画面中央同样是粉色短发的角色趴在桌上，脸上戴着粉色睡眠眼罩。',
    '特征：粉发、短发、粉色圈圈眼眼罩、蓝色荷叶边长袖衣、黑色发带带黄色爱心装饰。',
  ].join('\n')

  const groups = extractFeatureGroups(description)
  assert(groups.length === 2, `多角色描述拆成两组特征（实际 ${groups.length}）`)
  assert(groups[0].startsWith('粉发') && !groups[0].includes('特征'), '特征组去掉「特征N：」前缀')

  const candidates = matchCharacterGroups(description, '觉大人这图里是谁')
  const names = candidates.flatMap(group => group.matches.map(match => match.name))
  assert(names.includes('古明地觉'), `粉发角色命中古明地觉（实际 ${names.join('、') || '无'}）`)
  assert(!names.includes('秋穰子'), `发色对不上的秋穰子不进候选（实际 ${names.join('、') || '无'}）`)

  const note = buildCharacterNoteFromGroups(candidates)
  assert(!note.includes('秋穰子'), '候选说明里不再出现秋穰子')
  assert(note === '' || note.includes('图中角色') || candidates.length === 1, '多角色候选按角色分组说明')
  assert(buildCharacterNoteFromGroups([]) === '', '没有候选时不输出说明')

  // 直接检索也要挡住发色冲突
  const direct = matchCharacters('粉发、短发、闭眼、蓝色荷叶边长袖衣、黑色发带带黄色爱心装饰')
  assert(!direct.some(match => match.name === '秋穰子'), '粉发描述不返回金色短发的秋穰子')
}

// ---------- 场景 3.8：没有特征行时退回整段描述 ----------
{
  assert(extractFeatureGroups('一张没有特征行的描述').length === 0, '没有特征行时分组为空')
  const groups = matchCharacterGroups('一位黑发红眼的巫女，头戴红色大蝴蝶结，身穿红白配色的巫女服，手里拿着御币。', '')
  assert(groups[0]?.matches[0]?.name === '博丽灵梦', `退回整段描述仍能命中（实际 ${groups[0]?.matches[0]?.name}）`)
}

// ---------- 场景 3.9：多角色图的线上失败样式 ----------
{
  // 模型常给特征行加位置标注；解析不了会整段回退，多角色全混成一组
  const positioned = [
    '图1：左边一个黑发红瞳的巫女，右边一个金发红瞳的魔法使。',
    '特征1（左）：黑发、长发、红瞳、红白巫女服、红色大蝴蝶结。',
    '特征2（右）：金发、长发、红瞳、黑白魔法使服装、黑色女巫帽、手持扫帚。',
  ].join('\n')
  const positionedGroups = extractFeatureGroups(positioned)
  assert(positionedGroups.length === 2, `带位置括号的特征行也能拆组（实际 ${positionedGroups.length}）`)
  const positionedMatches = matchCharacterGroups(positioned, '这两个是谁')
  assert(positionedMatches[1]?.matches[0]?.name === '雾雨魔理沙',
    `带位置括号时右侧角色仍能命中（实际 ${positionedMatches[1]?.matches[0]?.name}）`)

  // 用户正文里的「都有谁」不在角色库里，不能把命中门槛抬高到把正确角色筛掉
  const maid = '银发、女仆装、蓝瞳、白色女仆帽、绿色领结。'
  assert(matchCharacters(maid)[0]?.name === '十六夜咲夜', '银发女仆装命中十六夜咲夜')
  assert(matchCharacters(`${maid} 这图里都有谁`)[0]?.name === '十六夜咲夜',
    `拼上用户正文后仍命中十六夜咲夜（实际 ${matchCharacters(`${maid} 这图里都有谁`)[0]?.name}）`)

  // 三人合照：每个角色各自一组候选，不能因为去重把后面的角色整组挤掉
  const trio = [
    '特征1：绿发、短发、红瞳、蓝白露腋巫女服、青蛙发饰。',
    '特征2：银发、女仆装、蓝瞳、白色女仆帽、绿色领结。',
    '特征3：紫发、长发、紫瞳、紫色连衣裙、红色发带。',
  ].join('\n')
  const trioGroups = matchCharacterGroups(trio, '都有谁')
  assert(trioGroups.length === 3, `三人合照拆成三组候选（实际 ${trioGroups.length}）`)
  assert(trioGroups[0]?.matches[0]?.name === '东风谷早苗', '绿发巫女命中东风谷早苗')
  assert(trioGroups[1]?.matches[0]?.name === '十六夜咲夜',
    `银发女仆命中十六夜咲夜（实际 ${trioGroups[1]?.matches[0]?.name}）`)
  assert(trioGroups.every(group => group.matches.length > 0), '每组都给出候选')
}

// ---------- 场景 3.10：六人合照（线上真实阵容，从左到右） ----------
{
  // 识图模型对真实图片的输出（2026-11-19，生产模型 deepseek-v4-1-flash-economy 关闭思考后）
  // 真实阵容：圣白莲、魔理沙、灵梦、早苗、铃仙、咲夜，均穿同款深蓝色连体泳衣
  const lineup = [
    '特征1：紫色长发、齐刘海、黄色瞳孔、深蓝色连体泳衣、无头饰、无标志物。',
    '特征2：金色长发、侧编麻花辫、绿色瞳孔、深蓝色连体泳衣、紫色蝴蝶结发饰、无标志物。',
    '特征3：黑色短发、红色大蝴蝶结、红色瞳孔、深蓝色连体泳衣、红色蝴蝶结、无标志物。',
    '特征4：绿色长发、齐刘海、绿色瞳孔、深蓝色连体泳衣、绿色发饰、手持绿色物品。',
    '特征5：粉紫色长发、粉色瞳孔、深蓝色连体泳衣、白色兔耳发饰、无标志物。',
    '特征6：银白色短发、蓝色瞳孔、深蓝色连体泳衣、白色女仆头饰、绿色蝴蝶结发饰。',
  ].join('\n')
  const expected = ['圣白莲', '雾雨魔理沙', '博丽灵梦', '东风谷早苗', '铃仙·优昙华院·因幡', '十六夜咲夜']
  const groups = matchCharacterGroups(lineup, '你看这是谁')
  assert(groups.length === 6, `六人合照六组都有候选（实际 ${groups.length}）`)
  groups.forEach((group, index) => {
    assert(group.matches.some(match => match.name === expected[index]),
      `第 ${index + 1} 个角色的候选包含 ${expected[index]}（实际 ${group.matches.map(m => m.name).join('、')}）`)
  })
  // 信号最强的两个角色应该直接排第一：咲夜（银发+女仆头饰+蓝瞳）、魔理沙（金发+麻花辫+紫蝴蝶结）
  assert(groups[5]?.matches[0]?.name === '十六夜咲夜', '银白短发+女仆头饰直接命中十六夜咲夜')
  assert(groups[1]?.matches[0]?.name === '雾雨魔理沙', '金发+麻花辫+紫色蝴蝶结直接命中雾雨魔理沙')
  // 短特征行词少分低，靠外观字段加分也要够格进候选
  assert(matchCharacters('银发、蓝瞳、女仆装、女仆帽。')[0]?.name === '十六夜咲夜',
    '稀疏的银发女仆行仍命中十六夜咲夜')
}

// ---------- 场景 3.11：漫画多格/模型复读与超多角色 ----------
{
  // 线上真实故障：说明行「特征：图中共有多个角色，按从左到右编号：」被当成一个角色，
  // 同一角色在多个格子重复出现时特征行重复几十遍
  const withHeader = [
    '特征：图中共有多个角色，按从左到右、从上到下编号：',
    '特征1：黑发，长发，红瞳，裸体，无头饰，无标志物。',
    '特征2：黑发，长发，红瞳，裸体，无头饰，无标志物。',
    '特征3：金发，短发，蓝瞳，戴黑帽，无标志物。',
  ].join('\n')
  const groups = extractFeatureGroups(withHeader)
  assert(groups.length === 2, `说明行被过滤且重复特征合并（实际 ${groups.length}）`)
  assert(groups[0].startsWith('黑发') && groups[1].startsWith('金发'), '保留不同角色的特征')

  // 角色数超过上限时只取前 8 组，候选说明不能无限长
  const colors = ['黑发', '金发', '银发', '绿发', '紫发', '棕发', '白发', '蓝发', '红发', '粉发', '灰发', '青发']
  const many = colors.map((hair, i) => `特征${i + 1}：${hair}长发，红瞳，穿深蓝色连体泳衣。`).join('\n')
  assert(extractFeatureGroups(many).length === 12, '12 个不同角色全部解析出来')
  const matched = matchCharacterGroups(many, '')
  assert(matched.length <= CHARACTER_MAX_GROUPS, `候选组数不超过 ${CHARACTER_MAX_GROUPS}（实际 ${matched.length}）`)
}

// ---------- 场景 3.12：组级最低线 ----------
{
  // 线上案例：识图把灵梦写成「深色长发、紫瞳」，检索只能给出 7.3 分的弱候选；
  // 低于最低线时宁可不给预选，让主模型直接说认不出来
  const weak = '深色长发，紫瞳，裸身披白色浴巾，无头饰，无标志物。'
  assert(matchCharacterGroups(weak, '').length === 0, '弱匹配不提供预选')
  const strong = '银白色短发，蓝色瞳孔，深蓝色连体泳衣，白色女仆头饰，绿色蝴蝶结发饰。'
  const strongGroups = matchCharacterGroups(strong, '')
  assert(strongGroups[0]?.matches[0]?.name === '十六夜咲夜', '强匹配正常给出候选')
  assert(strongGroups[0].matches[0].score >= CHARACTER_GROUP_MIN_SCORE, '给出的候选分数不低于最低线')
}

// ---------- 场景 3.13：同人图改发色时靠标志物认人 ----------
{
  // 线上案例：恋恋被画成银白短发，发色和档案里的浅绿发冲突被硬过滤；
  // 「蓝色线缆连接深色毛球」是第三只眼的同义写法，应能绕过发色冲突并直接锁定
  const koishiFanart = '特征1：银白色短发、黄绿色瞳、戴黑色宽檐帽（帽上有浅色蝴蝶结）、穿米色带黑色荷叶边连衣裙、身侧有蓝色线缆连接深色毛球。'
  const groups = matchCharacterGroups(koishiFanart, '')
  assert(groups[0]?.matches[0]?.name === '古明地恋',
    `银白发恋恋靠第三只眼命中（实际 ${groups[0]?.matches.map(match => match.name).join('、') || '无'}）`)

  // 通用规则：独特标志物（角色库里很少见）都能绕过发色冲突，不只是第三只眼
  const bunny = matchCharacters('黑色短发、红色瞳、白色兔耳、白衬衫红领带。')
  assert(bunny.some(match => match.name === '铃仙·优昙华院·因幡'), '兔耳是独特标志，发色不对也能进候选')

  // 常见标志物（翅膀有十几个角色）只加分，不绕过发色冲突：
  // 黑发有翅膀的封兽鵺不能因为「翅膀」混进银白发的候选里
  const wings = matchCharacters('银白色短发、蓝色瞳、背后有翅膀、白色连衣裙。')
  assert(!wings.some(match => match.name === '封兽鵺'), '常见标志物不会绕过发色冲突')
}

// ---------- 场景 3.14：特征行里的瞬时状态被清掉 ----------
{
  // 线上案例（2026-11-19 20:50）：识图模型无视提示词，把「闭眼」写进特征行；
  // 主模型又拿正文里的「睁眼/闭眼」当依据，开始怀疑正确的候选
  const description = [
    '图1：两名角色在户外近距离面对面，鼻尖相触，脸颊泛红。左侧角色闭眼，右侧角色睁眼，两人身体贴近。',
    '特征1：浅绿色短发，闭眼，浅黄色上衣配绿色领子，胸前有绿色菱形宝石，头戴深色尖顶帽，身侧有紫色物体。',
    '特征2：粉色长发，粉紫色瞳，穿蓝绿色格子衬衫，脸颊有红晕。',
  ].join('\n')
  const cleaned = stripTransientFeatures(description)
  const feature1 = cleaned.split('\n')[1]
  assert(!feature1.includes('闭眼'), `特征行里的「闭眼」被清掉（实际 ${feature1}）`)
  assert(feature1.startsWith('特征1：浅绿色短发，浅黄色上衣'), `稳定外观按原顺序保留（实际 ${feature1}）`)
  assert(feature1.includes('身侧有紫色物体'), '第三只眼的描述保留')
  assert(!cleaned.includes('脸颊有红晕'), '「红晕」这类瞬时状态从句也被清掉')
  assert(cleaned.includes('左侧角色闭眼'), '正文里的动作叙述不受影响')

  // 清理后检索结果不变：恋恋仍是第一候选
  assert(matchCharacterGroups(cleaned, '')[0]?.matches[0]?.name === '古明地恋',
    `清理瞬时状态后仍命中古明地恋（实际 ${matchCharacterGroups(cleaned, '')[0]?.matches[0]?.name}）`)

  // 识别纪律本身明确列出瞬时状态不能当依据
  assert(CHARACTER_IDENTITY_RULE.includes('睁眼/闭眼') && CHARACTER_IDENTITY_RULE.includes('不能作为识别依据'),
    '识别纪律包含瞬时状态规则')
}

// ---------- 场景 4：从 dataDir 的 JSON 加载角色库 ----------
{
  const dir = mkdtempSync(join(tmpdir(), 'characters-'))
  const file = join(dir, CHARACTERS_FILE)

  assert(loadCharacters(dir).length === 176, '首次加载写出默认角色库')
  assert(existsSync(file), '默认 JSON 已写入 dataDir')

  // 旧格式（纯角色数组）继续兼容
  writeFileSync(file, JSON.stringify([{
    name: '测试角色',
    alias: ['测试'],
    appearance: '红色短发，蓝色眼睛，白色连衣裙',
    introduction: '测试用',
    abilities: '',
  }]), 'utf8')
  assert(loadCharacters(dir).length === 1, '加载旧格式角色库')
  assert(matchCharacters('红色短发，蓝色眼睛，白色连衣裙')[0]?.name === '测试角色', '匹配使用自定义角色库')

  // 新结构：文件里可以自定义词表，缺的部分沿用内置默认值
  writeFileSync(file, JSON.stringify({
    version: 2,
    vocabulary: { signatures: [{ name: '测试标志', words: ['测试词'] }] },
    characters: [{ name: '测试角色', alias: [], appearance: '红色短发，蓝色眼睛，手持测试词' }],
  }), 'utf8')
  assert(loadCharacters(dir).length === 1, '加载新结构角色库')
  assert(findSignatures('手持测试词').has('测试标志'), '自定义标志物生效')
  // 写了某一节就整节替换（缺的节才沿用默认值），避免内置词表和自定义词表混在一起
  assert(!findSignatures('手持御币').has('御币'), '文件里的标志物节整体替换默认值')

  writeFileSync(file, '{bad json', 'utf8')
  assert(loadCharacters(dir).length === 176, '解析失败退回内置默认值')
  assert(readFileSync(file, 'utf8') === '{bad json', '解析失败不覆盖用户文件')

  // 旧文件名自动迁移，用户不用手工改名
  const legacyDir = mkdtempSync(join(tmpdir(), 'characters-'))
  writeFileSync(join(legacyDir, LEGACY_CHARACTERS_FILE), JSON.stringify([
    { name: '旧角色', alias: [], appearance: '红色短发' },
  ]), 'utf8')
  assert(loadCharacters(legacyDir).length === 1, '旧文件名自动迁移')
  assert(existsSync(join(legacyDir, CHARACTERS_FILE)), '迁移后写出新文件名')

  // 恢复默认，避免影响后续用例
  loadCharacters(mkdtempSync(join(tmpdir(), 'characters-')))
  assert(getCharacters().length === 176, '恢复默认角色库')
}

console.log('\n全部通过')

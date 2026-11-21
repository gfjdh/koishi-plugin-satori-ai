// 角色库测试（纯逻辑，不连数据库）。在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/test-characters.ts
//
// 要保证的事：角色库只做名字/别名归一化和官方外观查询；
// 识图模型给的身份行能被解析；库外角色原样保留；自定义角色库仍能加载。
import {
  applyCharacterReference, buildCharacterReference, CHARACTERS_FILE, extractIdentityNames,
  getCharacters, LEGACY_CHARACTERS_FILE, loadCharacters, normalizeCharacterName, summarizeAppearance,
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

// ---------- 场景 1：名字/别名归一化 ----------
{
  assert(normalizeCharacterName('古明地恋') === '古明地恋', '正式名原样返回')
  assert(normalizeCharacterName('恋恋') === '古明地恋', '别名归一化到正式名')
  assert(normalizeCharacterName('古明地恋（Koishi）') === '古明地恋', '带括号的写法也能归一化')
  assert(normalizeCharacterName('芙兰') === '芙兰朵露·斯卡蕾特', '短别名归一化到正式名')
  assert(normalizeCharacterName('灵梦') === '博丽灵梦', '名字片段归一化到正式名')
  assert(normalizeCharacterName('魔理沙') === '雾雨魔理沙', '名字片段归一化到正式名')
  assert(normalizeCharacterName('不存在的角色') === '不存在的角色', '库外角色原样返回')
  assert(normalizeCharacterName('') === '', '空名字返回空串')
}

// ---------- 场景 2：识图模型的身份行 ----------
{
  assert(extractIdentityNames('图1：一个粉发女孩。\n角色：古明地恋').join('|') === '古明地恋',
    '解析单角色身份行')
  assert(extractIdentityNames('角色1（左）：博丽灵梦\n角色2：雾雨魔理沙').join('|') === '博丽灵梦|雾雨魔理沙',
    '解析多角色身份行和位置括号')
  assert(extractIdentityNames('角色：不确定').length === 0, '不确定不当作角色名')
  assert(extractIdentityNames('角色：无').length === 0, '无角色不当作角色名')
  assert(extractIdentityNames('角色：可能是古明地恋').join('|') === '古明地恋', '去掉猜测前缀')
  assert(extractIdentityNames('角色：古明地恋（Koishi）').join('|') === '古明地恋', '去掉括号里的外文名')
  assert(extractIdentityNames('角色：博丽灵梦、雾雨魔理沙').join('|') === '博丽灵梦|雾雨魔理沙', '顿号分隔的多个角色')
  assert(extractIdentityNames('人物：恋恋').join('|') === '恋恋', '「人物：」也能解析')
  assert(extractIdentityNames('图1：一张风景画。').length === 0, '没有身份行时返回空')
}

// ---------- 场景 3：角色库资料只补充官方外观 ----------
{
  const reference = buildCharacterReference(['恋恋'])
  assert(reference.includes('角色库资料') && reference.includes('古明地恋'), '库内角色附加官方资料')
  assert(reference.includes('第三只眼'), '官方资料带外观摘要')

  assert(buildCharacterReference(['不存在的角色']) === '', '库外角色不附加资料')
  assert(buildCharacterReference(['恋恋', '古明地恋']) === reference, '同一角色只附加一次')

  const withRef = applyCharacterReference('图1：一个女孩。\n角色：恋恋')
  assert(withRef.startsWith('图1：一个女孩。') && withRef.includes('[角色库资料：'), '描述后面附加角色库资料')
  const unknown = '图1：一个女孩。\n角色：不确定'
  assert(applyCharacterReference(unknown) === unknown, '不确定时不附加资料')
  const noIdentity = '图1：一张风景画。'
  assert(applyCharacterReference(noIdentity) === noIdentity, '没有身份行时不附加资料')
}

// ---------- 场景 4：官方外观摘要 ----------
{
  const koishi = getCharacters().find(character => character.name === '古明地恋')!
  const summary = summarizeAppearance(koishi.appearance, koishi.name)
  assert(summary.includes('浅绿') && summary.includes('第三只眼'), '摘要带发色和标志物')
  assert(summary.length <= 120, `摘要不超过 120 字（实际 ${summary.length}）`)
  assert(summarizeAppearance('暂无相关资料') === '', '没有资料时不生成摘要')
  assert(summarizeAppearance('恋有着一头浅绿短发', '古明地恋') === '一头浅绿短发', '去掉开头的角色名')
}

// ---------- 场景 5：从 dataDir 的 JSON 加载角色库 ----------
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
  assert(normalizeCharacterName('测试') === '测试角色', '自定义别名生效')

  // 新结构：vocabulary 字段被忽略，characters 正常加载
  writeFileSync(file, JSON.stringify({
    version: 2,
    vocabulary: { signatures: [{ name: '测试标志', words: ['测试词'] }] },
    characters: [{ name: '测试角色', alias: [], appearance: '红色短发，蓝色眼睛' }],
  }), 'utf8')
  assert(loadCharacters(dir).length === 1, '加载新结构角色库并忽略 vocabulary')

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

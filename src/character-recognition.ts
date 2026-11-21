// src/character-recognition.ts
// 角色库：只负责名字/别名归一化和官方外观查询。
//
// 识别本身交给识图模型：vision.ts 的提示词要求模型在每张图末尾写「角色：X」。
// 这里不再做 BM25、发色/瞳色加分、标志物词表或候选打分——那些规则每遇到一种
// 新画风就要补一条，永远补不完；换更强的识图模型比继续加规则更有效。
import { Logger } from 'koishi'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import bundledData from './data/characters.json'

const logger = new Logger('satori-characters')

export interface CharacterProfile {
  name: string
  alias: string[]
  appearance: string
}

export interface CharacterData {
  version?: number
  /** 旧版匹配词表；现在不再使用，读取时忽略 */
  vocabulary?: unknown
  characters: unknown
}

/** 角色库文件名，位于插件配置的 dataDir 下 */
export const CHARACTERS_FILE = 'characters.json'
/** 旧文件名：启动时自动迁移，用户不用手工改名 */
export const LEGACY_CHARACTERS_FILE = 'touhou_characters.json'

/** 官方外观摘要最多保留多少字 */
export const CHARACTER_SUMMARY_MAX_CHARS = 120

/** 打包数据：新格式是 { version, vocabulary, characters }，旧格式是纯角色数组 */
const DEFAULT_DATA = bundledData as unknown as CharacterData

function normalizeCharacters(input: unknown): CharacterProfile[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(item => item && typeof item.name === 'string' && item.name.trim())
    .map(item => ({
      name: String(item.name).trim(),
      alias: Array.isArray(item.alias)
        ? item.alias.filter((alias: unknown) => typeof alias === 'string' && alias.trim()).map((alias: string) => alias.trim())
        : [],
      appearance: typeof item.appearance === 'string' ? item.appearance : '',
    }))
}

const DEFAULT_CHARACTERS = normalizeCharacters(Array.isArray(DEFAULT_DATA) ? DEFAULT_DATA : DEFAULT_DATA.characters)

let characters: CharacterProfile[] = DEFAULT_CHARACTERS

function serializeData(list: CharacterProfile[]): string {
  return JSON.stringify({ version: 2, characters: list }, null, 2)
}

/**
 * 启动时加载角色库：文件不存在就写一份默认值，存在则按用户的版本加载。
 * 兼容旧文件名 touhou_characters.json 和旧格式（纯角色数组）。
 * 解析失败或内容为空时退回内置默认值，不覆盖用户文件。
 */
export function loadCharacters(dataDir: string): CharacterProfile[] {
  const file = join(dataDir, CHARACTERS_FILE)
  const legacyFile = join(dataDir, LEGACY_CHARACTERS_FILE)
  try {
    if (!existsSync(file)) {
      mkdirSync(dataDir, { recursive: true })
      if (existsSync(legacyFile)) {
        // 旧文件名的用户数据原样迁移
        const raw = JSON.parse(readFileSync(legacyFile, 'utf8'))
        const data: CharacterData = Array.isArray(raw) ? { characters: raw } : raw
        const migrated = normalizeCharacters(data.characters)
        if (migrated.length) {
          writeFileSync(file, serializeData(migrated), 'utf8')
          characters = migrated
          logger.info(`已从 ${LEGACY_CHARACTERS_FILE} 迁移角色库到 ${CHARACTERS_FILE}（${migrated.length} 个角色）`)
          return characters
        }
      }
      writeFileSync(file, serializeData(DEFAULT_CHARACTERS), 'utf8')
      logger.info(`已生成默认角色库：${file}（${DEFAULT_CHARACTERS.length} 个角色）`)
    }
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const data: CharacterData = Array.isArray(raw) ? { characters: raw } : raw
    const loaded = normalizeCharacters(data.characters)
    if (loaded.length) {
      characters = loaded
      logger.info(`已加载角色库：${file}（${loaded.length} 个角色）`)
      return characters
    }
    logger.warn(`角色库为空或格式不正确，使用内置默认值：${file}`)
  } catch (error) {
    logger.warn(`加载角色库失败，使用内置默认值：${error}`)
  }
  characters = DEFAULT_CHARACTERS
  return characters
}

export function getCharacters(): CharacterProfile[] {
  return characters
}

/**
 * 官方外观摘要：内置库是单行短档案，直接截断；
 * 旧格式/用户自定义的长文只取前几句，避免把整段百科塞进提示词。
 */
export function summarizeAppearance(appearance: string, name = ''): string {
  const text = (appearance || '').replace(/\s+/g, ' ').trim()
  if (!text || text.includes('暂无相关资料')) return ''
  let summary = text
  // 长文常以角色名开头（「恋有着…」「魔理沙有着…」），摘要里去掉名字和动词
  if (name) {
    for (let length = Math.min(4, name.length); length >= 1; length--) {
      const prefix = name.slice(-length)
      if (!summary.startsWith(prefix)) continue
      const rest = summary.slice(prefix.length)
      if (/^(有着|属于|身穿|头戴|长着|留着|是)/.test(rest)) {
        summary = rest.replace(/^(有着|属于|身穿|头戴|长着|留着|是)/, '')
        break
      }
    }
  }
  return summary.length > CHARACTER_SUMMARY_MAX_CHARS
    ? `${summary.slice(0, CHARACTER_SUMMARY_MAX_CHARS)}…`
    : summary
}

/** 名字/别名匹配的优先级：精确命中 > 名字被包含 > 输入被名字包含（至少两个字） */
function matchLength(raw: string, name: string): number {
  if (!name || name.length < 2) return 0
  if (raw === name) return name.length + 1000
  if (raw.includes(name)) return name.length
  if (name.includes(raw) && raw.length >= 2) return raw.length
  return 0
}

/**
 * 把识图模型给的角色名归一化到角色库的正式名。
 * 匹配不到时原样返回：角色库之外的角色也应该能正常说出来。
 */
export function normalizeCharacterName(input: string): string {
  const raw = (input || '').trim()
  if (!raw) return ''
  let best = ''
  let bestLength = 0
  for (const character of characters) {
    for (const name of [character.name, ...character.alias]) {
      const length = matchLength(raw, name)
      if (length > bestLength) {
        best = character.name
        bestLength = length
      }
    }
  }
  return best || raw
}

/** 识图模型输出的身份行：`角色：X`、`角色1：X`、`角色1（左）：X` */
const IDENTITY_LINE_PATTERN = /^(?:角色|人物)\s*\d*\s*(?:[（(][^）)]*[）)])?\s*[:：]\s*(.+)$/

/** 身份行里表示「没有/不确定」的写法，不作为角色名 */
const UNKNOWN_IDENTITY = /^(?:不确定|未知|无法判断|认不出|不知道|无|没有|none|unknown|n\/a)$/i

/** 去掉猜测前缀，按顿号/逗号/「或」拆分身份值 */
function splitIdentityValue(value: string): string[] {
  const cleaned = (value || '').replace(/[（(][^）)]*[）)]/g, '').trim()
  if (!cleaned) return []
  return cleaned
    .split(/[、，,/／]|或/)
    .map(item => item.trim().replace(/^(?:可能(?:是|为)?|应该是?|看起来像|像是|疑似)\s*/, '').trim())
    .filter(item => item && !UNKNOWN_IDENTITY.test(item))
}

/** 从识图描述里抽出模型给出的角色名（未归一化） */
export function extractIdentityNames(description: string): string[] {
  const names: string[] = []
  for (const line of (description || '').split('\n')) {
    const match = line.trim().match(IDENTITY_LINE_PATTERN)
    if (!match) continue
    names.push(...splitIdentityValue(match[1]))
  }
  return names
}

/** 角色库官方外观资料：只给库里确实存在的角色，作为核对参考，不生成候选 */
export function buildCharacterReference(names: string[]): string {
  const seen = new Set<string>()
  const items: string[] = []
  for (const name of names) {
    const canonical = normalizeCharacterName(name)
    const character = characters.find(item => item.name === canonical)
    if (!character || seen.has(canonical)) continue
    seen.add(canonical)
    const summary = summarizeAppearance(character.appearance, character.name)
    items.push(summary ? `${canonical}（${summary}）` : canonical)
  }
  if (!items.length) return ''
  return `[角色库资料：${items.join('；')}]`
}

/** 在识图描述后面附上角色库资料；模型给的名字不在库里时不附加任何东西 */
export function applyCharacterReference(description: string): string {
  const reference = buildCharacterReference(extractIdentityNames(description))
  return reference ? `${description}\n${reference}` : description
}

// src/touhou.ts
// 东方角色匹配：把识图描述当作查询，在角色库里做 BM25，返回候选角色。
//
// 只做「候选」，不下结论：识图模型不认识角色，但它的外观描述往往包含
// 发色、瞳色、服装、标志物这些词，足够把范围缩小到几个角色。
//
// 角色库默认值随插件打包，启动时复制到 dataDir/touhou_characters.json；
// 之后每次启动都从这个 JSON 读取，用户可以自行增删改。
import { Logger } from 'koishi'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scoreBM25, segment } from './memory/retrieval'
import bundledCharacters from './data/touhou-characters.json'

const logger = new Logger('satori-touhou')

export interface TouhouCharacter {
  name: string
  alias: string[]
  appearance: string
}

/** 角色库文件名，位于插件配置的 dataDir 下 */
export const TOUHOU_CHARACTERS_FILE = 'touhou_characters.json'

/** 低于这个分数说明描述里没有足够的角色特征词，宁可不给候选 */
export const CHARACTER_MATCH_MIN_SCORE = 15
/**
 * 命中的多字查询词数量。BM25 的绝对值依赖语料规模：用户自定义成很小的角色库时，
 * 分数整体偏低，用命中词数兜底（默认 176 个角色时，相关描述命中 8~14 个，无关描述 2 个）。
 */
export const CHARACTER_MATCH_MIN_TOKENS = 6

/** 角色库文档：名字 + 别名 + 外观；外观是匹配的主要依据。纯数字别名不参与，容易误伤 */
function buildDocs(list: TouhouCharacter[]) {
  return list.map((character, index) => ({
    id: index,
    content: [
      character.name,
      ...character.alias.filter(alias => alias && !/^\d+$/.test(alias)),
      character.appearance,
    ].filter(Boolean).join(' '),
  }))
}

function normalize(input: unknown): TouhouCharacter[] {
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

const DEFAULT_CHARACTERS = normalize(bundledCharacters)
let characters: TouhouCharacter[] = DEFAULT_CHARACTERS
let docs = buildDocs(characters)
let docTokenSets: Set<string>[] = buildTokenSets(docs)

function buildTokenSets(list: ReturnType<typeof buildDocs>): Set<string>[] {
  return list.map(doc => new Set(segment(doc.content)))
}

function applyCharacters(list: TouhouCharacter[]): void {
  characters = list
  docs = buildDocs(list)
  docTokenSets = buildTokenSets(docs)
}

/**
 * 启动时加载角色库：文件不存在就写一份默认值，存在则按用户的版本加载。
 * 解析失败或内容为空时退回内置默认值，不覆盖用户文件。
 */
export function loadTouhouCharacters(dataDir: string): TouhouCharacter[] {
  const file = join(dataDir, TOUHOU_CHARACTERS_FILE)
  try {
    if (!existsSync(file)) {
      mkdirSync(dataDir, { recursive: true })
      writeFileSync(file, JSON.stringify(DEFAULT_CHARACTERS, null, 2), 'utf8')
      logger.info(`已生成默认东方角色库：${file}（${DEFAULT_CHARACTERS.length} 个角色）`)
    }
    const loaded = normalize(JSON.parse(readFileSync(file, 'utf8')))
    if (loaded.length) {
      applyCharacters(loaded)
      logger.info(`已加载识图角色库：${file}（${loaded.length} 个角色）（需要自定义请编辑此json）`)
      return characters
    }
    logger.warn(`东方角色库为空或格式不正确，使用内置默认值：${file}`)
  } catch (error) {
    logger.warn(`加载东方角色库失败，使用内置默认值：${error}`)
  }
  applyCharacters(DEFAULT_CHARACTERS)
  return characters
}

export function getTouhouCharacters(): TouhouCharacter[] {
  return characters
}

export interface CharacterMatch {
  name: string
  aliases: string[]
  score: number
}

export function matchCharacters(description: string, topN = 3): CharacterMatch[] {
  if (!description) return []
  const queryTokens = [...new Set(segment(description))].filter(token => token.length >= 2)
  const scores = scoreBM25(description, docs)
  return [...scores.entries()]
    .filter(([id, score]) => {
      if (score >= CHARACTER_MATCH_MIN_SCORE) return true
      const matched = queryTokens.filter(token => docTokenSets[id].has(token)).length
      return matched >= CHARACTER_MATCH_MIN_TOKENS
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, score]) => ({
      name: characters[id].name,
      aliases: characters[id].alias,
      score,
    }))
}

/** 注入主模型提示词的候选说明 */
export function buildCharacterNote(matches: CharacterMatch[]): string {
  if (!matches.length) return ''
  return `[可能的角色：${matches.map(match => match.name).join('、')}]（仅供参考，不确定就不要下结论）`
}

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
import { scoreBM25, segment, truncate } from './memory/retrieval'
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

/** 候选说明里每个角色最多带多少字的外观摘要 */
export const CHARACTER_SUMMARY_MAX_CHARS = 80
/** 用户正文参与角色检索的最大长度：太长会把外观特征稀释掉 */
export const MATCH_QUERY_USER_TEXT_MAX = 200
/** 摘要里每个方面（发/瞳/标志物）最多保留多少字 */
const SUMMARY_LINE_MAX_CHARS = 32

/** 颜色字表：用于发色/瞳色冲突过滤 */
const COLOR_CHARS = '红橙黄绿青蓝紫粉黑白金银棕灰褐'
/**
 * 色系归并：金≈黄、银/灰≈白、青≈蓝绿、棕≈褐。
 * 检索只给候选，宁可按「同色系」放宽，也不要因为写法不同把对得上的角色筛掉。
 */
const COLOR_FAMILIES: Record<string, string[]> = {
  金: ['黄', '金'], 黄: ['黄', '金'],
  银: ['白', '银', '灰'], 白: ['白', '银'], 灰: ['灰', '银', '白'],
  青: ['青', '蓝', '绿'], 蓝: ['蓝', '青'], 绿: ['绿', '青'],
  棕: ['棕', '褐'], 褐: ['褐', '棕'],
}

/**
 * 从外观描述里取某一维度的色系。
 * 发色按短句取（特征行用顿号分隔，混在一起的服装颜色不能算发色）；
 * 瞳色按整句取（「瞳色……为深绿色」颜色常在后半句）。
 */
function collectColorFamilies(text: string, splitter: RegExp, noun: RegExp): Set<string> {
  const families = new Set<string>()
  for (const raw of (text || '').split(splitter)) {
    // 发卡/发带/发饰/发箍/发型是配饰，不是头发
    const clause = raw.replace(/发[饰卡带箍型]/g, '')
    if (!noun.test(clause)) continue
    for (const match of clause.matchAll(new RegExp(`[${COLOR_CHARS}]{1,2}`, 'g'))) {
      for (const char of match[0]) {
        for (const family of COLOR_FAMILIES[char] || [char]) families.add(family)
      }
    }
  }
  return families
}

/** 发色色系；没有提到发色时返回空集 */
export function hairColorFamilies(text: string): Set<string> {
  return collectColorFamilies(text, /[。\n，、]/, /头发|发/)
}

/** 瞳色色系；没有提到瞳色时返回空集 */
export function eyeColorFamilies(text: string): Set<string> {
  return collectColorFamilies(text, /[。\n]/, /瞳|眼睛|眼眸/)
}

/** 两边都明确写了颜色、且没有任何共同色系时视为冲突 */
function colorConflict(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false
  for (const color of a) if (b.has(color)) return false
  return true
}

/** 头发：优先「一头…发」这类正面描述，避开身高/年龄的设定行 */
const SUMMARY_HAIR_HINTS: [RegExp, number][] = [
  [/一头/, 2],
  [/有着.{0,12}发/, 2],
  [/短发|长发|及肩|及腰|及胸/, 1],
  [/发饰|头发/, 1],
  [/身高|年龄|外表是|属于/, -2],
]

const SUMMARY_EYE_HINTS: [RegExp, number][] = [
  [/瞳/, 3],
  [/眼睛/, 2],
  [/身高|年龄|外表是|属于/, -2],
]

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

/**
 * 标志物：同一行里信号越多越可能是第三只眼/道具那一段。
 * 只按「第一个命中」取会被「鞋子上链接着第三只眼」这类服装行抢走。
 */
const SUMMARY_PROP_HINTS: [RegExp, number][] = [
  [/第三只眼/, 3],
  [/周身|缠绕|环绕|周围/, 2],
  [/手持|拿着|武器|背着|翅膀|尾巴/, 2],
]

/** 去掉括号和引用标记，按逗号取前几个短句，避免把整句百字长文塞进候选说明 */
function condenseLine(line: string): string {
  const clauses = line
    .replace(/[（(\[【][^）)\]】]*[）)\]】]/g, '')
    .split(/[，。；;]/)
    .map(clause => clause.trim())
    .filter(Boolean)
  let text = ''
  for (const clause of clauses) {
    if (!text) {
      text = clause
      continue
    }
    if (text.length + clause.length + 1 > SUMMARY_LINE_MAX_CHARS) break
    text += `，${clause}`
  }
  return truncate(text || line, SUMMARY_LINE_MAX_CHARS).replace(/^[她他它](?:的)?/, '')
}

/** 挑一行：命中的提示词权重之和最高的行（分数必须为正） */
function pickLine(lines: string[], picked: Set<number>, hints: [RegExp, number][]): number {
  let best = -1
  let bestScore = 0
  lines.forEach((line, index) => {
    if (picked.has(index)) return
    let score = 0
    for (const [rule, weight] of hints) {
      if (rule.test(line)) score += weight
    }
    if (score > bestScore) {
      best = index
      bestScore = score
    }
  })
  return best
}

/**
 * 从角色库的外观长文里压出一行摘要（发/瞳/标志物），给主模型核对用。
 * 官方外观里写着瞳色和第三只眼这类信息，主模型据此判断比凭记忆可靠。
 */
export function summarizeAppearance(appearance: string, name = ''): string {
  if (!appearance || appearance.includes('暂无相关资料')) return ''
  const lines = appearance.split('\n').map(line => line.trim()).filter(Boolean)
  if (!lines.length) return ''

  const picked = new Set<number>()
  for (const hints of [SUMMARY_HAIR_HINTS, SUMMARY_EYE_HINTS, SUMMARY_PROP_HINTS]) {
    const index = pickLine(lines, picked, hints)
    if (index >= 0) picked.add(index)
  }
  if (!picked.size) picked.add(0)

  const summary = [...picked]
    .sort((a, b) => a - b)
    .map(index => condenseLine(lines[index]))
    .filter(Boolean)
    .join('；')
  return truncate(stripNamePrefix(summary, name), CHARACTER_SUMMARY_MAX_CHARS)
}

/** 外观长文常以角色名开头（「恋有着…」「魔理沙有着…」），摘要里去掉 */
function stripNamePrefix(text: string, name: string): string {
  if (!name) return text
  for (let length = Math.min(4, name.length); length >= 1; length--) {
    const prefix = name.slice(-length)
    if (!text.startsWith(prefix)) continue
    if (/^(有着|属于|身穿|头戴|长着|留着|是)/.test(text.slice(prefix.length))) {
      return text.slice(prefix.length)
    }
  }
  return text
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
  /** 官方外观摘要（发/瞳/标志物），供主模型核对；没有资料时为空串 */
  summary: string
}

/**
 * 检索候选角色。
 * `colorSource` 是取发色/瞳色的文本：多角色图按角色分别检索时传该角色自己的特征行，
 * 避免把一个角色的粉发和另一个角色的金发混在一起，导致发色对不上的角色也进候选。
 */
export function matchCharacters(description: string, topN = 3, colorSource = description): CharacterMatch[] {
  if (!description) return []
  const queryTokens = [...new Set(segment(description))].filter(token => token.length >= 2)
  const queryHair = hairColorFamilies(colorSource)
  const queryEyes = eyeColorFamilies(colorSource)
  const scores = scoreBM25(description, docs)
  return [...scores.entries()]
    .filter(([id]) => {
      const appearance = characters[id].appearance
      return !colorConflict(queryHair, hairColorFamilies(appearance))
        && !colorConflict(queryEyes, eyeColorFamilies(appearance))
    })
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
      summary: summarizeAppearance(characters[id].appearance, characters[id].name),
    }))
}

/** 识图描述里的「特征」行；模型没按格式输出时返回空串 */
export function extractFeatureLines(description: string): string {
  return (description || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^特征[:：]/.test(line))
    .join(' ')
}

/**
 * 每个角色的特征行（不含「特征N：」前缀）。
 * 单角色图是「特征：…」；多角色图按提示词要求写成「特征1：…」「特征2：…」，
 * 每个角色各占一行，检索时分别匹配，避免把两个角色的特征混在一起。
 */
export function extractFeatureGroups(description: string): string[] {
  const groups: string[] = []
  for (const line of (description || '').split('\n')) {
    const match = line.trim().match(/^特征\s*\d*\s*[:：]\s*(.+)$/)
    if (match && match[1].trim()) groups.push(match[1].trim())
  }
  return groups
}

/**
 * 角色检索的查询：特征行 + 用户正文。
 * 整段描述里的动作、背景、衣服上的字母等词会稀释外观特征，所以只取特征行；
 * 用户在正文里点名的角色（如「看这个恋恋」）是最强先验，必须一起参与检索。
 */
export function buildMatchQuery(description: string, userText = ''): string {
  const features = extractFeatureLines(description) || (description || '').trim()
  const text = (userText || '').trim().slice(0, MATCH_QUERY_USER_TEXT_MAX)
  return `${features} ${text}`.trim()
}

export interface CharacterCandidateGroup {
  /** 角色编号，用于多角色图的候选说明 */
  label: string
  matches: CharacterMatch[]
}

/**
 * 多角色图按角色分别检索：每个「特征N」行单独匹配，候选按角色分组。
 * 没有特征行时退回整段描述（老格式描述仍然可用）。
 */
export function matchCharacterGroups(description: string, userText = '', topN = 2): CharacterCandidateGroup[] {
  const features = extractFeatureGroups(description)
  const sources = features.length ? features : [(description || '').trim()]
  const text = (userText || '').trim().slice(0, MATCH_QUERY_USER_TEXT_MAX)
  const seen = new Set<string>()
  const groups: CharacterCandidateGroup[] = []
  for (const source of sources) {
    if (!source) continue
    const matches = matchCharacters(`${source} ${text}`.trim(), topN, source)
      .filter((match) => {
        if (seen.has(match.name)) return false
        seen.add(match.name)
        return true
      })
    if (matches.length) groups.push({ label: `角色${groups.length + 1}`, matches })
  }
  return groups
}

const CHARACTER_NOTE_TAIL = '（这些只是按识图描述检索出的猜测；图中描述与候选外观摘要对不上就当作没有候选，'
  + '不要在回复里说出候选名字，更不要仅凭候选否定用户说的角色）'

function formatMatch(match: CharacterMatch): string {
  return match.summary ? `${match.name}（${match.summary}）` : match.name
}

/** 注入主模型提示词的候选说明：带上官方外观摘要，供模型与图中描述核对 */
export function buildCharacterNote(matches: CharacterMatch[]): string {
  if (!matches.length) return ''
  return `[角色候选：${matches.map(formatMatch).join('；')}]${CHARACTER_NOTE_TAIL}`
}

/** 多角色图的候选说明：每个角色分开写，避免把候选安到错误的角色身上 */
export function buildCharacterNoteFromGroups(groups: CharacterCandidateGroup[]): string {
  const filled = groups.filter(group => group.matches.length)
  if (!filled.length) return ''
  if (filled.length === 1) return buildCharacterNote(filled[0].matches)
  const items = filled.map(group => `图中${group.label}可能为 ${group.matches.map(formatMatch).join(' 或 ')}`)
  return `[角色候选：${items.join('；')}]${CHARACTER_NOTE_TAIL}`
}

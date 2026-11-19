// src/character-recognition.ts
// 角色识别：把识图描述当作查询，在角色库里做字段匹配 + BM25，返回候选角色。
//
// 这是一个通用能力，不绑定东方：角色库和识别词表都在 data/characters.json 里，
// 启动时复制到 dataDir/characters.json；之后每次启动都从这个 JSON 读取，
// 用户可以自行增删改词表和角色，不需要改代码。当前内置数据恰好是东方角色。
import { Logger } from 'koishi'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { scoreBM25, segment, truncate } from './memory/retrieval'
import bundledData from './data/characters.json'

const logger = new Logger('satori-characters')

export interface CharacterProfile {
  name: string
  alias: string[]
  appearance: string
}

/** 一个标志物的定义：同一件东西的多种写法（words 是字面词，patterns 是正则源码） */
export interface SignatureDef {
  name: string
  words?: string[]
  patterns?: string[]
}

/**
 * 识别词表。全部放在 data/characters.json 的 vocabulary 节里，
 * 新增颜色、发型、配饰、标志物都只改 JSON，不改代码。
 */
export interface Vocabulary {
  /** 颜色字表和色系归并（金≈黄、银/灰≈白 等） */
  colors: {
    chars: string
    families: Record<string, string[]>
  }
  /** 发型词表 */
  styles: string[]
  /** 头部配饰词表 */
  accessories: string[]
  /** 服装词表 */
  clothing: string[]
  /** 同义写法归一（「喀秋莎头饰」→「女仆头饰」） */
  synonyms: { from: string, to: string }[]
  /** 标志物词表：同义词组，命中独特标志可以弥补发色/服装被同人图改动 */
  signatures: SignatureDef[]
  /** 头部上下文正则源码：配饰出现在这些词附近才算头饰 */
  headContext: string
}

export interface CharacterData {
  version?: number
  vocabulary?: Partial<Vocabulary>
  characters: unknown
}

/** 角色库文件名，位于插件配置的 dataDir 下 */
export const CHARACTERS_FILE = 'characters.json'
/** 旧文件名：启动时自动迁移，用户不用手工改名 */
export const LEGACY_CHARACTERS_FILE = 'touhou_characters.json'

/**
 * 低于这个分数说明描述里没有足够的角色特征词，宁可不给候选。
 * 分数是「外观字段加分 + 0.25 × BM25」的混合值（见 matchCharacters）。
 */
export const CHARACTER_MATCH_MIN_SCORE = 10
/**
 * 命中的多字查询词数量。BM25 的绝对值依赖语料规模：用户自定义成很小的角色库时，
 * 分数整体偏低，用命中词数兜底（默认 176 个角色时，相关描述命中 8~14 个，无关描述 2 个）。
 */
export const CHARACTER_MATCH_MIN_TOKENS = 6

/**
 * 外观字段加分。多人合照里服装往往统一（泳装、校服），BM25 会被「深蓝色连体泳衣」
 * 这类词带偏；发色、瞳色、发型、头饰、标志物才是区分角色的可靠信号。
 */
export const HAIR_EXACT_BONUS = 6
export const HAIR_FAMILY_BONUS = 3
export const EYE_EXACT_BONUS = 3
export const EYE_FAMILY_BONUS = 1.5
/** 瞳色对不上只轻微扣分：识图模型对瞳色的判断经常不准 */
export const EYE_CONFLICT_PENALTY = 1
export const STYLE_MATCH_BONUS = 2
export const HEAD_ACCESSORY_BONUS = 4
export const HEAD_ACCESSORY_COLOR_BONUS = 3
export const HEAD_ACCESSORY_COLOR_MISMATCH_BONUS = 1
export const CLOTHING_MATCH_BONUS = 2
/** 用户正文里直接点名角色（别名）是最强先验 */
export const ALIAS_MATCH_BONUS = 5
/** BM25 只作为弱信号参与：长百科正文里通用词太多，权重过高会压过外观字段 */
export const BM25_MIX_WEIGHT = 0.25

/** 出现在不超过这么多个角色档案里的标志物算「独特标志」 */
export const SIGNATURE_RARE_MAX = 5
/** 普通标志物命中加分 */
export const SIGNATURE_MATCH_BONUS = 3
/** 独特标志物命中加分；独特标志还能绕过发色冲突（同人图常改发色） */
export const RARE_SIGNATURE_BONUS = 8

/** 一次最多匹配多少个角色：漫画/多格图可能列出几十个，候选说明不能无限长 */
export const CHARACTER_MAX_GROUPS = 8
/**
 * 组级最低线：每组第一候选低于这个分数就不给预选，让模型直接说认不出来。
 * 已知正确候选的实测最低分是 12.6，低于 12 的多是「发色/瞳色只对上一半」的弱匹配。
 */
export const CHARACTER_GROUP_MIN_SCORE = 12

/** 候选说明里每个角色最多带多少字的外观摘要 */
export const CHARACTER_SUMMARY_MAX_CHARS = 120
/** 单行短于这个长度视为识别档案，整段作为摘要（超过则截断） */
const COMPACT_APPEARANCE_MAX = 200
/** 用户正文参与角色检索的最大长度：太长会把外观特征稀释掉 */
export const MATCH_QUERY_USER_TEXT_MAX = 200
/** 摘要里每个方面（发/瞳/标志物）最多保留多少字 */
const SUMMARY_LINE_MAX_CHARS = 32

/** 外观文本的短句切分：顿号不切，「白色、紫色大蝴蝶结」要留在同一句里 */
const CLAUSE_SPLITTER = /[。；，\n]/
const HAIR_SPLITTER = /[。\n，、]/
const HAIR_NOUN = /头发|发/
const EYE_SPLITTER = /[。\n]/
const EYE_NOUN = /瞳|眼睛|眼眸/

/** 打包数据：新格式是 { version, vocabulary, characters }，旧格式是纯角色数组 */
const DEFAULT_DATA = bundledData as unknown as CharacterData

function stringList(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

function normalizeVocabulary(input?: Partial<Vocabulary>): Vocabulary {
  return {
    colors: {
      chars: typeof input?.colors?.chars === 'string' ? input.colors.chars : '',
      families: input?.colors?.families && typeof input.colors.families === 'object'
        ? input.colors.families as Record<string, string[]>
        : {},
    },
    styles: stringList(input?.styles),
    accessories: stringList(input?.accessories),
    clothing: stringList(input?.clothing),
    synonyms: Array.isArray(input?.synonyms)
      ? input.synonyms.filter(item => item && typeof item.from === 'string' && typeof item.to === 'string')
      : [],
    signatures: Array.isArray(input?.signatures)
      ? input.signatures.filter(item => item && typeof item.name === 'string')
      : [],
    headContext: typeof input?.headContext === 'string' ? input.headContext : '',
  }
}

/** 用户文件里的词表可以只写一部分，缺的沿用内置默认值 */
function mergeVocabulary(base: Vocabulary, input?: Partial<Vocabulary>): Vocabulary {
  if (!input) return base
  return {
    colors: {
      chars: typeof input.colors?.chars === 'string' ? input.colors.chars : base.colors.chars,
      families: input.colors?.families && typeof input.colors.families === 'object'
        ? input.colors.families as Record<string, string[]>
        : base.colors.families,
    },
    styles: Array.isArray(input.styles) ? stringList(input.styles) : base.styles,
    accessories: Array.isArray(input.accessories) ? stringList(input.accessories) : base.accessories,
    clothing: Array.isArray(input.clothing) ? stringList(input.clothing) : base.clothing,
    synonyms: Array.isArray(input.synonyms)
      ? input.synonyms.filter(item => item && typeof item.from === 'string' && typeof item.to === 'string')
      : base.synonyms,
    signatures: Array.isArray(input.signatures)
      ? input.signatures.filter(item => item && typeof item.name === 'string')
      : base.signatures,
    headContext: typeof input.headContext === 'string' ? input.headContext : base.headContext,
  }
}

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

const DEFAULT_VOCABULARY = normalizeVocabulary(DEFAULT_DATA.vocabulary)
const DEFAULT_CHARACTERS = normalizeCharacters(Array.isArray(DEFAULT_DATA) ? DEFAULT_DATA : DEFAULT_DATA.characters)

/** 当前生效的词表 */
let vocabulary: Vocabulary = DEFAULT_VOCABULARY
/** 编译后的标志物匹配器 */
let signatureMatchers: { name: string, words: string[], patterns: RegExp[] }[] = compileSignatures(vocabulary)
/** 头部上下文；JSON 里没写就不限制配饰位置 */
let headContext: RegExp | null = compileHeadContext(vocabulary.headContext)
/** 配饰连同它的颜色：「绿色蝴蝶结」不该算成发色 */
let accessoryColorPattern: RegExp | null = buildAccessoryColorPattern()

function compileSignatures(vocab: Vocabulary) {
  return vocab.signatures.map(definition => ({
    name: definition.name,
    words: stringList(definition.words),
    patterns: stringList(definition.patterns).map(source => {
      try {
        return new RegExp(source)
      } catch (error) {
        logger.warn(`标志物「${definition.name}」的正则无效：${source}`)
        return null
      }
    }).filter((pattern): pattern is RegExp => !!pattern),
  }))
}

function compileHeadContext(source: string): RegExp | null {
  if (!source) return null
  try {
    return new RegExp(source)
  } catch (error) {
    logger.warn(`头部上下文正则无效：${source}`)
    return null
  }
}

function buildAccessoryColorPattern(): RegExp | null {
  const chars = vocabulary.colors.chars
  const words = vocabulary.accessories
  if (!chars || !words.length) return null
  return new RegExp(`[${chars}]{1,2}(?:色)?[^，。；、\\n]{0,6}?(?:${words.join('|')})`, 'g')
}

function applyVocabulary(next: Vocabulary): void {
  vocabulary = next
  signatureMatchers = compileSignatures(next)
  headContext = compileHeadContext(next.headContext)
  accessoryColorPattern = buildAccessoryColorPattern()
}

/**
 * 从外观描述里取某一维度的颜色字。
 * 发色按短句取（特征行用顿号分隔，混在一起的服装颜色不能算发色）；
 * 瞳色按整句取（「瞳色……为深绿色」颜色常在后半句）。
 */
function collectColorChars(text: string, splitter: RegExp, noun: RegExp): Set<string> {
  const chars = new Set<string>()
  const colorChars = vocabulary.colors.chars
  if (!colorChars) return chars
  const colorPattern = new RegExp(`[${colorChars}]{1,2}`, 'g')
  for (const raw of (text || '').split(splitter)) {
    // 先去掉「金色发带」这类配饰连同它的颜色，再处理发卡/发带等词，
    // 否则先删词会留下孤立的颜色字，被误当成发色
    let clause = raw
    if (accessoryColorPattern) clause = clause.replace(accessoryColorPattern, '')
    clause = clause.replace(/发[饰卡带箍型]/g, '')
    if (!noun.test(clause)) continue
    for (const match of clause.matchAll(colorPattern)) {
      for (const char of match[0]) chars.add(char)
    }
  }
  return chars
}

function familiesOf(chars: Set<string>): Set<string> {
  const families = new Set<string>()
  for (const char of chars) {
    for (const family of vocabulary.colors.families[char] || [char]) families.add(family)
  }
  return families
}

/** 发色色系；没有提到发色时返回空集 */
export function hairColorFamilies(text: string): Set<string> {
  return familiesOf(hairColorChars(text))
}

/** 瞳色色系；没有提到瞳色时返回空集 */
export function eyeColorFamilies(text: string): Set<string> {
  return familiesOf(eyeColorChars(text))
}

/** 发色/瞳色里写到的颜色字（未经色系归并），用于给颜色完全写对的候选加分 */
export function hairColorChars(text: string): Set<string> {
  return collectColorChars(text, HAIR_SPLITTER, HAIR_NOUN)
}

export function eyeColorChars(text: string): Set<string> {
  // 识别档案是单行短文本（「黄色或红色眼瞳、…」），按顿号切才能只取瞳色；
  // 旧格式长文里颜色常跟在逗号后面（「眼瞳在红魔乡中为红色，在妖妖梦中为灰色」），按句取。
  const compact = !(text || '').includes('\n') && (text || '').length <= COMPACT_APPEARANCE_MAX
  return collectColorChars(text, compact ? /[。\n，、]/ : EYE_SPLITTER, EYE_NOUN)
}

function hasOverlap(a: Set<string>, b: Set<string>): boolean {
  for (const item of a) if (b.has(item)) return true
  return false
}

/** 两边都明确写了颜色、且没有任何共同色系时视为冲突 */
function colorConflict(a: Set<string>, b: Set<string>): boolean {
  if (!a.size || !b.size) return false
  return !hasOverlap(a, b)
}

/** 去掉「无头饰」「无标志物」这类否定描述，避免把否定词当成特征 */
function stripNegation(text: string): string {
  return (text || '').replace(/无[^、，。；\n]*/g, '')
}

/** 同义写法归一，避免「喀秋莎头饰」和「女仆头饰」被当成两种东西 */
function normalizeFeatures(text: string): string {
  let result = text || ''
  for (const { from, to } of vocabulary.synonyms) result = result.split(from).join(to)
  return result
}

function wordsIn(text: string, words: string[]): Set<string> {
  const normalized = normalizeFeatures(text)
  const found = new Set<string>()
  for (const word of words) if (normalized.includes(word)) found.add(word)
  return found
}

/**
 * 从文本里找出命中的标志物：键是标志物名，值是原文里出现的写法。
 * 检索打分和「档案补词」脚本共用。
 */
export function findSignatures(text: string): Map<string, string[]> {
  const found = new Map<string, string[]>()
  const source = text || ''
  for (const matcher of signatureMatchers) {
    const words: string[] = []
    for (const word of matcher.words) {
      if (source.includes(word)) words.push(word)
    }
    for (const pattern of matcher.patterns) {
      // 正则命中的取实际片段（「长角」「小提琴」），补词时才能原样写回档案
      const match = source.match(pattern)
      if (match) words.push(match[0])
    }
    if (words.length) found.set(matcher.name, words)
  }
  return found
}

/** 文本里出现了哪些标志物（同义词归并到同一组） */
function signaturesIn(text: string): Set<string> {
  return new Set(findSignatures(text).keys())
}

function colorsInClause(clause: string): Set<string> {
  const colors = new Set<string>()
  const colorChars = vocabulary.colors.chars
  if (!colorChars) return colors
  for (const match of clause.matchAll(new RegExp(`[${colorChars}]{1,2}`, 'g'))) {
    for (const char of match[0]) colors.add(char)
  }
  return colors
}

/**
 * 配饰 → 同一短句里写到的颜色。
 * `headOnly` 用于角色库外观：只有出现在头发/头部附近的配饰才算头饰，
 * 「后腰的蓝色蝴蝶结」不算灵梦的发饰。
 */
function collectAccessories(text: string, headOnly: boolean): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  const normalized = normalizeFeatures(text)
  // 识别档案是单行短文本，顿号就是字段分隔；旧格式长文里顿号常连接颜色列表
  // （「白色、紫色、粉色大蝴蝶结」），按顿号切会把颜色和配饰拆散。
  const compact = !(text || '').includes('\n') && (text || '').length <= COMPACT_APPEARANCE_MAX
  const splitter = compact ? /[。；，、\n]/ : CLAUSE_SPLITTER
  for (const clause of normalized.split(splitter)) {
    if (headOnly && headContext && !headContext.test(clause)) continue
    const colors = colorsInClause(clause)
    for (const word of vocabulary.accessories) {
      if (!clause.includes(word)) continue
      if (!map.has(word)) map.set(word, new Set())
      for (const color of colors) map.get(word).add(color)
    }
  }
  return map
}

/**
 * 查询里的瞳色：按短句取，且只认带「瞳/眼」的短句。
 * 特征行用顿号分隔，整行取色会把发色、衣服颜色都算成瞳色。
 */
export function eyeColorCharsInQuery(text: string): Set<string> {
  const chars = new Set<string>()
  for (const clause of (text || '').split(/[。\n，、]/)) {
    if (!EYE_NOUN.test(clause)) continue
    for (const color of colorsInClause(clause)) chars.add(color)
  }
  return chars
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

/**
 * 标志物：同一行里信号越多越可能是第三只眼/道具那一段。
 * 只按「第一个命中」取会被「鞋子上链接着第三只眼」这类服装行抢走。
 */
const SUMMARY_PROP_HINTS: [RegExp, number][] = [
  [/第三只眼/, 3],
  [/周身|缠绕|环绕|周围/, 2],
  [/手持|拿着|武器|背着|翅膀|尾巴/, 2],
]

/** 角色库文档：名字 + 别名 + 外观；外观是匹配的主要依据。纯数字别名不参与，容易误伤 */
function buildDocs(list: CharacterProfile[]) {
  return list.map((character, index) => ({
    id: index,
    content: [
      character.name,
      ...character.alias.filter(alias => alias && !/^\d+$/.test(alias)),
      character.appearance,
    ].filter(Boolean).join(' '),
  }))
}

let characters: CharacterProfile[] = DEFAULT_CHARACTERS
let docs = buildDocs(characters)
let docTokenSets: Set<string>[] = buildTokenSets(docs)
/** 角色库里出现过的所有词：检索查询里「都有谁」这类语料里没有的词不该抬高命中门槛 */
let corpusTokens: Set<string> = buildCorpusTokens(docTokenSets)
/** 每个角色的外观字段，按文档预计算，避免每次检索都重新解析 */
let docProfiles: DocProfile[] = buildDocProfiles(characters)
/** 标志物的稀有度（出现在多少个角色档案里），用于判断能否绕过发色冲突 */
let signatureRarity: Map<string, number> = countSignatureRarity(docProfiles)

interface DocProfile {
  hairFamilies: Set<string>
  eyeFamilies: Set<string>
  hairChars: Set<string>
  eyeChars: Set<string>
  styles: Set<string>
  headAccessories: Map<string, Set<string>>
  signatures: Set<string>
  clothing: Set<string>
}

function buildDocProfiles(list: CharacterProfile[]): DocProfile[] {
  return list.map((character) => {
    const hairChars = hairColorChars(character.appearance)
    const eyeChars = eyeColorChars(character.appearance)
    return {
      hairFamilies: familiesOf(hairChars),
      eyeFamilies: familiesOf(eyeChars),
      hairChars,
      eyeChars,
      styles: wordsIn(character.appearance, vocabulary.styles),
      headAccessories: collectAccessories(character.appearance, true),
      signatures: signaturesIn(character.appearance),
      clothing: wordsIn(character.appearance, vocabulary.clothing),
    }
  })
}

/** 每个标志物出现在多少个角色档案里：越少越独特，独特标志可以绕过发色冲突 */
function countSignatureRarity(profiles: DocProfile[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const profile of profiles) {
    for (const name of profile.signatures) counts.set(name, (counts.get(name) || 0) + 1)
  }
  return counts
}

function buildTokenSets(list: ReturnType<typeof buildDocs>): Set<string>[] {
  return list.map(doc => new Set(segment(doc.content)))
}

function buildCorpusTokens(sets: Set<string>[]): Set<string> {
  const tokens = new Set<string>()
  for (const set of sets) for (const token of set) tokens.add(token)
  return tokens
}

function applyCharacters(list: CharacterProfile[]): void {
  characters = list
  docs = buildDocs(list)
  docTokenSets = buildTokenSets(docs)
  corpusTokens = buildCorpusTokens(docTokenSets)
  docProfiles = buildDocProfiles(list)
  signatureRarity = countSignatureRarity(docProfiles)
}

function serializeData(vocab: Vocabulary, list: CharacterProfile[]): string {
  return JSON.stringify({ version: 2, vocabulary: vocab, characters: list }, null, 2)
}

/**
 * 启动时加载角色库和词表：文件不存在就写一份默认值，存在则按用户的版本加载。
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
        // 旧文件名的用户数据原样迁移，词表缺的部分用内置默认值补
        const raw = JSON.parse(readFileSync(legacyFile, 'utf8'))
        const data: CharacterData = Array.isArray(raw) ? { characters: raw } : raw
        const migrated = normalizeCharacters(data.characters)
        if (migrated.length) {
          const vocab = mergeVocabulary(DEFAULT_VOCABULARY, data.vocabulary)
          writeFileSync(file, serializeData(vocab, migrated), 'utf8')
          applyVocabulary(vocab)
          applyCharacters(migrated)
          logger.info(`已从 ${LEGACY_CHARACTERS_FILE} 迁移角色库到 ${CHARACTERS_FILE}（${migrated.length} 个角色）`)
          return characters
        }
      }
      writeFileSync(file, serializeData(DEFAULT_VOCABULARY, DEFAULT_CHARACTERS), 'utf8')
      logger.info(`已生成默认角色库：${file}（${DEFAULT_CHARACTERS.length} 个角色）`)
    }
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const data: CharacterData = Array.isArray(raw) ? { characters: raw } : raw
    const loaded = normalizeCharacters(data.characters)
    if (loaded.length) {
      applyVocabulary(mergeVocabulary(DEFAULT_VOCABULARY, data.vocabulary))
      applyCharacters(loaded)
      logger.info(`已加载角色库：${file}（${loaded.length} 个角色，${vocabulary.signatures.length} 个标志物）（需要自定义请编辑此json）`)
      return characters
    }
    logger.warn(`角色库为空或格式不正确，使用内置默认值：${file}`)
  } catch (error) {
    logger.warn(`加载角色库失败，使用内置默认值：${error}`)
  }
  applyVocabulary(DEFAULT_VOCABULARY)
  applyCharacters(DEFAULT_CHARACTERS)
  return characters
}

export function getCharacters(): CharacterProfile[] {
  return characters
}

/** 当前生效的识别词表（只读用途，例如调试和脚本） */
export function getVocabulary(): Vocabulary {
  return vocabulary
}

export interface CharacterMatch {
  name: string
  aliases: string[]
  score: number
  /** 官方外观摘要（发/瞳/标志物），供主模型核对；没有资料时为空串 */
  summary: string
}

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

/**
 * 从角色库的外观文本里取一行摘要（发/瞳/标志物），给主模型核对用。
 * 内置库已经是 40~100 字的识别档案（单行），直接用；
 * 旧格式/用户自定义的长篇外观仍走行挑选逻辑。
 */
export function summarizeAppearance(appearance: string, name = ''): string {
  if (!appearance || appearance.includes('暂无相关资料')) return ''
  const lines = appearance.split('\n').map(line => line.trim()).filter(Boolean)
  if (!lines.length) return ''

  if (lines.length === 1 && appearance.length <= COMPACT_APPEARANCE_MAX) {
    return truncate(stripNamePrefix(appearance.trim(), name), CHARACTER_SUMMARY_MAX_CHARS)
  }

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

/**
 * 候选说明用的摘要：只保留发色、瞳色、头饰这类稳定特征。
 * 服装和道具在同人图里常被换掉（泳装、换装），留着反而让主模型觉得「对不上」。
 */
export function summarizeForMatch(appearance: string, name = ''): string {
  const base = summarizeAppearance(appearance, name)
  if (!base) return ''
  const clauses = base.split(/[、，。；]/).map(clause => clause.trim()).filter(Boolean)
  const core = clauses.filter(clause => /发|瞳|眼|头|帽|耳|蝴蝶结|发箍|兔耳|角|第三只眼|翅膀|尾巴/.test(clause))
  return truncate(core.length ? core.join('、') : base, CHARACTER_SUMMARY_MAX_CHARS)
}

/**
 * 检索候选角色。
 * `colorSource` 是取发色/瞳色的文本：多角色图按角色分别检索时传该角色自己的特征行，
 * 避免把一个角色的粉发和另一个角色的金发混在一起，导致发色对不上的角色也进候选。
 *
 * 打分是外观字段（发色/瞳色/发型/头饰/标志物/服装）+ 0.25 × BM25 的混合值：
 * 合照里服装往往统一，纯 BM25 会被「深蓝色连体泳衣」这类通用词带偏。
 */
export function matchCharacters(description: string, topN = 3, colorSource = description): CharacterMatch[] {
  if (!description) return []
  // 只把角色库里出现过的词算进查询：「这图里都有谁」这类语料外的话不该抬高命中门槛
  const queryTokens = [...new Set(segment(description))]
    .filter(token => token.length >= 2 && corpusTokens.has(token))
  // 多角色图每个角色的特征行很短，固定「命中 6 个词」几乎不可能达到；
  // 按查询长度放宽，但至少命中 3 个词，避免「粉发女孩」这种短句乱给候选。
  const minMatched = Math.min(
    CHARACTER_MATCH_MIN_TOKENS,
    Math.max(3, Math.ceil(queryTokens.length * 0.4)),
  )
  const cleanQuery = stripNegation(description)
  const queryStyles = wordsIn(cleanQuery, vocabulary.styles)
  const queryAccessories = collectAccessories(cleanQuery, false)
  const queryClothing = wordsIn(cleanQuery, vocabulary.clothing)
  const querySignatures = signaturesIn(cleanQuery)
  const queryHair = hairColorFamilies(colorSource)
  const queryHairChars = hairColorChars(colorSource)
  const queryEyeChars = eyeColorCharsInQuery(colorSource)
  const queryEyeFamilies = familiesOf(queryEyeChars)
  const scores = scoreBM25(description, docs)
  const ranked: [number, number][] = []
  for (let id = 0; id < characters.length; id++) {
    const profile = docProfiles[id]
    // 命中的标志物：独特标志（角色库里很少见）可以弥补同人图改了发色/服装的情况
    const signatures = [...querySignatures].filter(name => profile.signatures.has(name))
    const hasRareSignature = signatures.some(name => (signatureRarity.get(name) || 0) <= SIGNATURE_RARE_MAX)
    if (colorConflict(queryHair, profile.hairFamilies) && !hasRareSignature) continue
    let total = BM25_MIX_WEIGHT * (scores.get(id) || 0)
    if (queryHairChars.size && profile.hairChars.size) {
      total += hasOverlap(queryHairChars, profile.hairChars) ? HAIR_EXACT_BONUS
        : hasOverlap(queryHair, profile.hairFamilies) ? HAIR_FAMILY_BONUS : 0
    }
    if (queryEyeChars.size && profile.eyeChars.size) {
      if (hasOverlap(queryEyeChars, profile.eyeChars)) total += EYE_EXACT_BONUS
      else if (hasOverlap(queryEyeFamilies, profile.eyeFamilies)) total += EYE_FAMILY_BONUS
      else total -= EYE_CONFLICT_PENALTY
    }
    for (const style of queryStyles) if (profile.styles.has(style)) total += STYLE_MATCH_BONUS
    for (const [word, colors] of queryAccessories) {
      const docColors = profile.headAccessories.get(word)
      if (!docColors) continue
      if (colors.size && docColors.size) {
        // 查询写了颜色时要求颜色对得上：紫色蝴蝶结不该算到戴红蝴蝶结的角色头上
        total += hasOverlap(colors, docColors)
          ? HEAD_ACCESSORY_BONUS + HEAD_ACCESSORY_COLOR_BONUS
          : HEAD_ACCESSORY_COLOR_MISMATCH_BONUS
      } else {
        total += HEAD_ACCESSORY_BONUS
      }
    }
    for (const item of queryClothing) if (profile.clothing.has(item)) total += CLOTHING_MATCH_BONUS
    for (const name of signatures) {
      total += (signatureRarity.get(name) || 0) <= SIGNATURE_RARE_MAX ? RARE_SIGNATURE_BONUS : SIGNATURE_MATCH_BONUS
    }
    // 用户正文里点名的角色是最强先验
    const named = [characters[id].name, ...characters[id].alias]
      .some(name => name && name.length >= 2 && description.includes(name))
    if (named) total += ALIAS_MATCH_BONUS
    if (total < CHARACTER_MATCH_MIN_SCORE) {
      const matched = queryTokens.filter(token => docTokenSets[id].has(token)).length
      if (matched < minMatched) continue
    }
    ranked.push([id, total])
  }
  return ranked
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id, score]) => ({
      name: characters[id].name,
      aliases: characters[id].alias,
      score,
      summary: summarizeForMatch(characters[id].appearance, characters[id].name),
    }))
}

/** 识图描述里的「特征」行；模型没按格式输出时返回空串 */
export function extractFeatureLines(description: string): string {
  return (description || '')
    .split('\n')
    .map(line => line.trim())
    .filter(line => /^(?:特征|角色|人物)\s*\d*\s*(?:[（(][^）)]*[）)])?\s*[:：]/.test(line))
    .join(' ')
}

/**
 * 每个角色的特征行（不含前缀）。
 * 单角色图是「特征：…」；多角色图按提示词要求写成「特征1：…」「特征2：…」，
 * 每个角色各占一行，检索时分别匹配，避免把两个角色的特征混在一起。
 * 模型常自行加上位置标注（「特征1（左）：」）或改用「角色1：」「人物1：」，一并接受；
 * 同一角色重复出现（漫画多格、模型复读）只保留第一次。
 */
export function extractFeatureGroups(description: string): string[] {
  const groups: string[] = []
  const seen = new Set<string>()
  for (const line of (description || '').split('\n')) {
    const match = line.trim().match(/^(?:特征|角色|人物)\s*\d*\s*(?:[（(][^）)]*[）)])?\s*[:：]\s*(.+)$/)
    if (!match) continue
    const group = match[1].trim()
    if (!group) continue
    // 「特征：图中共有多个角色，按从左到右编号：」这类是说明行，不是角色特征
    if (/[:：]$/.test(group) || /共有.{0,6}角色/.test(group)) continue
    const key = group.replace(/[\s，。、；：,.;:]/g, '')
    if (seen.has(key)) continue
    seen.add(key)
    groups.push(group)
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
export function matchCharacterGroups(description: string, userText = '', topN = 3): CharacterCandidateGroup[] {
  const features = extractFeatureGroups(description)
  const sources = (features.length ? features : [(description || '').trim()]).slice(0, CHARACTER_MAX_GROUPS)
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
    // 第一候选低于最低线说明这组没有可靠预选，宁可不给，避免模型照着弱候选瞎猜
    if (!matches.length || matches[0].score < CHARACTER_GROUP_MIN_SCORE) continue
    groups.push({ label: `角色${groups.length + 1}`, matches })
  }
  return groups
}

const CHARACTER_NOTE_TAIL = '（这些是按识图描述检索出的猜测，按可能性从高到低排列。核对时只看发色、瞳色、头饰是否对得上；'
  + '服装、帽子、道具与同人图不一致很常见（泳装、换装、cosplay），不算对不上。'
  + '第一个候选吻合就用第一个，不要因为服装不同改选后面的。'
  + '没有候选、或候选和描述都对不上的角色，直接说认不出来，绝对不要凭记忆或印象编一个名字；'
  + '候选本身也只是猜测，不要把猜测说成确定答案，也不要仅凭候选否定用户说的角色）'

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

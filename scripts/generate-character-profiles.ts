// 把角色设定里的百科长文蒸馏成识图用的「识别档案」，直接替换 appearance。
// 在工作区根目录运行（需要模型 key）：
//   TOUHOU_PROFILE_API_KEY=... node -r esbuild-register external/satori-ai/scripts/generate-character-profiles.ts
//
// 背景：data/characters.json 只被识图匹配使用，长文里的作品差异、历史版本
// （「服下蓬莱之药前头发为黑色」）会污染发色/瞳色判断，文件也大。这里把每个角色
// 压成 40~80 字的现役外观档案；没有外观资料的角色保持空字符串。
// 先跑 generate-touhou.ts 从 thbwiki 重新生成，再跑本脚本蒸馏。
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

interface Character {
  name: string
  alias: string[]
  appearance: string
}

const API_URL = process.env.TOUHOU_PROFILE_API_URL || 'https://ark.cn-beijing.volces.com/api/v3'
const API_KEY = process.env.TOUHOU_PROFILE_API_KEY || ''
const MODEL = process.env.TOUHOU_PROFILE_MODEL || 'deepseek-v4-1-flash-economy-261017'
const BATCH_SIZE = 6
const CONCURRENCY = 4
/** 已经蒸馏过的档案长度上限：明显比这短说明没被百科长文污染过，跳过重跑 */
const PROFILE_MAX_CHARS = 100
/** 重跑蒸馏（提示词调整后）时设置 TOUHOU_PROFILE_FORCE=1，否则会跳过已蒸馏的短档案 */
const FORCE = process.env.TOUHOU_PROFILE_FORCE === '1'

const SYSTEM_PROMPT = `你是东方Project角色资料整理助手。把每个角色的百科式外观设定浓缩成一条「识图识别档案」。

要求：
- 40~80 字，单行，用顿号分隔，顺序：发色、发型、瞳色、头部配饰、标志性服装或道具。
- 只写现役、最常见作品里的外观。多版本差异取最常见的一种，不写「在XX作品中为…」。
- 瞳色、发色在不同作品里写法不同时，把原文明确写到的颜色都保留（最多三种，如「黑色、棕色或红色眼瞳」），不要只取最常见的一种。
- 头饰/发饰的颜色必须保留（如「紫色蝴蝶结」「白色兔耳发饰」），这是识图时最有区分度的特征。
- 必须保留最显眼的标志：第三只眼、兔耳、猫耳、蝴蝶结、帽子、女仆头饰、翅膀、尾巴、武器等。
- 不写身高、年龄、能力、性格、人际关系、作品出处、剧情。
- 原文没有外观信息（如「暂无相关资料」）时，profile 留空字符串。

只输出 JSON 数组，元素形如 {"index": 0, "profile": "..."}，index 对应输入编号，不要解释。`

/** 兼容新旧两种结构：纯角色数组 / { version, vocabulary, characters } */
function readCharacters(path: string): Character[] {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  return Array.isArray(raw) ? raw : raw.characters
}

async function distill(batch: { index: number, character: Character }[]): Promise<Map<number, string>> {
  const input = batch
    .map(({ index, character }) => `【${index}】${character.name}（别名：${character.alias.join('、') || '无'}）\n${character.appearance}`)
    .join('\n\n')
  const res = await fetch(`${API_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: input },
      ],
      temperature: 0.1,
      max_tokens: 2048,
      thinking: { type: 'disabled' },
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  const json = await res.json() as any
  const text: string = json.choices?.[0]?.message?.content || ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error(`返回里没有 JSON 数组：${text.slice(0, 200)}`)
  const parsed = JSON.parse(match[0]) as { index: number, profile: string }[]
  const result = new Map<number, string>()
  for (const item of parsed) {
    if (typeof item?.index === 'number') result.set(item.index, String(item.profile || '').trim())
  }
  return result
}

async function main() {
  if (!API_KEY) {
    console.error('缺少 TOUHOU_PROFILE_API_KEY')
    process.exit(1)
  }
  const target = new URL('../src/data/characters.json', import.meta.url)
  // 重新蒸馏时要对着原始百科长文，而不是上一版已经压短的档案
  const sourcePath = process.env.TOUHOU_PROFILE_SOURCE
  const source = sourcePath ? resolve(sourcePath) : fileURLToPath(target)
  const sourceCharacters = readCharacters(source)
  const targetRaw = JSON.parse(readFileSync(target, 'utf8'))
  const targetCharacters = (Array.isArray(targetRaw) ? targetRaw : targetRaw.characters) as Character[]

  const pending = sourceCharacters
    .map((character, index) => ({ index, character }))
    .filter(({ character }) => character.appearance.trim() && (FORCE || character.appearance.length > PROFILE_MAX_CHARS))
  console.log(`共 ${sourceCharacters.length} 个角色，需要蒸馏 ${pending.length} 个`)

  const batches: { index: number, character: Character }[][] = []
  for (let i = 0; i < pending.length; i += BATCH_SIZE) batches.push(pending.slice(i, i + BATCH_SIZE))

  let done = 0
  const failed: number[] = []
  const profiles = new Map<string, string>()
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const chunk = batches.slice(i, i + CONCURRENCY)
    const results = await Promise.all(chunk.map(async (batch) => {
      try {
        return await distill(batch)
      } catch (error) {
        console.error(`批次失败（${batch.map(item => item.character.name).join('、')}）：${error}`)
        return new Map<number, string>()
      }
    }))
    for (const [batchIndex, batch] of chunk.entries()) {
      for (const { index, character } of batch) {
        const profile = results[batchIndex].get(index)
        if (profile == null) {
          failed.push(index)
          continue
        }
        profiles.set(character.name, profile)
        done += 1
      }
    }
    console.log(`进度 ${done}/${pending.length}`)
  }

  for (const character of targetCharacters) {
    const profile = profiles.get(character.name)
    if (profile) character.appearance = profile
  }
  const output = Array.isArray(targetRaw) ? targetCharacters : { ...targetRaw, characters: targetCharacters }
  writeFileSync(target, JSON.stringify(output, null, 2), 'utf8')
  console.log(`已写入 ${target.pathname}`)
  if (failed.length) {
    console.error(`以下角色蒸馏失败，保留原文：${failed.map(index => sourceCharacters[index].name).join('、')}`)
    process.exit(1)
  }
}

main()

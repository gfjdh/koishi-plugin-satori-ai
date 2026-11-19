// 从 thbwiki 插件生成角色数据（当前内置数据是东方角色）。
// 在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/generate-touhou.ts
// 然后必须再跑一次蒸馏，把百科长文压成识别档案：
//   TOUHOU_PROFILE_API_KEY=... node -r esbuild-register external/satori-ai/scripts/generate-character-profiles.ts
//
// 生成结果 src/data/characters.json 会随插件打包，作为默认值；
// 运行时会复制到 dataDir/characters.json，用户可以自行修改。
// 识别词表（vocabulary）从现有 JSON 原样保留，只替换角色数据。
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { characters } from '../../thbwiki/src/characters'

const entries = characters.map(character => ({
  name: character.name,
  alias: character.alias || [],
  appearance: character.appearance || '',
}))

const target = new URL('../src/data/characters.json', import.meta.url)
let vocabulary: unknown
try {
  const existing = JSON.parse(readFileSync(target, 'utf8'))
  vocabulary = Array.isArray(existing) ? undefined : existing.vocabulary
} catch {
  vocabulary = undefined
}
if (!vocabulary) {
  console.error('现有 characters.json 里没有 vocabulary 词表，先恢复词表再运行')
  process.exit(1)
}

mkdirSync(new URL('../src/data', import.meta.url), { recursive: true })
writeFileSync(target, JSON.stringify({ version: 2, vocabulary, characters: entries }, null, 2), 'utf8')
console.log(`已生成 ${entries.length} 个角色`)

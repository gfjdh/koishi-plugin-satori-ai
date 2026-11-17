// 从 thbwiki 插件生成角色数据，供识图角色匹配和常识库使用。
// 在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/generate-touhou.ts
//
// 生成结果 src/data/touhou-characters.json 会随插件打包，作为默认值；
// 运行时会复制到 dataDir/touhou_characters.json，用户可以自行修改。
import { mkdirSync, writeFileSync } from 'node:fs'
import { characters } from '../../thbwiki/src/characters'

const entries = characters.map(character => ({
  name: character.name,
  alias: character.alias || [],
  appearance: character.appearance || '',
}))

const target = new URL('../src/data/touhou-characters.json', import.meta.url)
mkdirSync(new URL('../src/data', import.meta.url), { recursive: true })
writeFileSync(target, JSON.stringify(entries, null, 2), 'utf8')
console.log(`已生成 ${entries.length} 个角色`)

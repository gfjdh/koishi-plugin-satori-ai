// 给精简后的角色档案补回蒸馏时丢掉的标志物词（不重新蒸馏，不改写其他内容）。
// 以 thbwiki 原始长文为准：原文里有的标志物、档案里没有的，按原文写法追加到档案末尾。
// 在工作区根目录运行：
//   node -r esbuild-register external/satori-ai/scripts/augment-character-signatures.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { characters as sourceCharacters } from '../../thbwiki/src/characters'
import { findSignatures } from '../src/character-recognition'

interface Character {
  name: string
  alias: string[]
  appearance: string
}

const target = new URL('../src/data/characters.json', import.meta.url)
const raw = JSON.parse(readFileSync(target, 'utf8'))
const characters = (Array.isArray(raw) ? raw : raw.characters) as Character[]
const originalByName = new Map(sourceCharacters.map(character => [character.name, character.appearance || '']))

let changed = 0
for (const character of characters) {
  const original = originalByName.get(character.name)
  if (!original) continue
  // 名字里带「枪」「弓」的角色不能靠名字本身命中标志物，扫描前先去掉名字和别名
  let text = original
  for (const name of [character.name, ...character.alias]) {
    if (name && name.length >= 2) text = text.split(name).join('')
  }
  const current = findSignatures(character.appearance)
  const missing: string[] = []
  for (const [name, words] of findSignatures(text)) {
    if (current.has(name)) continue
    missing.push(words[0] || name)
  }
  if (!missing.length) continue
  character.appearance = `${character.appearance}、${missing.join('、')}`
  changed += 1
  console.log(`${character.name}：补上 ${missing.join('、')}`)
}

const output = Array.isArray(raw) ? characters : { ...raw, characters }
writeFileSync(target, JSON.stringify(output, null, 2), 'utf8')
console.log(`已更新 ${changed} 个角色`)

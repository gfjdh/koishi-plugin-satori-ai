// src/fixed-dialogues.ts
import { Session } from 'koishi'
import { User } from './types'
import { updateFavorability } from './database'
import { Context } from 'koishi'
import * as fs from 'fs'
import * as path from 'path'
import { parseTimeToMinutes } from './utils'

export interface FixedDialogue {
  triggers: string[]
  favorabilityRange?: [number, number]
  probability: number
  timeRange?: [string, string]
  response: string
  favorability?: number
}

export async function handleFixedDialogues(
  ctx: Context,
  session: Session,
  user: User,
  config: {
    dataDir: string
    enable_favorability: boolean
    enable_fixed_dialogues: boolean
  }
): Promise<string | null> {
  if (!config.enable_fixed_dialogues) return null

  const filePath = path.join(config.dataDir, 'fixed_dialogues.json')
  await ensureFixedDialoguesFile(filePath)

  const dialogues = await loadFixedDialogues(filePath)
  const currentTime = parseTime(session.timestamp)

  const matched = dialogues.filter(dialogue =>
    matchDialogue(dialogue, session.content, user, currentTime)
  )

  if (matched.length === 0) return null

  const selected = selectDialogueByProbability(matched)
  await processFavorability(ctx, user, selected)

  return selected.response
}

async function ensureFixedDialoguesFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    const defaultDialogues: FixedDialogue[] = [
      {
        triggers: ["你好", "您好"],
        favorabilityRange: [0, 100],
        probability: 1,
        timeRange: ["06:00", "08:00"],
        response: "早上好！很高兴见到你。"
      },
      {
        triggers: ["再见", "拜拜"],
        favorabilityRange: [0, 100],
        probability: 1,
        timeRange: ["18:00", "20:00"],
        response: "再见！希望很快再见到你。"
      }
    ]
    fs.writeFileSync(filePath, JSON.stringify(defaultDialogues, null, 2))
  }
}

async function loadFixedDialogues(filePath: string): Promise<FixedDialogue[]> {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (error) {
    console.error('Error loading fixed dialogues:', error)
    return []
  }
}

function matchDialogue(
  dialogue: FixedDialogue,
  content: string,
  user: User,
  currentTime: number
): boolean {
  const triggerMatch = dialogue.triggers.some(t => content === t)
  const favorabilityMatch = matchFavorability(dialogue, user)
  const timeMatch = matchTimeRange(dialogue, currentTime)

  return triggerMatch && favorabilityMatch && timeMatch
}

function matchFavorability(dialogue: FixedDialogue, user: User): boolean {
  if (!dialogue.favorabilityRange) return true
  const [min, max] = dialogue.favorabilityRange
  return user.favorability >= min && user.favorability <= max
}

function parseTime(timestamp: number): number {
  const date = new Date(timestamp)
  return date.getHours() * 60 + date.getMinutes()
}

function matchTimeRange(dialogue: FixedDialogue, currentTime: number): boolean {
  if (!dialogue.timeRange) return true
  const [start, end] = dialogue.timeRange.map(parseTimeToMinutes)
  return currentTime >= start && currentTime <= end
}

function selectDialogueByProbability(dialogues: FixedDialogue[]): FixedDialogue {
  const total = dialogues.reduce((sum, d) => sum + d.probability, 0)
  let random = Math.random() * total

  for (const dialogue of dialogues) {
    random -= dialogue.probability
    if (random <= 0) return dialogue
  }
  return dialogues[0]
}

async function processFavorability(ctx: Context, user: User, dialogue: FixedDialogue) {
  if (dialogue.favorability) {
    await updateFavorability(ctx, user.userid, dialogue.favorability)
  }
}

//后续可以通过实现以下接口进行扩展
export interface DialogueMatcher {
  match(session: Session, user: User): boolean
}

export interface DialogueSelector {
  select(dialogues: FixedDialogue[]): FixedDialogue
}

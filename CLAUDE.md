# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `koishi-plugin-satori-ai`, a Koishi chatbot plugin providing AI chat functionality via the Satori adapter. It features long-term memory, favorability/mood systems, weather perception, and various mini-games.

## Commands

```bash
# Type-check and emit declarations (lib/*.d.ts)
npm run build
# or
tsc

# Runtime bundle lib/index.js is built by the workspace root:
#   npx yakumo build satori-ai
```

## Architecture

### Core Service (`src/index.tsx`)

The `SAT` class extends Koishi's `Service` and acts as the main orchestrator. It:
- Injects `console` and `database` (required), `censor` and `puppeteer` (optional)
- Manages all sub-managers and their lifecycles
- Handles middleware registration

### Manager Classes

| Module | File | Purpose |
|--------|------|---------|
| `Memory` | `src/memory/` | Layered long-term memory (topic/day/week/month/season/year) backed by SQLite, plus short-term channel memory and profile |
| `Favorability` | `src/favorability.ts` | Six-level relationship system (厌恶→陌生→朋友→暧昧→恋人→夫妻/母子) with daily limits |
| `Mood` | `src/mood.ts` | Mood system affecting reply style, daily reset, snack-box item |
| `Weather` | `src/weather.ts` | Weather perception with JWT authentication support |
| `Broadcast` | `src/broadcast.ts` | Message broadcasting with channel blocking |
| `Emoji` | `src/emoji.ts` | Random emoji attachment based on probability |
| `APIClient` | `src/api.ts` | LLM API requests with multi-key rotation and retry logic |

### Memory Subsystem (`src/memory/`)

| File | Purpose |
|------|---------|
| `index.ts` | Facade used by `src/index.tsx`; wires every component |
| `repository.ts` | All reads/writes of `sat_*` tables |
| `short-term.ts` | In-memory channel memories and recent channel dialogues |
| `context.ts` | Builds the memory section of the system prompt |
| `summarizer.ts` | Topic switch detection and layered summaries |
| `heartbeat.ts` | Background scheduler for summarization |
| `profile.ts` | Incremental user profile, driven by daily summaries (replaces the old user portrait module) |
| `retrieval.ts` | BM25 retrieval for recall |
| `migrate.ts` | One-time migration from legacy JSON storage |
| `schema.ts` | Table definitions and indexes |

### API Layer (`src/api.ts`)

- **Dual-model support**: `appointModel` (reasoner like DeepSeek-R1) + `not_reasoner_LLM` (chat model for short inputs)
- **Auxiliary model**: Separate model for favorability/mood analysis and background summarization (cost-saving)
- **Key rotation**: Automatically rotates through API keys on failure
- **Special item**: Users with `地灵殿通行证` item can use their own API keys

### Middleware Pipeline (`src/middleware.ts`)

Processes messages in order:
1. Private message handling (if enabled)
2. Nickname trigger detection
3. Random probability trigger
4. Channel memory updates
5. Special messages (images, @mentions, files) bypass AI

### Games

Located in `src/game*.ts`:
- `Gobang` - Five-in-a-row game
- `Fencing` - Sword fighting game
- `Galgame` - Dating sim narrative engine
- `OneTouch` - Puppeteer-based touch game

### Data Storage

- **Layered memory**: SQLite tables `sat_dialogue`, `sat_memory`, `sat_knowledge`, `sat_profile`, `sat_meta`
- **User data**: `p_system` table (favorability, mood is in-memory, items, points, daily usage)
- **Files under `dataDir`**: `output_censor.txt`, `input_censor.txt`, `fixed_dialogues.json`, `event/*.json`, `emojis/`
- **Legacy**: older versions stored memory as JSON under `dataDir/dialogues/`; `migrate.ts` imports it once

### Configuration Schema

Defined in `Sat.Config` using `Schema.intersect()`. Key sections:
- **Base settings**: API URLs, model selection, keys
- **Memory settings**: context length, filter words, retrieval topN
- **Favorability settings**: levels, prompts per level, daily caps
- **Mood settings**: thresholds, prompts, pocket money system

### TypeScript Configuration

- `rootDir: src`, `outDir: lib`
- JSX with `@satorijs/element` as JSX factory
- Declaration emit only (`emitDeclarationOnly: true`)

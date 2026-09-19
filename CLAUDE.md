# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `koishi-plugin-satori-ai`, a Koishi chatbot plugin providing AI chat functionality via the Satori adapter. It features long-term memory, favorability/mood systems, weather perception, and various mini-games.

## Commands

```bash
# Build the plugin (TypeScript → JavaScript)
npm run build
# or
tsc

# Install for development
npm install
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
| `Memory` | `src/memory.ts` | Short-term channel memory + long-term user memory (RAG-style retrieval from JSON files) |
| `Favorability` | `src/favorability.ts` | Six-level relationship system (厌恶→陌生→朋友→暧昧→恋人→夫妻) with daily limits |
| `Mood` | `src/mood.ts` |情绪 system affecting reply style, daily reset |
| `Weather` | `src/weather.ts` | Weather perception with JWT authentication support |
| `Broadcast` | `src/broadcast.ts` | Message broadcasting with channel blocking |
| `UserPortrait` | `src/userportrait.ts` | LLM-driven user portrait generation |
| `Emoji` | `src/emoji.ts` | Random emoji attachment based on probability |
| `APIClient` | `src/api.ts` | LLM API requests with multi-key rotation and retry logic |

### API Layer (`src/api.ts`)

- **Dual-model support**: `appointModel` (reasoner like DeepSeek-R1) + `not_reasoner_LLM` (chat model for short inputs)
- **Auxiliary model**: Separate model for favorability/mood analysis (cost-saving)
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

- **Path**: `./data/satori_ai/` (configurable via `dataDir`)
- **User memory**: `dialogues/<user_id>.txt` (JSON format)
- **Common sense**: `common_sense.txt`
- **Censor lists**: `output_censor.txt`, `input_censor.txt`
- **Fixed dialogues**: `fixed_dialogues.json`

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

# NEXUM v1 — Telegram AI Superagent

A powerful Telegram-first AI assistant with mini-apps, PC Agent, and multi-provider AI routing.

## Features

- **Multi-provider AI**: Cerebras, Groq, Gemini, DeepSeek, Claude, Grok, OpenRouter, SambaNova, Together
- **Tariffs**: Free (70 msg/day) / Middle ($9/mo, 300/day) / Pro ($15/mo, unlimited BYOK)
- **Mini-Apps**: Finance, Tasks, Notes, Habits, Calendar, Contacts, Agent panel
- **PC Agent**: Remote control your computer (Pro only)
- **Memory**: Long-term facts about users (Middle/Pro)
- **Voice**: STT via Groq Whisper, TTS via Groq
- **Web search**: Via Serper API
- **Background tasks**: AI subagents (Pro)

## Quick Start

```bash
cp .env.example .env
# Edit .env with your keys

npm ci
npm run build
npm start
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `WEBAPP_URL` | recommended | Your Railway service URL |
| `ADMIN_IDS` | recommended | Comma-separated Telegram user IDs |
| `PUBLIC_BOT` | optional | Set `true` to allow all users |
| `CB1`..`CB10` | optional | Cerebras API keys (fast, free) |
| `GR1`..`GR10` | optional | Groq API keys (fast + STT/TTS) |
| `G1`..`G10` | optional | Gemini API keys (vision) |
| `DS1`..`DS10` | optional | DeepSeek API keys |
| `CL1`..`CL10` | optional | Claude/Anthropic API keys |
| `GK1`..`GK10` | optional | Grok (xAI) API keys |
| `OR1`..`OR10` | optional | OpenRouter API keys |
| `SERPER_KEY` | optional | Serper web search API key |

## Deploy on Railway

1. Push to GitHub
2. Create new Railway project from GitHub repo
3. Add environment variables
4. Railway auto-detects Dockerfile and deploys

## PC Agent

See `pc_agent/README.md` for setup instructions.

## Architecture

```
src/
  index.ts          — Entry point
  core/
    config.ts       — Config & key rotation
    db.ts           — SQLite wrapper & schema
    billing.ts      — Tariff system
  telegram/
    commands.ts     — All bot commands
    handler.ts      — Message handlers
    draft-stream.ts — Streaming reply updater
  agent/
    executor.ts     — Agent with tool routing
    router.ts       — Multi-provider AI router
    memory.ts       — Conversation + long-term memory
    pairing.ts      — PC Agent link codes
    pcagent_protocol.ts — WebSocket command protocol
  apps/
    server.ts       — Express HTTP + WebSocket server
  tools/
    search.ts       — Serper web search
    stt.ts          — Speech-to-text (Groq Whisper)
    tts.ts          — Text-to-speech (Groq)
  public/           — Mini-app HTML pages
pc_agent/
  nexum_agent.py    — Python PC Agent
```

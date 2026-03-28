# NEXUM v1.0

**Telegram-first AI operator platform**

> OpenClaw-inspired capabilities · Production-ready · Railway-deployed

---

## What is NEXUM?

NEXUM is a personal AI assistant that lives in Telegram. It combines a sharp conversational AI with operator-level capabilities: remote PC control, file operations, shell execution, browser automation, mini-apps, memory, and BYOK support — all behind a clean safety layer.

Inspired architecturally by [OpenClaw](https://github.com/openclaw/openclaw), built Telegram-first.

---

## Architecture

```
src/
  index.ts                        ← Entry point (HTTP → Bot)
  infra/
    logger.ts                     ← Structured logging
  core/
    config.ts                     ← Env config + key rotation + validation
    db.ts                         ← better-sqlite3 (sync, no data races)
    billing.ts                    ← Tariffs + feature gates
  agent/
    capabilities/
      registry.ts                 ← Capability registry (safe/sensitive/dangerous)
      safety.ts                   ← Safety layer + approval flow + audit log
    persona.ts                    ← Tone of voice + response templates + formatter
    executor.ts                   ← Message pipeline (rate limit → tools → LLM → memory)
    router.ts                     ← Multi-provider AI (BYOK → system fallback)
    memory.ts                     ← Conversation history + long-term facts
    pairing.ts                    ← PC agent link codes + device registry
    pcagent_protocol.ts           ← WebSocket dispatch with safety checks
  telegram/
    handler.ts                    ← Text / voice / photo / document handlers
    draft-stream.ts               ← Progressive message editing (typing UX)
    commands/
      index.ts                    ← Command registry
      general.ts                  ← /start /help /status /new /memory /search /remind
      mini-apps.ts                ← /apps /finance /tasks /notes /habits /calendar
      byok.ts                     ← /setkey /mykeys
      pc-agent.ts                 ← /link /pc /run /screenshot /sysinfo /bgrun /bglist
      admin.ts                    ← /admin_stats /broadcast /approve
  apps/
    server.ts                     ← Express + WebSocket + REST API
  tools/
    search.ts                     ← Serper web search
    tts.ts                        ← Groq TTS
    stt.ts                        ← Groq Whisper STT
  public/                         ← Mini-app HTML pages
pc_agent/
  nexum_agent.py                  ← Python PC agent (auto-reconnect + safety)
  requirements.txt
```

---

## Key Design Decisions

### OpenClaw-inspired patterns in NEXUM

| Pattern | OpenClaw | NEXUM |
|---|---|---|
| Capability registry | `tool-policy`, allowlist/denylist | `capabilities/registry.ts` — per-action class |
| Safety layer | `exec-approvals`, two-phase confirm | `capabilities/safety.ts` — inline keyboard confirm |
| Path safety | `path-policy.ts` — workspace boundary | `safety.ts` — traversal + blocked paths |
| Owner-only tools | `applyOwnerOnlyToolPolicy()` | Pro-plan gate + sender checks |
| Tool audit log | Structured exec logs | `auditLog()` — persisted to DB |
| Identity/persona | `identity.ts`, `ackReaction` | `persona.ts` — tone + templates |
| Blocked commands | BLOCKED_COMMAND_PATTERNS | Same pattern, server + agent side |
| BYOK key priority | `auth-profiles` rotation | BYOK providers tried first |

### Why better-sqlite3?
The original project used `sqlite3` (async callbacks), which caused data races — `get()` and `all()` could return stale values. `better-sqlite3` is fully synchronous: no races, 2× faster.

### Safety classification (OpenClaw-inspired)
Every PC action is classified:
- **safe**: read-only (screenshot, file_read, sysinfo, file_list)
- **sensitive**: reversible side effects (mouse, keyboard, type, file_write)
- **dangerous**: irreversible or high-privilege (run_cmd, file_delete) — require confirmation

Dangerous actions trigger an inline keyboard approval prompt before execution.

---

## Plans

| Feature | Free | Middle ($9) | Pro ($15) |
|---|---|---|---|
| Messages/day | 70 | 300 | ∞ (BYOK) |
| Memory | ❌ | ✅ | ✅ |
| Mini-apps | ❌ | ✅ | ✅ |
| BYOK | ❌ | ❌ | ✅ |
| PC Agent | ❌ | ❌ | ✅ |
| Background tasks | ❌ | ❌ | ✅ |

---

## Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set BOT_TOKEN at minimum

# 3. Build TypeScript
npm run build

# 4. Start
npm start

# Development (no build step)
npm run dev
```

---

## Railway Deploy

1. Push to GitHub: `git push origin main`
2. Create Railway project → Deploy from GitHub
3. Add env variables (see `.env.example`)
4. Railway uses `Dockerfile` automatically via `railway.json`
5. Add a Volume at `/app/data` for SQLite persistence

Health check: `GET /health` — responds immediately even if bot fails to start.
Readiness check: `GET /ready` — verifies DB connection.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ADMIN_IDS` | Recommended | Your Telegram user ID |
| `WEBAPP_URL` | For mini-apps | Railway service URL |
| `PUBLIC_BOT` | Optional | `true` = anyone can use the bot |
| `PORT` | Optional | HTTP port (default: 3000) |
| `DB_PATH` | Optional | SQLite path (default: ./data/nexum.db) |
| `CB1`–`CB10` | 1+ AI key needed | Cerebras keys |
| `GR1`–`GR10` | | Groq keys (also used for TTS/STT) |
| `G1`–`G10` | | Gemini keys (vision support) |
| `GK1`–`GK10` | | Grok (xAI) keys |
| `SN1`–`SN10` | | SambaNova keys |
| `TO1`–`TO10` | | Together AI keys |
| `OR1`–`OR10` | | OpenRouter keys |
| `DS1`–`DS10` | | DeepSeek keys |
| `CL1`–`CL10` | | Claude/Anthropic keys |
| `SERPER_KEY` | For /search | Serper web search key |

---

## PC Agent Setup (Pro only)

```bash
cd pc_agent
pip install -r requirements.txt

# Get link code from Telegram: /link
python nexum_agent.py --code ABCD1234 --server wss://your-app.railway.app
```

The agent auto-reconnects. All dangerous commands (shell, file delete) require explicit approval via Telegram inline keyboard before executing.

---

## Bot Commands

| Command | Plan | Description |
|---|---|---|
| `/start` | All | Welcome |
| `/help` | All | All commands |
| `/status` | All | Plan + usage |
| `/new` | All | Fresh conversation |
| `/memory` | Middle+ | Long-term memory |
| `/forget` | All | Clear memory |
| `/tariffs` | All | Plans |
| `/apps` | Middle+ | Mini-apps hub |
| `/search [q]` | All | Web search |
| `/remind [text] [min]` | All | Set reminder |
| `/voice` | All | Toggle voice |
| `/setkey [provider] [key]` | Pro | Add BYOK key |
| `/link` | Pro | Pair PC |
| `/pc` | Pro | PC status |
| `/run [cmd]` | Pro | Shell command (with approval) |
| `/screenshot` | Pro | Take screenshot |
| `/sysinfo` | Pro | System info |
| `/bgrun [task]` | Pro | Background AI task |
| `/bglist` | Pro | Task status |

---

## Technical Debt

| # | Item | Priority |
|---|---|---|
| 1 | Stripe/payment integration — plan upgrades are manual via `/approve` | High |
| 2 | Real token streaming — currently simulated with word-chunking | Medium |
| 3 | Multi-device support per user — currently 1 device | Medium |
| 4 | Rate limiting on REST `/api/*` endpoints | Medium |
| 5 | Unit and integration tests | Low |
| 6 | Browser automation (CDP) — skeleton ready, needs implementation | Low |

---

*NEXUM v1.0 · March 2026 · Node.js 20 + TypeScript 5.5 + grammY + better-sqlite3*

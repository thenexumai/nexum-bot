# NEXUM Additions — How to Merge

This ZIP contains new modules to add to your existing `nexum-bot` project.

## What's new in this package

| Path | Description |
|------|-------------|
| `src/soul/` | Bot identity, personality, goals system |
| `src/state/` | User context manager, session manager |
| `src/evolution/` | Self-evolution: error detection, fix generation |
| `src/telegram/commands/evolution.ts` | Admin commands: /pending_fixes, /approve_fix, /reject_fix, /evolution_status |
| `src/core/migrations.ts` | DB migration for evolution tables |
| `system/soul.yaml` | Bot soul definition |
| `system/capabilities.yaml` | All capabilities defined |
| `system/policies.yaml` | Safety policies |
| `system/user-context.yaml` | User context template |
| `pc_agent/` | Full Python PC Agent |

## Installation

### 1. Copy files into your project
```bash
# From this ZIP, copy everything into your nexum-bot/ root
cp -r src/ nexum-bot/src/
cp -r system/ nexum-bot/system/
cp -r pc_agent/ nexum-bot/pc_agent/
```

### 2. Add js-yaml dependency (for soul.yaml loading)
```bash
npm install js-yaml
npm install -D @types/js-yaml
```

### 3. Wire evolution into src/index.ts
```typescript
import { initEvolution } from './evolution/index';
import { migrateEvolutionTables } from './core/migrations';
import { db } from './core/db';

// After DB init:
migrateEvolutionTables(db);

// After bot is ready:
initEvolution(async (msg) => {
  await bot.api.sendMessage(config.adminIds[0], msg, { parse_mode: 'Markdown' });
});
```

### 4. Register evolution commands in bot
```typescript
import { registerEvolutionCommands } from './telegram/commands/evolution';
registerEvolutionCommands(bot);
```

### 5. Setup PC Agent (on your local PC)
```bash
cd pc_agent
pip install -r requirements.txt
playwright install chromium

# Get pairing code from Telegram: /link
python nexum_agent.py --code YOUR_CODE --server wss://your-app.railway.app
```

## PC Agent Commands (Pro users)

After `/link` and connecting the agent:

| Command | Description |
|---------|-------------|
| `/screenshot` | Screenshot your screen |
| `/run <cmd>` | Run shell command (requires confirmation) |
| `/read <path>` | Read file contents |
| `/browse <url>` | Open URL in headless browser |
| `/pc` | PC Agent status |

## Evolution System

The self-evolution system:
1. Captures runtime errors automatically
2. After 3+ occurrences, generates a fix using AI
3. Sends fix to admin via Telegram
4. Admin approves/rejects with `/approve_fix` or `/reject_fix`

Admin commands: `/pending_fixes`, `/approve_fix <id>`, `/reject_fix <id>`, `/evolution_status`

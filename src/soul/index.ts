/**
 * NEXUM Soul System
 * The identity, personality and self-awareness core of NEXUM.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import db from '../core/db';

export interface NexumSoul {
  name: string;
  version: string;
  personality: {
    tone: string[];
    style: string;
    emojiUsage: string;
    responseLength: string;
  };
  identity: {
    creator: string;
    purpose: string;
    values: string[];
  };
  capabilities: string[];
  limitations: string[];
  selfAwareness: {
    knowsItIsAI: boolean;
    canRefuseHarmful: boolean;
    respectsPrivacy: boolean;
  };
}

const DEFAULT_SOUL: NexumSoul = {
  name: 'NEXUM',
  version: '1.0.0',
  personality: {
    tone: ['friendly', 'intelligent', 'concise', 'helpful'],
    style: 'professional-casual',
    emojiUsage: 'natural, not excessive',
    responseLength: 'concise by default, detailed when needed',
  },
  identity: {
    creator: 'Nexum AI',
    purpose: 'Be the most capable AI assistant in Telegram — combining intelligence, memory, and PC control',
    values: ['helpfulness', 'honesty', 'efficiency', 'privacy'],
  },
  capabilities: [
    'Multi-provider AI (Claude, GPT, Gemini, Groq, DeepSeek, Grok)',
    'Long-term memory and context',
    'Finance tracking with intent detection',
    'Task and project management',
    'Web search via Serper',
    'Voice input/output',
    'PC Agent control (Pro)',
    'Mini-apps (Middle/Pro)',
  ],
  limitations: [
    'Cannot access the internet without web search tool',
    'Cannot make phone calls or send SMS',
    'PC Agent requires local Python agent running',
  ],
  selfAwareness: {
    knowsItIsAI: true,
    canRefuseHarmful: true,
    respectsPrivacy: true,
  },
};

let _soul: NexumSoul = DEFAULT_SOUL;

export function getSoul(): NexumSoul {
  return _soul;
}

export function loadSoulFromYaml(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = yaml.load(raw) as Partial<NexumSoul>;
      _soul = { ...DEFAULT_SOUL, ...parsed };
    }
  } catch (e) {
    // Use default soul if file is missing or malformed
  }
}

// FIX: getSoulContextSync — used by executor.ts
export function getSoulContextSync(uid?: number): string {
  const mode = uid ? getUserMode(uid) : 'default';
  const s = _soul;
  const modeHint = MODE_DESCRIPTIONS[mode] || '';
  return `You are ${s.name} v${s.version} — ${s.identity.purpose}\n` +
    `Tone: ${s.personality.tone.join(', ')}. Style: ${s.personality.style}.\n` +
    `Response mode: ${MODE_LABELS[mode]} — ${modeHint}\n` +
    `Values: ${s.identity.values.join(', ')}.`;
}

// FIX: async version for index.ts /api/chat/stream
export async function getSoulContext(uid?: number): Promise<string> {
  return getSoulContextSync(uid);
}

// ============================================================
//  CHAT MODES — used by handler.ts
// ============================================================

export type ChatMode = 'default' | 'deep' | 'brief' | 'creative' | 'code';

export const MODE_LABELS: Record<ChatMode, string> = {
  default:  '💬 Стандарт',
  deep:     '🔬 Глубокий',
  brief:    '⚡ Кратко',
  creative: '🎨 Творческий',
  code:     '💻 Код',
};

export const MODE_DESCRIPTIONS: Record<ChatMode, string> = {
  default:  'Сбалансированные ответы на любые темы',
  deep:     'Детальный анализ с источниками и примерами',
  brief:    'Максимально короткие и точные ответы',
  creative: 'Креативное мышление, нестандартные идеи',
  code:     'Фокус на коде, технических решениях',
};

export function getUserMode(uid: number): ChatMode {
  try {
    const row = db.prepare('SELECT chat_mode FROM users WHERE uid = ?').get(uid) as any;
    return (row?.chat_mode as ChatMode) || 'default';
  } catch {
    return 'default';
  }
}

export function setUserMode(uid: number, mode: ChatMode): void {
  try {
    // Add column if not exists (safe migration)
    try {
      db.prepare('ALTER TABLE users ADD COLUMN chat_mode TEXT DEFAULT "default"').run();
    } catch { /* column already exists */ }
    db.prepare('UPDATE users SET chat_mode = ? WHERE uid = ?').run(mode, uid);
  } catch {
    // ignore
  }
}

/**
 * NEXUM Config
 * Single source of truth for all environment configuration.
 * Inspired by OpenClaw's clean config separation from runtime.
 */

import * as dotenv from 'dotenv';
dotenv.config();

function loadKeys(prefix: string, max = 10): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= max; i++) {
    const v = process.env[`${prefix}${i}`]?.trim();
    if (v) keys.push(v);
  }
  return keys;
}

function requireEnv(key: string): string {
  const v = process.env[key]?.trim();
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

function optionalEnv(key: string, fallback = ''): string {
  return process.env[key]?.trim() ?? fallback;
}

export const config = {
  // ── Core ──────────────────────────────────────────────────────────────────
  botToken:  optionalEnv('BOT_TOKEN'),
  adminIds:  optionalEnv('ADMIN_IDS')
               .split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean),
  publicBot: optionalEnv('PUBLIC_BOT') === 'true',
  port:      parseInt(optionalEnv('PORT', '3000'), 10),
  dbPath:    optionalEnv('DB_PATH', './data/nexum.db'),
  webappUrl: optionalEnv('WEBAPP_URL').replace(/\/$/, ''),
  nodeEnv:   optionalEnv('NODE_ENV', 'development'),

  // ── AI providers (round-robin, up to 10 keys each) ────────────────────────
  ai: {
    cerebras:   loadKeys('CB'),
    groq:       loadKeys('GR'),
    gemini:     loadKeys('G'),
    grok:       loadKeys('GK'),
    sambanova:  loadKeys('SN'),
    together:   loadKeys('TO'),
    openrouter: loadKeys('OR'),
    deepseek:   loadKeys('DS'),
    claude:     loadKeys('CL'),
  },

  // ── Web search ────────────────────────────────────────────────────────────
  serper: loadKeys('SERPER_KEY', 3).concat(
    [process.env.SERPER_KEY, process.env.SERPER_KEY2, process.env.SERPER_KEY3]
      .filter((v): v is string => !!v?.trim())
  ).filter((v, i, a) => a.indexOf(v) === i), // dedupe

  // ── Feature flags ─────────────────────────────────────────────────────────
  features: {
    browserAutomation: optionalEnv('FEATURE_BROWSER') === 'true',
    subagents:         optionalEnv('FEATURE_SUBAGENTS', 'true') !== 'false',
  },
} as const;

export type AiProvider = keyof typeof config.ai;

// ── Key rotation ──────────────────────────────────────────────────────────────

const rotIdx: Record<string, number> = {};

export function getProviderKey(provider: AiProvider): string | null {
  const keys = config.ai[provider] as string[];
  if (!keys.length) return null;
  const i = (rotIdx[provider] ?? 0) % keys.length;
  rotIdx[provider] = i + 1;
  return keys[i];
}

export function getSerperKey(): string | null {
  const keys = config.serper;
  if (!keys.length) return null;
  const i = (rotIdx['serper'] ?? 0) % keys.length;
  rotIdx['serper'] = i + 1;
  return keys[i];
}

export function hasAnyProvider(): boolean {
  return Object.values(config.ai).some(arr => (arr as string[]).length > 0);
}

// ── Access control ────────────────────────────────────────────────────────────

export function isAdmin(uid: number): boolean {
  return config.adminIds.includes(uid);
}

export function hasAccess(uid: number): boolean {
  if (config.publicBot) return true;
  return isAdmin(uid);
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateConfig(): { ok: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!config.botToken)    warnings.push('BOT_TOKEN not set — bot will not start');
  if (!hasAnyProvider())   warnings.push('No AI provider keys set — AI will not work');
  if (!config.webappUrl)   warnings.push('WEBAPP_URL not set — mini-app buttons disabled');
  if (!config.serper.length) warnings.push('No SERPER_KEY — web search disabled');
  return { ok: !!config.botToken, warnings };
}

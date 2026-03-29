/**
 * NEXUM Self-Evolution: Fix Generator + Admin Approval
 * Generates suggested fixes and sends them to admin for approval.
 */

import { db } from '../core/db';
import { getProviderKey } from '../core/config';
import { createLogger } from '../infra/logger';
import type { CapturedError } from './error-detector';

const log = createLogger('evolution:fix-gen');

export interface PendingFix {
  id: string;
  errorId: string;
  errorMessage: string;
  errorSource: string;
  analysis: string;
  suggestedFix: string;
  filePath?: string;
  lineNumbers?: string;
  createdAt: number;
  status: 'pending' | 'approved' | 'rejected';
}

const pendingFixes = new Map<string, PendingFix>();

export async function generateFix(error: CapturedError): Promise<PendingFix | null> {
  const apiKey = getProviderKey('groq') ?? getProviderKey('openrouter');
  if (!apiKey) {
    log.warn('No AI provider available for fix generation');
    return null;
  }

  const prompt = `You are a TypeScript/Node.js bug fixer for a Telegram bot called NEXUM.

Error details:
- Source: ${error.source}
- Message: ${error.message}
- Stack: ${error.stack?.slice(0, 500) ?? 'N/A'}
- Context: ${JSON.stringify(error.context ?? {})}

Analyze this error and respond in JSON format ONLY:
{
  "analysis": "Root cause explanation in 1-2 sentences",
  "filePath": "src/path/to/file.ts or null",
  "lineNumbers": "42-45 or null",
  "suggestedFix": "Concise code fix or change description",
  "confidence": "high|medium|low"
}`;

  try {
    const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 400,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) throw new Error(`AI API error: ${resp.status}`);
    const data = await resp.json() as { choices: { message: { content: string } }[] };
    const text = data.choices[0]?.message?.content ?? '';

    let parsed: { analysis: string; filePath?: string; lineNumbers?: string; suggestedFix: string };
    try {
      parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    } catch {
      log.warn('Failed to parse fix JSON — using raw text');
      parsed = { analysis: 'Could not analyze automatically', suggestedFix: text.slice(0, 300) };
    }

    const fixId = `fix_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const fix: PendingFix = {
      id: fixId,
      errorId: error.id,
      errorMessage: error.message,
      errorSource: error.source,
      analysis: parsed.analysis,
      suggestedFix: parsed.suggestedFix,
      filePath: parsed.filePath,
      lineNumbers: parsed.lineNumbers,
      createdAt: Date.now(),
      status: 'pending',
    };

    pendingFixes.set(fixId, fix);

    try {
      db.prepare(`
        INSERT OR IGNORE INTO evolution_fixes
          (id, error_id, analysis, suggested_fix, file_path, line_numbers, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
      `).run(fixId, error.id, fix.analysis, fix.suggestedFix, fix.filePath ?? null, fix.lineNumbers ?? null);
    } catch { /* table might not exist */ }

    log.info(`Fix generated: ${fixId} for error ${error.id}`);
    return fix;
  } catch (e) {
    log.error(`Fix generation failed: ${(e as Error).message}`);
    return null;
  }
}

export function formatFixForAdmin(fix: PendingFix): string {
  return [
    '🔧 *NEXUM нашёл ошибку и создал фикс!*',
    '',
    `*Ошибка:*`,
    `\`${fix.errorMessage.slice(0, 150)}\``,
    `*Источник:* ${fix.errorSource}`,
    '',
    `*Анализ:*`,
    fix.analysis,
    '',
    fix.filePath ? `*Файл:* \`${fix.filePath}\`${fix.lineNumbers ? ` (строки ${fix.lineNumbers})` : ''}` : '',
    '',
    `*Предложенное исправление:*`,
    `\`\`\``,
    fix.suggestedFix.slice(0, 400),
    `\`\`\``,
    '',
    `Fix ID: \`${fix.id}\``,
  ].filter(l => l !== undefined).join('\n');
}

export function getPendingFixes(): PendingFix[] {
  return [...pendingFixes.values()].filter(f => f.status === 'pending');
}

export function approveFix(fixId: string): PendingFix | null {
  const fix = pendingFixes.get(fixId);
  if (!fix) return null;
  fix.status = 'approved';
  try {
    db.prepare(`UPDATE evolution_fixes SET status='approved' WHERE id=?`).run(fixId);
  } catch { /* ignore */ }
  log.info(`Fix approved: ${fixId}`);
  return fix;
}

export function rejectFix(fixId: string): PendingFix | null {
  const fix = pendingFixes.get(fixId);
  if (!fix) return null;
  fix.status = 'rejected';
  try {
    db.prepare(`UPDATE evolution_fixes SET status='rejected' WHERE id=?`).run(fixId);
  } catch { /* ignore */ }
  log.info(`Fix rejected: ${fixId}`);
  return fix;
}

export function getFix(fixId: string): PendingFix | null {
  return pendingFixes.get(fixId) ?? null;
}

import { proposePatch, fetchFileFromGitHub, listPendingPatches } from './self_improve';
import { chatUnified, Message } from '../agent/router';
import { Logger } from '../infra/logger';

// ============================================================
//  IMPROVE TOOL — AI analyses a file and proposes improvements
// ============================================================

export async function analyzeAndPropose(
  filePath: string,
  userRequest: string,
  uid: number,
  bot: any
): Promise<string> {
  // 1. Fetch current code
  let currentCode: string;
  try {
    currentCode = await fetchFileFromGitHub(filePath);
  } catch (e: any) {
    return `❌ Не могу прочитать файл \`${filePath}\`: ${e.message}`;
  }

  // 2. Ask AI to produce improved version
  Logger.info('improve_tool', `Analyzing ${filePath} for: ${userRequest}`);
  const messages: Message[] = [
    {
      role: 'system',
      content:
        'You are NEXUM, a self-improving AI assistant. ' +
        'You are given the current source code of a file and a user request. ' +
        'Your task: produce the COMPLETE improved file content. ' +
        'Return ONLY the raw code — no markdown, no explanation, no backticks. ' +
        'The returned content will be pushed directly to GitHub.',
    },
    {
      role: 'user',
      content:
        `File: ${filePath}\n\n` +
        `User request: ${userRequest}\n\n` +
        `Current content:\n${currentCode}`,
    },
  ];

  let improvedCode: string;
  try {
    const result = await chatUnified(messages, uid);
    improvedCode = (result.content || '').trim();
    // Strip markdown code fences if AI added them
    improvedCode = improvedCode
      .replace(/^```[\w]*\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  } catch (e: any) {
    return `❌ AI не смог проанализировать файл: ${e.message}`;
  }

  if (!improvedCode || improvedCode.length < 50) {
    return '❌ AI вернул пустой или слишком короткий результат. Попробуй ещё раз.';
  }

  // 3. Propose the patch
  const result = await proposePatch(
    filePath,
    improvedCode,
    userRequest,
    `AI-suggested improvement based on: "${userRequest}"`,
    uid,
    bot
  );

  return result;
}

export async function listPending(): Promise<string> {
  const patches = listPendingPatches();
  if (patches.length === 0) return '✅ Нет ожидающих патчей.';
  return patches
    .map(p =>
      `🔵 \`${p.id}\`\n` +
      `   📁 ${p.filePath}\n` +
      `   📝 ${p.description}\n` +
      `   🕐 ${new Date(p.createdAt).toLocaleString('ru')}`
    )
    .join('\n\n');
}

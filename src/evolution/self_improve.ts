import { Logger } from '../infra/logger';
import { CONFIG } from '../core/config';

// ============================================================
//  SELF-IMPROVE ENGINE
//  Nexum proposes code changes → sends to admin via Telegram
//  Admin approves/rejects → changes pushed to GitHub
// ============================================================

const GITHUB_OWNER = 'thenexumai';
const GITHUB_REPO  = 'nexum-bot';
const GITHUB_BRANCH = 'main';

export interface SelfImprovePatch {
  id: string;
  filePath: string;
  description: string;
  reason: string;
  oldContent: string;
  newContent: string;
  requestedBy: number; // uid
  createdAt: number;
}

// In-memory pending patches (survives between handler calls)
const pendingPatches = new Map<string, SelfImprovePatch>();

// ============================================================
//  PROPOSE: Nexum suggests a code change
// ============================================================
export async function proposePatch(
  filePath: string,
  newContent: string,
  description: string,
  reason: string,
  requestedBy: number,
  bot: any
): Promise<string> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return '❌ GITHUB_TOKEN не задан в Railway env. Добавь его чтобы использовать self-improve.';
  }

  // Fetch current file content + SHA from GitHub
  let oldContent = '';
  let fileSha = '';
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' } }
    );
    if (resp.ok) {
      const data = await resp.json() as any;
      oldContent = Buffer.from(data.content, 'base64').toString('utf8');
      fileSha = data.sha;
    }
  } catch (e) {
    Logger.warn('self_improve', `Could not fetch current file: ${e}`);
  }

  const id = `patch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const patch: SelfImprovePatch = {
    id, filePath, description, reason,
    oldContent, newContent, requestedBy,
    createdAt: Date.now(),
  };
  pendingPatches.set(id, patch);

  // Build diff preview (first 60 lines of new content)
  const previewLines = newContent.split('\n').slice(0, 60).join('\n');
  const preview = previewLines.length < newContent.length
    ? previewLines + '\n... (обрезано)'
    : previewLines;

  // Send approval request to all admins
  const adminIds = CONFIG.ADMIN_IDS;
  const msgText =
    `🧬 *NEXUM Self-Improve*\n\n` +
    `📁 Файл: \`${filePath}\`\n` +
    `📝 Изменение: ${description}\n` +
    `💡 Причина: ${reason}\n\n` +
    `\`\`\`\n${preview}\n\`\`\``;

  for (const adminId of adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, msgText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ Запушить', callback_data: `selfimprove_approve_${id}` },
            { text: '❌ Отклонить', callback_data: `selfimprove_reject_${id}` },
          ]]
        }
      });
    } catch (e) {
      Logger.warn('self_improve', `Could not notify admin ${adminId}: ${e}`);
    }
  }

  Logger.info('self_improve', `Patch ${id} proposed: ${filePath}`);
  return `📬 Предложение отправлено админу на одобрение. ID: \`${id}\``;
}

// ============================================================
//  APPROVE: Push the patch to GitHub
// ============================================================
export async function approvePatch(patchId: string, bot: any): Promise<string> {
  const patch = pendingPatches.get(patchId);
  if (!patch) return '❌ Патч не найден или уже обработан.';

  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) return '❌ GITHUB_TOKEN не задан.';

  // Get current SHA
  let fileSha = '';
  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${patch.filePath}`,
      { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' } }
    );
    if (resp.ok) {
      const data = await resp.json() as any;
      fileSha = data.sha;
    }
  } catch {}

  const body: any = {
    message: `🧬 self-improve: ${patch.description}`,
    content: Buffer.from(patch.newContent, 'utf8').toString('base64'),
    branch: GITHUB_BRANCH,
  };
  if (fileSha) body.sha = fileSha;

  try {
    const resp = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${patch.filePath}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${githubToken}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const err = await resp.text();
      throw new Error(`GitHub API ${resp.status}: ${err}`);
    }

    pendingPatches.delete(patchId);
    Logger.info('self_improve', `Patch ${patchId} approved and pushed: ${patch.filePath}`);

    // Notify requester if not admin
    if (!CONFIG.ADMIN_IDS.includes(patch.requestedBy)) {
      try {
        await bot.telegram.sendMessage(
          patch.requestedBy,
          `✅ Твоё предложение по улучшению Нексума одобрено!\n📁 \`${patch.filePath}\` обновлён.`
        );
      } catch {}
    }

    return `✅ Патч запушен! \`${patch.filePath}\` обновлён на GitHub. Railway начнёт деплой.`;
  } catch (e: any) {
    Logger.error('self_improve', `Push failed: ${e.message}`);
    return `❌ Ошибка при пуше: ${e.message}`;
  }
}

// ============================================================
//  REJECT: Discard the patch
// ============================================================
export function rejectPatch(patchId: string): string {
  const patch = pendingPatches.get(patchId);
  if (!patch) return '❌ Патч не найден или уже обработан.';
  pendingPatches.delete(patchId);
  Logger.info('self_improve', `Patch ${patchId} rejected: ${patch.filePath}`);
  return `🗑 Патч отклонён: \`${patch.filePath}\``;
}

// ============================================================
//  LIST: Show pending patches for admin
// ============================================================
export function listPendingPatches(): SelfImprovePatch[] {
  return Array.from(pendingPatches.values());
}

// ============================================================
//  FETCH FILE: Read current file content from GitHub
// ============================================================
export async function fetchFileFromGitHub(filePath: string): Promise<string> {
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) throw new Error('GITHUB_TOKEN not set');
  const resp = await fetch(
    `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
    { headers: { Authorization: `Bearer ${githubToken}`, Accept: 'application/vnd.github+json' } }
  );
  if (!resp.ok) throw new Error(`GitHub API ${resp.status}`);
  const data = await resp.json() as any;
  return Buffer.from(data.content, 'base64').toString('utf8');
}

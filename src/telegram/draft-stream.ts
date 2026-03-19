// NEXUM Draft Stream — точная реализация OpenClaw для Telegram
// Throttle 1000ms, накапливает токены, editMessageText как в OpenClaw

import { Api } from 'grammy';

const TELEGRAM_MAX_CHARS = 4096;
const DEFAULT_THROTTLE_MS = 1000;

export type DraftStream = {
  update: (text: string) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
  messageId: () => number | undefined;
};

export function createDraftStream(params: {
  api: Api;
  chatId: number;
  throttleMs?: number;
  renderText?: (text: string) => { text: string; parseMode?: 'HTML' | 'Markdown' };
  warn?: (msg: string) => void;
}): DraftStream {
  const throttleMs = params.throttleMs ?? DEFAULT_THROTTLE_MS;
  let messageId: number | undefined;
  let lastSentAt = 0;
  let pendingText = '';
  let lastSentText = '';
  let inFlight: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const sendOrEdit = async (text: string): Promise<boolean> => {
    const trimmed = text.trimEnd();
    if (!trimmed || trimmed === lastSentText) return true;
    if (trimmed.length > TELEGRAM_MAX_CHARS) {
      params.warn?.(`stream stopped: text too long (${trimmed.length})`);
      stopped = true;
      return false;
    }

    const rendered = params.renderText?.(trimmed) ?? { text: trimmed };
    const finalText = rendered.text.trimEnd();
    const parseMode = rendered.parseMode;

    try {
      if (messageId != null) {
        // Edit existing message
        if (parseMode) {
          await params.api.editMessageText(params.chatId, messageId, finalText, { parse_mode: parseMode });
        } else {
          await params.api.editMessageText(params.chatId, messageId, finalText);
        }
      } else {
        // Send first message
        const sent = parseMode
          ? await params.api.sendMessage(params.chatId, finalText, { parse_mode: parseMode })
          : await params.api.sendMessage(params.chatId, finalText);
        messageId = sent.message_id;
      }
      lastSentText = trimmed;
      lastSentAt = Date.now();
      return true;
    } catch (err: any) {
      // Markdown parse error — retry as plain text
      if (parseMode && messageId != null) {
        try {
          await params.api.editMessageText(params.chatId, messageId, finalText);
          lastSentText = trimmed;
          lastSentAt = Date.now();
          return true;
        } catch { /* ignore */ }
      }
      params.warn?.(`stream error: ${err?.message}`);
      return false;
    }
  };

  const flush = async (): Promise<void> => {
    if (timer) { clearTimeout(timer); timer = undefined; }
    while (!stopped) {
      if (inFlight) { await inFlight; continue; }
      const text = pendingText;
      if (!text.trim()) { pendingText = ''; return; }
      pendingText = '';
      const current = sendOrEdit(text).finally(() => {
        if (inFlight === current) inFlight = undefined;
      }) as Promise<boolean>;
      inFlight = current;
      const sent = await current;
      if (sent === false) { pendingText = text; return; }
      if (!pendingText) return;
    }
  };

  const schedule = () => {
    if (timer) return;
    const delay = Math.max(0, throttleMs - (Date.now() - lastSentAt));
    timer = setTimeout(() => { void flush(); }, delay);
  };

  const update = (text: string) => {
    if (stopped) return;
    pendingText = text;
    if (inFlight) { schedule(); return; }
    if (!timer && Date.now() - lastSentAt >= throttleMs) { void flush(); return; }
    schedule();
  };

  const stop = async (): Promise<void> => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = undefined; }
    // Final flush — send whatever is pending
    if (pendingText.trim() && !inFlight) {
      await sendOrEdit(pendingText);
      pendingText = '';
    } else if (inFlight) {
      await inFlight;
    }
  };

  return {
    update,
    flush,
    stop,
    messageId: () => messageId,
  };
}

// ── Streaming AI response to Telegram (OpenClaw pattern) ─────────────────────
// AI стримит токены → накапливаем → editMessageText раз в секунду

export async function streamAIResponse(params: {
  api: Api;
  chatId: number;
  getCompletion: (onToken: (token: string) => void) => Promise<string>;
  renderText?: (text: string) => { text: string; parseMode?: 'HTML' | 'Markdown' };
}): Promise<string> {
  const draft = createDraftStream({
    api: params.api,
    chatId: params.chatId,
    throttleMs: 1000,
    renderText: params.renderText,
    warn: (msg) => console.warn('[stream]', msg),
  });

  let accumulated = '';

  // Start with typing action
  await params.api.sendChatAction(params.chatId, 'typing');

  const fullText = await params.getCompletion((token: string) => {
    accumulated += token;
    draft.update(accumulated);
  });

  // Final flush — ensure full text is displayed
  await draft.stop();

  // If streaming didn't work (non-streaming provider), send the full text now
  if (draft.messageId() == null) {
    try {
      await params.api.sendMessage(params.chatId, fullText, { parse_mode: 'Markdown' });
    } catch {
      await params.api.sendMessage(params.chatId, fullText);
    }
  }

  return fullText;
}

// NEXUM Draft Stream — точная реализация OpenClaw
// throttle 1000ms, minInitialChars для равномерного старта

import { Api } from 'grammy';

const TELEGRAM_MAX_CHARS = 4096;
const THROTTLE_MS = 1000;         // Как в OpenClaw DEFAULT_THROTTLE_MS
const MIN_INITIAL_CHARS = 60;     // Ждём накопления до первой отправки — равномерный старт

export type DraftStream = {
  update: (text: string) => void;
  flush: () => Promise<void>;
  stop: () => Promise<void>;
  messageId: () => number | undefined;
};

export function createDraftStream(params: {
  api: Api;
  chatId: number;
  warn?: (msg: string) => void;
}): DraftStream {
  let msgId: number | undefined;
  let lastSentAt = 0;
  let lastSentText = '';
  let pendingText = '';
  let inFlight: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let firstSent = false;

  const sendOrEdit = async (text: string): Promise<boolean> => {
    const t = text.trimEnd();
    if (!t || t === lastSentText) return true;
    if (t.length > TELEGRAM_MAX_CHARS) { stopped = true; return false; }

    // Дебаунс первого сообщения — ждём MIN_INITIAL_CHARS чтобы старт был плавным
    if (!firstSent && t.length < MIN_INITIAL_CHARS && !stopped) return false;

    try {
      if (msgId != null) {
        // Редактируем существующее сообщение
        try {
          await params.api.editMessageText(params.chatId, msgId, t, { parse_mode: 'Markdown' });
        } catch {
          // Markdown ошибка — отправляем plain text
          await params.api.editMessageText(params.chatId, msgId, t);
        }
      } else {
        // Первое сообщение
        let sent: any;
        try {
          sent = await params.api.sendMessage(params.chatId, t, { parse_mode: 'Markdown' });
        } catch {
          sent = await params.api.sendMessage(params.chatId, t);
        }
        msgId = sent.message_id;
        firstSent = true;
      }
      lastSentText = t;
      lastSentAt = Date.now();
      return true;
    } catch (e: any) {
      params.warn?.(`draft error: ${e?.message}`);
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
      const cur = sendOrEdit(text).finally(() => { if (inFlight===cur) inFlight=undefined; }) as Promise<boolean>;
      inFlight = cur;
      const ok = await cur;
      if (!ok) { pendingText = text; return; }
      if (!pendingText) return;
    }
  };

  const schedule = () => {
    if (timer) return;
    // Равномерный throttle — точно THROTTLE_MS между правками
    const delay = Math.max(0, THROTTLE_MS - (Date.now() - lastSentAt));
    timer = setTimeout(() => { void flush(); }, delay);
  };

  const update = (text: string) => {
    if (stopped) return;
    pendingText = text;
    if (inFlight) { schedule(); return; }
    if (!timer && Date.now() - lastSentAt >= THROTTLE_MS) { void flush(); return; }
    schedule();
  };

  const stop = async (): Promise<void> => {
    stopped = true;
    if (timer) { clearTimeout(timer); timer = undefined; }
    if (inFlight) { await inFlight; inFlight = undefined; }
    // Финальный flush — отправляем всё что осталось
    if (pendingText.trim()) {
      stopped = false;
      await flush();
      stopped = true;
    }
  };

  return { update, flush, stop, messageId: () => msgId };
}

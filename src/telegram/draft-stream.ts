// NEXUM Draft Stream — throttled progressive message updates (OpenClaw pattern)

interface DraftStreamOptions {
  api: any;
  chatId: number;
  warn?: (msg: string) => void;
  throttleMs?: number;
}

interface DraftStream {
  update: (text: string) => void;
  stop: () => Promise<void>;
  messageId: () => number | null;
}

export function createDraftStream(opts: DraftStreamOptions): DraftStream {
  const { api, chatId, warn, throttleMs = 1200 } = opts;

  let msgId: number | null = null;
  let lastSent = '';
  let pending: string | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  async function sendOrEdit(text: string): Promise<void> {
    if (!text?.trim()) return;

    // Telegram max message length
    const chunk = text.slice(0, 4096);

    try {
      if (msgId === null) {
        const sent = await api.sendMessage(chatId, chunk, { parse_mode: 'Markdown' });
        msgId = sent.message_id;
        lastSent = chunk;
      } else if (chunk !== lastSent) {
        await api.editMessageText(chatId, msgId, chunk, { parse_mode: 'Markdown' });
        lastSent = chunk;
      }
    } catch (e: any) {
      // If Markdown fails, try plain
      try {
        if (msgId === null) {
          const sent = await api.sendMessage(chatId, chunk);
          msgId = sent.message_id;
          lastSent = chunk;
        } else if (chunk !== lastSent) {
          await api.editMessageText(chatId, msgId, chunk);
          lastSent = chunk;
        }
      } catch (e2: any) {
        warn?.(`[draft] edit failed: ${e2.message?.slice(0, 80)}`);
      }
    }
  }

  function scheduleFlush(): void {
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      if (pending !== null && !stopped) {
        const text = pending;
        pending = null;
        await sendOrEdit(text);
      }
    }, throttleMs);
  }

  return {
    update(text: string) {
      if (stopped) return;
      pending = text;
      scheduleFlush();
    },

    async stop() {
      stopped = true;
      if (timer) { clearTimeout(timer); timer = null; }
      if (pending !== null) {
        await sendOrEdit(pending);
        pending = null;
      }
    },

    messageId() { return msgId; },
  };
}

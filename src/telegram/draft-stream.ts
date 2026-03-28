/**
 * NEXUM Draft Stream — token-by-token editing like Claude/ChatGPT/OpenClaw
 *
 * The key insight: Telegram allows ~3 edits/second per message.
 * We edit every 300ms so text visibly grows chunk by chunk.
 *
 * No "…" placeholder. First message sends when first tokens arrive (~5 chars).
 * Each subsequent edit adds more text until the full response is shown.
 */

import { Api } from 'grammy';

interface Options {
  api: Api;
  chatId: number;
}

export interface DraftStream {
  update(accumulated: string): void;
  stop(): Promise<void>;
  messageId(): number | null;
}

// Edit every 300ms — fast enough to see text growing, safe for Telegram limits
// Telegram limit is ~20 edits/min per message = 1 per 3s officially,
// but in practice 2-3/sec works fine for short bursts
const EDIT_INTERVAL_MS = 300;

// Send first message when this many chars are accumulated
const MIN_FIRST_CHARS = 5;

export function createDraftStream({ api, chatId }: Options): DraftStream {
  let msgId:      number | null = null;
  let lastSent    = '';
  let pendingText = '';
  let busy        = false; // prevent overlapping edits
  let interval:   ReturnType<typeof setInterval> | null = null;
  let stopped     = false;

  // ── Interval-based edit loop ───────────────────────────────────────────────
  // Runs every 300ms, sends edit if text changed
  interval = setInterval(async () => {
    if (busy || stopped || !pendingText || pendingText === lastSent) return;
    busy = true;

    const content = pendingText.slice(0, 4096);

    if (msgId === null) {
      // First send — only if we have enough text
      if (content.length < MIN_FIRST_CHARS) { busy = false; return; }
      try {
        const msg = await api.sendMessage(chatId, content, { parse_mode: 'Markdown' });
        msgId    = msg.message_id;
        lastSent = content;
      } catch {
        try {
          const msg = await api.sendMessage(chatId, content);
          msgId    = msg.message_id;
          lastSent = content;
        } catch { /* will retry next interval */ }
      }
    } else {
      // Edit existing message
      try {
        await api.editMessageText(chatId, msgId, content, { parse_mode: 'Markdown' });
        lastSent = content;
      } catch {
        try {
          await api.editMessageText(chatId, msgId, content);
          lastSent = content;
        } catch { /* ignore transient errors */ }
      }
    }

    busy = false;
  }, EDIT_INTERVAL_MS);

  return {
    update(accumulated: string): void {
      if (!accumulated || stopped) return;
      pendingText = accumulated;
    },

    async stop(): Promise<void> {
      stopped = true;

      // Stop the interval
      if (interval) { clearInterval(interval); interval = null; }

      // Wait for any in-progress edit to finish
      while (busy) await new Promise(r => setTimeout(r, 20));

      const content = pendingText.slice(0, 4096);
      if (!content) return;

      if (msgId === null) {
        // Never sent anything — send full text now
        try {
          const msg = await api.sendMessage(chatId, content, { parse_mode: 'Markdown' });
          msgId = msg.message_id;
          lastSent = content;
        } catch {
          try {
            const msg = await api.sendMessage(chatId, content);
            msgId = msg.message_id;
            lastSent = content;
          } catch { /* nothing we can do */ }
        }
      } else if (content !== lastSent) {
        // Final edit with complete text
        try {
          await api.editMessageText(chatId, msgId, content, { parse_mode: 'Markdown' });
          lastSent = content;
        } catch {
          try {
            await api.editMessageText(chatId, msgId, content);
            lastSent = content;
          } catch {
            // Absolute last resort — send as new message
            await api.sendMessage(chatId, content, { parse_mode: 'Markdown' })
              .catch(() => api.sendMessage(chatId, content).catch(() => {}));
          }
        }
      }
    },

    messageId(): number | null { return msgId; },
  };
}

import type { Message, ChatMode, Source } from './types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export async function healthCheck(): Promise<{ ok: boolean } | null> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(4000) })
    return r.ok ? { ok: true } : null
  } catch {
    return null
  }
}

export async function sendChat(
  messages: Array<{ role: string; content: string }>,
  mode: ChatMode
): Promise<{ content: string; sources?: Source[]; tool_used?: string }> {
  const r = await fetch(`${BASE}/chat`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ messages, mode }),
  })
  if (!r.ok) throw new Error(`API error ${r.status}: ${await r.text()}`)
  return r.json()
}

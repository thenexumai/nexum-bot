import type { Message } from './types'

const BASE = (import.meta as any).env?.VITE_API_URL ?? ''

export async function sendChat(
  messages: Pick<Message, 'role' | 'content'>[],
  mode: string
) {
  const uid = Number(localStorage.getItem('nexum_uid') || 0)
  const res = await fetch(`${BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid: uid || undefined, messages, mode }),
  })
  if (!res.ok) throw new Error((await res.json()).error || 'API error')
  return res.json() as Promise<{
    content: string
    sources: Array<{ title: string; url: string; snippet?: string }>
    tool_used: string | null
  }>
}

export const fetchMe = async (uid: number) => {
  const r = await fetch(`${BASE}/api/me?uid=${uid}`)
  return r.ok ? r.json() : null
}

export const fetchTasks = (uid: number) =>
  fetch(`${BASE}/api/tasks?uid=${uid}`).then((r) => r.json())

export const createTask = (d: any) =>
  fetch(`${BASE}/api/tasks`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
  }).then((r) => r.json())

export const patchTask = (id: number, d: any) =>
  fetch(`${BASE}/api/tasks/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
  }).then((r) => r.json())

export const deleteTask = (id: number) =>
  fetch(`${BASE}/api/tasks/${id}`, { method: 'DELETE' })

export const fetchFinance = (uid: number) =>
  fetch(`${BASE}/api/finance?uid=${uid}`).then((r) => r.json())

export const addFinanceEntry = (d: any) =>
  fetch(`${BASE}/api/finance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
  }).then((r) => r.json())

export const deleteFinanceEntry = (id: number) =>
  fetch(`${BASE}/api/finance/${id}`, { method: 'DELETE' })

export const fetchNotes = (uid: number) =>
  fetch(`${BASE}/api/notes?uid=${uid}`).then((r) => r.json())

export const saveNote = (d: any) =>
  fetch(`${BASE}/api/notes`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
  }).then((r) => r.json())

export const patchNote = (id: number, d: any) =>
  fetch(`${BASE}/api/notes/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d),
  }).then((r) => r.json())

export const deleteNote = (id: number) =>
  fetch(`${BASE}/api/notes/${id}`, { method: 'DELETE' })

export const fetchHabits = (uid: number) =>
  fetch(`${BASE}/api/habits?uid=${uid}`).then((r) => r.json())

export const checkHabit = (id: number, uid: number) =>
  fetch(`${BASE}/api/habits/${id}/check`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid }),
  }).then((r) => r.json())

export const fetchCalendar = (uid: number) =>
  fetch(`${BASE}/api/calendar?uid=${uid}`).then((r) => r.json())

export const fetchContacts = (uid: number, q?: string) =>
  fetch(`${BASE}/api/contacts?uid=${uid}${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => r.json())

export const healthCheck = async () => {
  try { return await fetch(`${BASE}/health`).then((r) => r.json()) } catch { return null }
}

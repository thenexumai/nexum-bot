import { create } from 'zustand'
import type { Lang } from './i18n'

export type Theme = 'dark' | 'light' | 'system'

interface AppState {
  theme: Theme
  lang: Lang
  setTheme: (t: Theme) => void
  setLang: (l: Lang) => void
  resolvedTheme: () => 'dark' | 'light'
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  lang: 'ru',

  setTheme: (theme) => {
    set({ theme })
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    document.documentElement.setAttribute('data-theme', resolved)
  },

  setLang: (lang) => set({ lang }),

  resolvedTheme: () => {
    const { theme } = get()
    if (theme === 'system') return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    return theme
  },
}))

// Apply theme on init
const initTheme = useAppStore.getState().theme
const resolved = initTheme === 'system'
  ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  : initTheme
document.documentElement.setAttribute('data-theme', resolved)

// ── AI Context Detector ──────────────────────────────────────────────────────
// Detects financial / task keywords in AI responses and auto-saves to mini apps

export interface FinanceEntryLocal {
  id: string; type: 'income' | 'expense'; amount: number
  currency: string; category: string; note: string; date: string
}

export interface TaskLocal {
  id: string; title: string
  priority: 'low' | 'medium' | 'high'; done: boolean; date: string
}

export interface NoteLocal {
  id: string; title: string; content: string; pinned: boolean; date: string
}

export interface HabitLocal {
  id: string; name: string; icon: string
  streak: number; doneToday: boolean; lastDone: string
}

interface MiniAppsState {
  finances: FinanceEntryLocal[]
  tasks: TaskLocal[]
  notes: NoteLocal[]
  habits: HabitLocal[]
  toast: string | null

  addFinance: (e: Omit<FinanceEntryLocal, 'id'>) => void
  addTask: (t: Omit<TaskLocal, 'id'>) => void
  addNote: (n: Omit<NoteLocal, 'id'>) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void
  deleteFinance: (id: string) => void
  deleteNote: (id: string) => void
  checkHabit: (id: string) => void
  setToast: (msg: string | null) => void

  // AI context detection
  detectAndSave: (text: string, lang: Lang) => void
}

const genId = () => Math.random().toString(36).slice(2)

export const useMiniApps = create<MiniAppsState>((set, get) => ({
  finances: [
    { id: genId(), type: 'income',  amount: 3500000, currency: 'UZS', category: 'Salary',  note: 'January salary', date: '2026-03-01' },
    { id: genId(), type: 'expense', amount: 450000,  currency: 'UZS', category: 'Food',    note: 'Groceries',      date: '2026-03-10' },
    { id: genId(), type: 'expense', amount: 200000,  currency: 'UZS', category: 'Transport', note: 'Taxi',          date: '2026-03-15' },
  ],
  tasks: [
    { id: genId(), title: 'Finish NEXUM portal UI', priority: 'high',   done: false, date: new Date().toISOString() },
    { id: genId(), title: 'Write API documentation', priority: 'medium', done: false, date: new Date().toISOString() },
    { id: genId(), title: 'Deploy to Railway',       priority: 'high',   done: false, date: new Date().toISOString() },
  ],
  notes: [
    { id: genId(), title: 'NEXUM Architecture', content: 'Backend: Node.js + Railway\nPortal: React + Vite\nAgent: Python local', pinned: true, date: new Date().toISOString() },
  ],
  habits: [
    { id: genId(), name: 'Morning workout',  icon: 'Dumbbell',  streak: 5, doneToday: false, lastDone: '' },
    { id: genId(), name: 'Read 30 minutes',  icon: 'BookOpen',  streak: 3, doneToday: true,  lastDone: new Date().toDateString() },
    { id: genId(), name: 'Drink 2L water',   icon: 'Droplets',  streak: 7, doneToday: false, lastDone: '' },
    { id: genId(), name: 'Code every day',   icon: 'Code2',     streak: 12, doneToday: true, lastDone: new Date().toDateString() },
  ],
  toast: null,

  addFinance: (e) => set((s) => ({ finances: [{ ...e, id: genId() }, ...s.finances] })),
  addTask: (t) => set((s) => ({ tasks: [{ ...t, id: genId() }, ...s.tasks] })),
  addNote: (n) => set((s) => ({ notes: [{ ...n, id: genId() }, ...s.notes] })),
  toggleTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) })),
  deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  deleteFinance: (id) => set((s) => ({ finances: s.finances.filter((f) => f.id !== id) })),
  deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),
  checkHabit: (id) => set((s) => ({
    habits: s.habits.map((h) =>
      h.id === id
        ? { ...h, doneToday: !h.doneToday, streak: !h.doneToday ? h.streak + 1 : Math.max(0, h.streak - 1), lastDone: new Date().toDateString() }
        : h
    ),
  })),
  setToast: (msg) => {
    set({ toast: msg })
    if (msg) setTimeout(() => set({ toast: null }), 3500)
  },

  detectAndSave: (text: string, lang: Lang) => {
    const lower = text.toLowerCase()
    const { addFinance, addTask, setToast } = get()

    // ── Finance detection ──
    const salaryKw = ['зарплата', 'маош', 'salary', 'получил', 'oldi', 'received', 'пришла зарплата', 'maosh keldi']
    const incomeKw = ['доход', 'daromad', 'income', 'earned', 'заработал', 'получил оплату']
    const expenseKw = ['потратил', 'купил', 'xarajat', 'expense', 'spent', 'харажат', 'sotib oldi']

    const amountMatch = lower.match(/(\d[\d\s,]*)/)
    const amount = amountMatch ? parseInt(amountMatch[1].replace(/[\s,]/g, '')) : 0

    if (salaryKw.some((k) => lower.includes(k)) && amount > 0) {
      addFinance({ type: 'income', amount, currency: 'UZS', category: 'Salary', note: text.slice(0, 80), date: new Date().toISOString().split('T')[0] })
      const msgs: Record<Lang, string> = { en: '💰 Salary detected! Saved to Finance.', ru: '💰 Зарплата обнаружена! Сохранено в Финансы.', uz: '💰 Maosh aniqlandi! Moliyaga saqlandi.' }
      setToast(msgs[lang])
      return
    }
    if (incomeKw.some((k) => lower.includes(k)) && amount > 0) {
      addFinance({ type: 'income', amount, currency: 'UZS', category: 'Income', note: text.slice(0, 80), date: new Date().toISOString().split('T')[0] })
      setToast('💰 Income saved to Finance!')
      return
    }
    if (expenseKw.some((k) => lower.includes(k)) && amount > 0) {
      addFinance({ type: 'expense', amount, currency: 'UZS', category: 'Expense', note: text.slice(0, 80), date: new Date().toISOString().split('T')[0] })
      setToast('💸 Expense saved to Finance!')
      return
    }

    // ── Task detection ──
    const taskKw = ['напомни', 'remind', 'eslatib', 'нужно сделать', 'задача', 'vazifa', 'todo', 'сделать', 'qilish kerak']
    if (taskKw.some((k) => lower.includes(k))) {
      const title = text.slice(0, 60)
      addTask({ title, priority: 'medium', done: false, date: new Date().toISOString() })
      const msgs: Record<Lang, string> = { en: '✅ Task saved!', ru: '✅ Задача сохранена!', uz: '✅ Vazifa saqlandi!' }
      setToast(msgs[lang])
    }
  },
}))

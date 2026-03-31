import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Language } from './i18n'

type Theme = 'dark' | 'light' | 'system'

interface AppState {
  lang:  Language
  theme: Theme
  model: string
  setLang:  (l: Language) => void
  setTheme: (t: Theme) => void
  setModel: (m: string) => void
  // Toast
  toast: string | null
  showToast: (msg: string) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      lang:  'ru',
      theme: 'dark',
      model: 'nexum-turbo',
      setLang:  (lang)  => set({ lang }),
      setTheme: (theme) => {
        const resolved = theme === 'system'
          ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
          : theme
        document.documentElement.setAttribute('data-theme', resolved)
        set({ theme })
      },
      setModel: (model) => set({ model }),
      toast: null,
      showToast: (msg) => {
        set({ toast: msg })
        setTimeout(() => set({ toast: null }), 2500)
      },
    }),
    { name: 'nexum-app-prefs' }
  )
)

// ─── Mini Apps context detection ─────────────────────────────────────────────

interface MiniAppsState {
  // Tasks
  tasks: Array<{ id: string; text: string; done: boolean; createdAt: number }>
  addTask: (text: string) => void
  toggleTask: (id: string) => void
  deleteTask: (id: string) => void

  // Finance
  transactions: Array<{ id: string; label: string; amount: number; type: 'income' | 'expense'; createdAt: number }>
  addTransaction: (label: string, amount: number, type: 'income' | 'expense') => void

  // Notes
  notes: Array<{ id: string; title: string; body: string; createdAt: number }>
  addNote: (title: string, body: string) => void
  deleteNote: (id: string) => void

  // Habits
  habits: Array<{ id: string; label: string; streak: number; completedToday: boolean }>
  addHabit: (label: string) => void
  checkHabit: (id: string) => void

  // Context detection
  detectAndSave: (text: string, lang: Language) => void

  // Toast
  toast: string | null
}

function uid() { return Math.random().toString(36).slice(2) }

export const useMiniApps = create<MiniAppsState>()(
  persist(
    (set, get) => ({
      tasks: [],
      addTask: (text) => set((s) => ({ tasks: [...s.tasks, { id: uid(), text, done: false, createdAt: Date.now() }] })),
      toggleTask: (id) => set((s) => ({ tasks: s.tasks.map((t) => t.id === id ? { ...t, done: !t.done } : t) })),
      deleteTask: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),

      transactions: [],
      addTransaction: (label, amount, type) =>
        set((s) => ({ transactions: [...s.transactions, { id: uid(), label, amount, type, createdAt: Date.now() }] })),

      notes: [],
      addNote: (title, body) =>
        set((s) => ({ notes: [...s.notes, { id: uid(), title, body, createdAt: Date.now() }] })),
      deleteNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

      habits: [],
      addHabit: (label) =>
        set((s) => ({ habits: [...s.habits, { id: uid(), label, streak: 0, completedToday: false }] })),
      checkHabit: (id) =>
        set((s) => ({ habits: s.habits.map((h) => h.id === id ? { ...h, completedToday: true, streak: h.streak + 1 } : h) })),

      toast: null,

      detectAndSave: (text, lang) => {
        const low = text.toLowerCase()

        // ── Task detection ────────────────────────────────────────────────────
        const taskPatterns = [
          /(?:нужно|надо|не забыть|запомни|добавь задачу|task:|todo:)\s+(.+)/i,
          /(?:remember to|don't forget to|add task|remind me to)\s+(.+)/i,
          /(?:eslab qolma|vazifa|yodda tut)\s+(.+)/i,
        ]
        for (const rx of taskPatterns) {
          const m = text.match(rx)
          if (m?.[1]) {
            const taskText = m[1].slice(0, 120).trim()
            if (taskText.length > 3) {
              get().addTask(taskText)
              set({ toast: `✓ Задача добавлена: "${taskText.slice(0, 40)}"` })
              setTimeout(() => set({ toast: null }), 2500)
              return
            }
          }
        }

        // ── Finance detection ─────────────────────────────────────────────────
        const incomeRx  = /(?:получил|зарплата|доход|поступило|income|earned|salary)[^\d]*(\d[\d\s,.]*)/i
        const expenseRx = /(?:потратил|купил|расход|заплатил|spent|bought|paid)[^\d]*(\d[\d\s,.]*)/i

        const incM = text.match(incomeRx)
        if (incM?.[1]) {
          const amount = parseFloat(incM[1].replace(/[\s,]/g, ''))
          if (amount > 0) {
            const label = incM[0].split(/\d/)[0].trim().slice(0, 40)
            get().addTransaction(label || 'Income', amount, 'income')
            set({ toast: `💰 Доход записан: ${amount.toLocaleString()}` })
            setTimeout(() => set({ toast: null }), 2500)
            return
          }
        }
        const expM = text.match(expenseRx)
        if (expM?.[1]) {
          const amount = parseFloat(expM[1].replace(/[\s,]/g, ''))
          if (amount > 0) {
            const label = expM[0].split(/\d/)[0].trim().slice(0, 40)
            get().addTransaction(label || 'Expense', amount, 'expense')
            set({ toast: `💸 Расход записан: ${amount.toLocaleString()}` })
            setTimeout(() => set({ toast: null }), 2500)
            return
          }
        }

        // ── Note detection ────────────────────────────────────────────────────
        const noteRx = /(?:заметка:|запиши:|note:|note down:)\s*(.+)/i
        const noteM = text.match(noteRx)
        if (noteM?.[1]) {
          const body = noteM[1].slice(0, 500)
          get().addNote(body.slice(0, 40), body)
          set({ toast: `📝 Заметка сохранена` })
          setTimeout(() => set({ toast: null }), 2500)
        }
      },
    }),
    { name: 'nexum-mini-apps' }
  )
)

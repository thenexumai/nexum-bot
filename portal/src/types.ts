export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  sources?: Source[]
  tool_used?: string | null
  createdAt: Date
  isStreaming?: boolean
}

export interface Source {
  title: string
  url: string
  snippet?: string
  favicon?: string
}

export interface Conversation {
  id: string
  title: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
  model?: string
  mode?: ChatMode
}

export type ChatMode = 'chat' | 'search' | 'code' | 'agent'
export type SidebarTab = 'chat' | 'discover' | 'library' | 'settings'

export interface User {
  uid: number
  first_name: string
  subscription_plan: string
  msg_count_today: number
  lang: string
}

export interface Task {
  id: number; uid: number; title: string; description?: string
  status: 'pending' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date?: string; created_at: string
}

export interface FinanceEntry {
  id: number; uid: number; type: 'income' | 'expense'
  amount: number; currency: string; category: string
  note?: string; created_at: string
}

export interface Note {
  id: number; uid: number; title: string
  content: string; tags: string
  pinned: number; created_at: string
}

export interface Habit {
  id: number; uid: number; name: string; icon: string
  frequency: string; streak: number; best_streak: number
  last_done?: string; done_today?: boolean
}

export interface CalendarEvent {
  id: number; uid: number; title: string
  start: string; end?: string
  all_day: number; color: string
}

export interface Contact {
  id: number; uid: number; name: string
  phone?: string; email?: string
  company?: string; notes?: string
}

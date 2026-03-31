import { create } from 'zustand'
import type { Message, Conversation, ChatMode, SidebarTab } from './types'

const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

interface ChatState {
  conversations: Conversation[]
  activeConvId: string | null
  mode: ChatMode
  sidebarTab: SidebarTab
  isSidebarOpen: boolean
  isLoading: boolean
  pcAgentConnected: boolean
  setMode: (m: ChatMode) => void
  setSidebarTab: (t: SidebarTab) => void
  toggleSidebar: () => void
  setLoading: (v: boolean) => void
  setPcAgent: (v: boolean) => void
  newConversation: () => string
  setActiveConv: (id: string) => void
  deleteConversation: (id: string) => void
  addMessage: (convId: string, msg: Omit<Message, 'id' | 'createdAt'>) => string
  updateMessage: (convId: string, msgId: string, patch: Partial<Message>) => void
  updateConvTitle: (convId: string, title: string) => void
  activeConversation: () => Conversation | null
}

export const useStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConvId: null,
  mode: 'chat',
  sidebarTab: 'chat',
  isSidebarOpen: true,
  isLoading: false,
  pcAgentConnected: false,

  setMode: (m) => set({ mode: m }),
  setSidebarTab: (t) => set({ sidebarTab: t }),
  toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
  setLoading: (v) => set({ isLoading: v }),
  setPcAgent: (v) => set({ pcAgentConnected: v }),

  newConversation: () => {
    const id = genId()
    const conv: Conversation = { id, title: 'New chat', messages: [], createdAt: new Date(), updatedAt: new Date() }
    set((s) => ({ conversations: [conv, ...s.conversations], activeConvId: id }))
    return id
  },

  setActiveConv: (id) => set({ activeConvId: id }),

  deleteConversation: (id) => set((s) => ({
    conversations: s.conversations.filter((c) => c.id !== id),
    activeConvId: s.activeConvId === id
      ? (s.conversations.find((c) => c.id !== id)?.id ?? null)
      : s.activeConvId,
  })),

  addMessage: (convId, msg) => {
    const id = genId()
    const full: Message = { ...msg, id, createdAt: new Date() }
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === convId ? { ...c, messages: [...c.messages, full], updatedAt: new Date() } : c
      ),
    }))
    return id
  },

  updateMessage: (convId, msgId, patch) => set((s) => ({
    conversations: s.conversations.map((c) =>
      c.id === convId
        ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m) }
        : c
    ),
  })),

  updateConvTitle: (convId, title) => set((s) => ({
    conversations: s.conversations.map((c) => c.id === convId ? { ...c, title } : c),
  })),

  activeConversation: () => {
    const s = get()
    return s.conversations.find((c) => c.id === s.activeConvId) ?? null
  },
}))

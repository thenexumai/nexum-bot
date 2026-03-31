import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Conversation, Message, ChatMode } from './types'

function uid() { return Math.random().toString(36).slice(2, 10) }

interface State {
  conversations:    Conversation[]
  activeConvId:     string | null
  isSidebarOpen:    boolean
  mode:             ChatMode
  isLoading:        boolean
  pcAgentConnected: boolean

  toggleSidebar:      () => void
  setActiveConv:      (id: string) => void
  newConversation:    () => string
  deleteConversation: (id: string) => void
  addMessage:         (convId: string, msg: Partial<Message>) => string
  updateMessage:      (convId: string, msgId: string, patch: Partial<Message>) => void
  updateConvTitle:    (convId: string, title: string) => void
  setMode:            (m: ChatMode) => void
  setLoading:         (v: boolean) => void
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      conversations:    [],
      activeConvId:     null,
      isSidebarOpen:    true,
      mode:             'chat',
      isLoading:        false,
      pcAgentConnected: false,

      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      setActiveConv: (id) => set({ activeConvId: id }),

      newConversation: () => {
        const id = uid()
        set((s) => ({
          conversations: [{ id, title: 'Новый чат', messages: [], createdAt: Date.now(), updatedAt: Date.now() }, ...s.conversations],
          activeConvId: id,
        }))
        return id
      },

      deleteConversation: (id) => set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        activeConvId: s.activeConvId === id ? null : s.activeConvId,
      })),

      addMessage: (convId, partial) => {
        const msgId = uid()
        const msg: Message = { id: msgId, role: 'user', content: '', createdAt: Date.now(), ...partial } as Message
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, messages: [...c.messages, msg], updatedAt: Date.now() } : c
          ),
        }))
        return msgId
      },

      updateMessage: (convId, msgId, patch) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId
              ? { ...c, messages: c.messages.map((m) => m.id === msgId ? { ...m, ...patch } : m), updatedAt: Date.now() }
              : c
          ),
        })),

      updateConvTitle: (convId, title) =>
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, title: title.trim().slice(0, 70) || 'Чат' } : c
          ),
        })),

      setMode:    (mode)    => set({ mode }),
      setLoading: (isLoading) => set({ isLoading }),
    }),
    {
      name: 'nexum-store',
      partialize: (s) => ({
        conversations: s.conversations.map((c) => ({
          ...c,
          messages: c.messages.filter((m) => !m.isStreaming),
        })),
        isSidebarOpen: s.isSidebarOpen,
        mode: s.mode,
      }),
    }
  )
)

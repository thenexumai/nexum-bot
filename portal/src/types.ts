export type ChatMode = 'chat' | 'search' | 'code' | 'agent'

export interface Source {
  title: string
  url:   string
  snippet?: string
}

export interface Message {
  id:          string
  role:        'user' | 'assistant' | 'system'
  content:     string
  sources?:    Source[]
  tool_used?:  string
  isStreaming?: boolean
  createdAt:   number
}

export interface Conversation {
  id:        string
  title:     string
  messages:  Message[]
  createdAt: number
  updatedAt: number
}

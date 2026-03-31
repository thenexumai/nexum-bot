import React, { useState } from 'react'
import { BookOpen, Search, Trash2, MessageSquare, Clock, ChevronRight } from 'lucide-react'
import { useStore } from '../store'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

export function LibraryPage() {
  const { conversations, deleteConversation, setActiveConv } = useStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  const formatDate = (d: Date) => {
    const date = new Date(d)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const mins = Math.floor(diff / 60000)
    const hrs = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    if (hrs < 24) return `${hrs}h ago`
    return `${days}d ago`
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-y-auto">
      <div className="max-w-3xl mx-auto w-full px-6 py-8">
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-[#eee] mb-1">Library</h1>
          <p className="text-sm text-[#555]">Your conversation history</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#444]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-[#111] border border-[#2a2a2a] rounded-xl pl-10 pr-4 py-2.5 text-sm text-[#eee] placeholder-[#444] focus:outline-none focus:border-[#3a3a3a] transition-colors"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen size={40} className="text-[#2a2a2a] mb-4" />
            <p className="text-[#555] text-sm">
              {search ? 'No conversations found' : 'No conversations yet'}
            </p>
            {!search && (
              <button
                onClick={() => navigate('/chat')}
                className="mt-4 text-sm text-[#5b8def] hover:text-[#4a7de0] transition-colors"
              >
                Start your first chat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((conv) => (
              <div
                key={conv.id}
                className="group flex items-center gap-4 p-4 bg-[#111] border border-[#1e1e1e] rounded-xl hover:border-[#2a2a2a] transition-all cursor-pointer"
                onClick={() => { setActiveConv(conv.id); navigate(`/chat/${conv.id}`) }}
              >
                <div className="w-9 h-9 rounded-lg bg-[#161616] border border-[#2a2a2a] flex items-center justify-center shrink-0">
                  <MessageSquare size={16} className="text-[#444]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[#ccc] group-hover:text-[#eee] truncate transition-colors">{conv.title}</div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Clock size={11} className="text-[#444]" />
                    <span className="text-xs text-[#444]">{formatDate(conv.updatedAt)}</span>
                    <span className="text-xs text-[#333] mx-1">·</span>
                    <span className="text-xs text-[#444]">{conv.messages.length} messages</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-[#444] hover:text-[#ef4444] rounded-lg hover:bg-[#1a1a1a] transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                  <ChevronRight size={16} className="text-[#333] group-hover:text-[#555] transition-colors" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

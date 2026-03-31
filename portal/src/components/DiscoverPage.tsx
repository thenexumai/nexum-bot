import React, { useState } from 'react'
import { Compass, TrendingUp, Cpu, Globe, BookOpen, Beaker } from 'lucide-react'
import clsx from 'clsx'
import { useStore } from '../store'
import { useNavigate } from 'react-router-dom'

const CATEGORIES = [
  { id: 'all',       label: 'All',       icon: <Compass size={14} /> },
  { id: 'trending',  label: 'Trending',  icon: <TrendingUp size={14} /> },
  { id: 'tech',      label: 'Tech',      icon: <Cpu size={14} /> },
  { id: 'world',     label: 'World',     icon: <Globe size={14} /> },
  { id: 'science',   label: 'Science',   icon: <Beaker size={14} /> },
  { id: 'knowledge', label: 'Knowledge', icon: <BookOpen size={14} /> },
]

const TOPICS = [
  { id: 1, cat: 'tech',      emoji: '🤖', title: 'AI models in 2026', sub: 'GPT-5, Claude 4, Gemini Ultra — who wins?', gradient: 'from-blue-900/40 to-indigo-900/40' },
  { id: 2, cat: 'world',     emoji: '🌍', title: 'Global economy outlook', sub: 'IMF predictions for Q2 2026', gradient: 'from-green-900/40 to-emerald-900/40' },
  { id: 3, cat: 'science',   emoji: '🧬', title: 'Gene editing breakthroughs', sub: 'CRISPR applications in medicine', gradient: 'from-purple-900/40 to-pink-900/40' },
  { id: 4, cat: 'tech',      emoji: '⚡', title: 'Quantum computing updates', sub: 'IBM and Google race to 1000 qubits', gradient: 'from-yellow-900/40 to-orange-900/40' },
  { id: 5, cat: 'knowledge', emoji: '📚', title: 'History of cryptography', sub: 'From Caesar cipher to post-quantum', gradient: 'from-red-900/40 to-rose-900/40' },
  { id: 6, cat: 'science',   emoji: '🚀', title: 'SpaceX Starship mission', sub: 'Latest Mars colonization timeline', gradient: 'from-cyan-900/40 to-blue-900/40' },
  { id: 7, cat: 'trending',  emoji: '📈', title: 'Crypto market analysis', sub: 'Bitcoin halving effects on altcoins', gradient: 'from-amber-900/40 to-yellow-900/40' },
  { id: 8, cat: 'trending',  emoji: '🎮', title: 'Next-gen gaming tech', sub: 'PS6, Xbox Series X2, cloud gaming', gradient: 'from-violet-900/40 to-purple-900/40' },
]

export function DiscoverPage() {
  const [active, setActive] = useState('all')
  const { newConversation, addMessage, updateConvTitle } = useStore()
  const navigate = useNavigate()

  const filtered = active === 'all' ? TOPICS : TOPICS.filter((t) => t.cat === active)

  const handleTopic = (title: string) => {
    const id = newConversation()
    addMessage(id, { role: 'user', content: `Tell me about: ${title}` })
    updateConvTitle(id, title)
    navigate(`/chat/${id}`)
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-xl font-semibold text-[#eee] mb-1">Discover</h1>
          <p className="text-sm text-[#555]">Explore trending topics and ideas</p>
        </div>

        {/* Category pills */}
        <div className="flex gap-2 flex-wrap mb-8">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActive(c.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                active === c.id
                  ? 'bg-[#5b8def] text-white'
                  : 'bg-[#111] border border-[#2a2a2a] text-[#666] hover:text-[#ccc] hover:border-[#3a3a3a]'
              )}
            >
              {c.icon}<span>{c.label}</span>
            </button>
          ))}
        </div>

        {/* Topics grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTopic(t.title)}
              className={clsx(
                'flex items-start gap-4 p-5 rounded-xl border border-[#1e1e1e] text-left',
                'bg-gradient-to-br', t.gradient,
                'hover:border-[#3a3a3a] transition-all group'
              )}
            >
              <span className="text-3xl">{t.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-[#ddd] text-sm group-hover:text-white transition-colors">{t.title}</div>
                <div className="text-xs text-[#555] mt-1 group-hover:text-[#777] transition-colors">{t.sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

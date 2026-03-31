import React, { useState } from 'react'
import { Search, Sparkles, TrendingUp, Globe, Code2, Microscope, BookOpen, Briefcase } from 'lucide-react'
import { useAppStore } from '../appStore'
import { t } from '../i18n'
import clsx from 'clsx'

const TOPICS = [
  { id: 'all',       icon: <Sparkles size={14} />,  labelKey: 'all' },
  { id: 'trending',  icon: <TrendingUp size={14} />, labelKey: 'trending' },
  { id: 'world',     icon: <Globe size={14} />,      labelKey: 'world' },
  { id: 'code',      icon: <Code2 size={14} />,      labelKey: 'code' },
  { id: 'science',   icon: <Microscope size={14} />, labelKey: 'science' },
  { id: 'education', icon: <BookOpen size={14} />,   labelKey: 'education' },
  { id: 'business',  icon: <Briefcase size={14} />,  labelKey: 'business' },
]

const CARDS = [
  { title: 'Квантовые компьютеры в 2026',       topic: 'science',   emoji: '🔬', desc: 'Новые достижения в квантовых вычислениях и что это значит для криптографии.' },
  { title: 'GPT-5 vs Claude 4 — сравнение',    topic: 'code',      emoji: '🤖', desc: 'Детальный технический анализ двух флагманских языковых моделей.' },
  { title: 'Рынок ИИ в Центральной Азии',      topic: 'business',  emoji: '💼', desc: 'Как стартапы Узбекистана, Казахстана и Кыргызстана конкурируют с мировыми игроками.' },
  { title: 'Обучение через ИИ-туторов',         topic: 'education', emoji: '🎓', desc: 'Персонализированное образование с помощью AI: мифы и реальность.' },
  { title: 'Топ языки программирования 2026',   topic: 'code',      emoji: '💻', desc: 'Rust, Python, Go — кто лидирует в 2026 году по опросам разработчиков.' },
  { title: 'Энергопотребление ЦОД растёт',      topic: 'world',     emoji: '⚡', desc: 'Центры обработки данных потребляют всё больше электричества. Что делать?' },
]

export function DiscoverPage() {
  const { lang } = useAppStore()
  const [activeTopic, setActiveTopic] = useState('all')
  const [query, setQuery] = useState('')

  const filtered = CARDS.filter((c) =>
    (activeTopic === 'all' || c.topic === activeTopic) &&
    (query === '' || c.title.toLowerCase().includes(query.toLowerCase()))
  )

  return (
    <div className="h-full overflow-y-auto var-bg">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold var-text mb-1">{t(lang, 'discover')}</h1>
          <p className="var-text-muted text-sm">{t(lang, 'discover_sub')}</p>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 var-text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={t(lang, 'search_placeholder')}
            className="nexum-input w-full pl-10" />
        </div>

        {/* Topics */}
        <div className="flex gap-2 flex-wrap mb-8">
          {TOPICS.map(({ id, icon, labelKey }) => (
            <button key={id} onClick={() => setActiveTopic(id)}
              className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                activeTopic === id ? 'bg-[var(--accent)] text-white border-transparent' : 'var-border var-text-muted hover:var-text hover:var-border-hover')}>
              {icon}<span>{t(lang, labelKey)}</span>
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filtered.map((card, i) => (
            <div key={i} className="group var-surface border var-border rounded-xl p-5 hover:var-surface-2 hover:border-[var(--border-hover)] transition-all cursor-pointer animate-fade-in">
              <div className="text-2xl mb-3">{card.emoji}</div>
              <h3 className="text-sm font-semibold var-text mb-2 group-hover:text-[var(--accent)] transition-colors">{card.title}</h3>
              <p className="text-xs var-text-muted leading-relaxed">{card.desc}</p>
              <div className="mt-3">
                <span className={clsx('text-[10px] px-2 py-0.5 rounded-full border font-medium',
                  'bg-[var(--accent)]/10 border-[var(--accent)]/20 text-[var(--accent)]')}>
                  {card.topic}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

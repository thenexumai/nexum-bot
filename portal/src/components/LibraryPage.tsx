import React from 'react'
import { BookOpen, MessageSquare, Clock, Trash2 } from 'lucide-react'
import { useStore } from '../store'
import { useAppStore } from '../appStore'
import { t } from '../i18n'
import { useNavigate } from 'react-router-dom'
import clsx from 'clsx'

export function LibraryPage() {
  const { conversations, deleteConversation, setActiveConv } = useStore()
  const { lang } = useAppStore()
  const navigate = useNavigate()

  const convs = conversations.filter((c) => c.messages.length > 0)

  return (
    <div className="h-full overflow-y-auto var-bg">
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold var-text mb-1">{t(lang, 'library')}</h1>
          <p className="var-text-muted text-sm">{t(lang, 'library_sub')}</p>
        </div>

        {convs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 var-surface-3 rounded-2xl flex items-center justify-center mb-4">
              <BookOpen size={24} className="var-text-faint" />
            </div>
            <p className="text-sm font-medium var-text mb-1">{t(lang, 'empty_library')}</p>
            <p className="text-xs var-text-muted">{t(lang, 'empty_library_sub')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {convs.map((conv) => (
              <div key={conv.id}
                className="group flex items-center gap-4 p-4 var-surface border var-border rounded-xl hover:var-surface-2 hover:border-[var(--border-hover)] transition-all cursor-pointer"
                onClick={() => { setActiveConv(conv.id); navigate(`/chat/${conv.id}`) }}>
                <div className="w-9 h-9 var-surface-3 rounded-xl flex items-center justify-center shrink-0">
                  <MessageSquare size={15} className="var-text-muted" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium var-text truncate">{conv.title || 'Без названия'}</div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs var-text-faint flex items-center gap-1">
                      <MessageSquare size={10} />{conv.messages.length} {t(lang, 'messages')}
                    </span>
                    {conv.updatedAt && (
                      <span className="text-xs var-text-faint flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(conv.updatedAt).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                  className="opacity-0 group-hover:opacity-100 p-2 var-text-faint hover:text-red-400 hover:var-surface-3 rounded-lg transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

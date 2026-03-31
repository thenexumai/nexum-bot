import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Compass, BookOpen, Settings,
  PlusCircle, ChevronLeft, ChevronRight,
  Monitor, Grid3x3, Sun, Moon, Globe
} from 'lucide-react'
import { useStore } from '../store'
import { useAppStore } from '../appStore'
import { t, LANGUAGES } from '../i18n'
import clsx from 'clsx'

const NAV = [
  { to: '/chat',     icon: MessageSquare, labelKey: 'chat' },
  { to: '/discover', icon: Compass,        labelKey: 'discover' },
  { to: '/library',  icon: BookOpen,       labelKey: 'library' },
]

interface Props {
  onOpenMiniApps: () => void
}

export function Sidebar({ onOpenMiniApps }: Props) {
  const { isSidebarOpen, toggleSidebar, conversations, activeConvId,
          setActiveConv, deleteConversation, newConversation, pcAgentConnected } = useStore()
  const { lang, setLang, theme, setTheme } = useAppStore()
  const navigate = useNavigate()
  const [showLang, setShowLang] = React.useState(false)

  const handleNew = () => {
    const id = newConversation()
    navigate(`/chat/${id}`)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <aside className={clsx(
      'flex flex-col border-r var-border var-surface transition-all duration-300 shrink-0',
      isSidebarOpen ? 'w-[260px]' : 'w-[56px]'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b var-border">
        {isSidebarOpen ? (
          <div className="flex items-center gap-2">
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
              <path d="M18 82L50 18L82 82M32 60L68 60" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-semibold var-text tracking-wide text-sm">NEXUM</span>
          </div>
        ) : (
          <svg width="22" height="22" viewBox="0 0 100 100" fill="none" className="mx-auto">
            <path d="M18 82L50 18L82 82M32 60L68 60" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <button onClick={toggleSidebar}
          className="p-1.5 rounded-md var-text-muted hover:var-text-faint hover:var-surface-3 transition-colors">
          {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* New Chat */}
      <div className="px-2 py-3">
        <button onClick={handleNew}
          className={clsx(
            'flex items-center gap-2 w-full px-3 py-2.5 rounded-lg',
            'bg-[var(--accent)] hover:opacity-90 text-white font-medium text-sm transition-opacity',
            !isSidebarOpen && 'justify-center'
          )}>
          <PlusCircle size={16} />
          {isSidebarOpen && <span>{t(lang, 'new_chat')}</span>}
        </button>
      </div>

      {/* Nav */}
      <nav className="px-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, labelKey }) => (
          <NavLink key={to} to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              isActive ? 'var-surface-3 var-text font-medium' : 'var-text-muted hover:var-text hover:var-surface-2',
              !isSidebarOpen && 'justify-center'
            )}>
            <Icon size={17} />
            {isSidebarOpen && <span>{t(lang, labelKey)}</span>}
          </NavLink>
        ))}

        {/* Mini Apps button */}
        <button onClick={onOpenMiniApps}
          className={clsx(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors var-text-muted hover:var-text hover:var-surface-2',
            !isSidebarOpen && 'justify-center'
          )}>
          <Grid3x3 size={17} />
          {isSidebarOpen && <span>{t(lang, 'mini_apps')}</span>}
        </button>
      </nav>

      {/* Recent conversations */}
      {isSidebarOpen && conversations.length > 0 && (
        <div className="px-3 mt-4 mb-1">
          <p className="text-[10px] uppercase tracking-widest var-text-faint font-medium">{t(lang, 'recent')}</p>
        </div>
      )}
      {isSidebarOpen && (
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
          {conversations.slice(0, 30).map((conv) => (
            <div key={conv.id}
              onClick={() => { setActiveConv(conv.id); navigate(`/chat/${conv.id}`) }}
              className={clsx(
                'group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                activeConvId === conv.id ? 'var-surface-3 var-text' : 'var-text-muted hover:var-text hover:var-surface-2'
              )}>
              <span className="truncate flex-1 pr-2">{conv.title}</span>
              <button onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                className="opacity-0 group-hover:opacity-100 var-text-faint hover:text-red-400 transition-all p-0.5 rounded">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom tools */}
      <div className="mt-auto border-t var-border px-2 py-3 space-y-1">
        {/* PC Agent */}
        {isSidebarOpen && (
          <div className={clsx('flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            pcAgentConnected ? 'text-green-400' : 'var-text-faint')}>
            <Monitor size={13} />
            <span>{pcAgentConnected ? t(lang, 'pc_connected') : t(lang, 'pc_offline')}</span>
            <div className={clsx('ml-auto w-1.5 h-1.5 rounded-full', pcAgentConnected ? 'bg-green-400 animate-pulse' : 'var-surface-3')} />
          </div>
        )}

        {/* Theme toggle */}
        <button onClick={toggleTheme}
          className={clsx('w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors var-text-muted hover:var-text hover:var-surface-2',
            !isSidebarOpen && 'justify-center')}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {isSidebarOpen && <span>{theme === 'dark' ? t(lang, 'light') : t(lang, 'dark')}</span>}
        </button>

        {/* Language selector */}
        {isSidebarOpen && (
          <div className="relative">
            <button onClick={() => setShowLang(!showLang)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm var-text-muted hover:var-text hover:var-surface-2 transition-colors">
              <Globe size={16} />
              <span>{LANGUAGES.find((l) => l.id === lang)?.flag} {LANGUAGES.find((l) => l.id === lang)?.label}</span>
            </button>
            {showLang && (
              <div className="absolute bottom-full mb-1 left-0 right-0 var-surface border var-border rounded-xl py-1 shadow-xl z-50 animate-fade-in">
                {LANGUAGES.map((l) => (
                  <button key={l.id} onClick={() => { setLang(l.id); setShowLang(false) }}
                    className={clsx('w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors',
                      lang === l.id ? 'var-accent var-surface-3' : 'var-text-muted hover:var-text hover:var-surface-2')}>
                    <span>{l.flag}</span><span>{l.label}</span>
                    {lang === l.id && <span className="ml-auto">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <NavLink to="/settings"
          className={({ isActive }) => clsx(
            'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
            isActive ? 'var-surface-3 var-text' : 'var-text-muted hover:var-text hover:var-surface-2',
            !isSidebarOpen && 'justify-center'
          )}>
          <Settings size={16} />
          {isSidebarOpen && <span>{t(lang, 'settings')}</span>}
        </NavLink>
      </div>
    </aside>
  )
}

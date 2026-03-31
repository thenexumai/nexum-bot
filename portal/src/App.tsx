import React, { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar }      from './components/Sidebar'
import { ChatPage }     from './components/ChatPage'
import { LibraryPage }  from './components/LibraryPage'
import { DiscoverPage } from './components/DiscoverPage'
import { SettingsPage } from './components/SettingsPage'
import { MiniAppsHub }  from './components/MiniAppsHub'
import { useStore }     from './store'
import { useAppStore }  from './appStore'
import { useMiniApps }  from './appStore'
import { healthCheck }  from './api'
import clsx from 'clsx'

export default function App() {
  const { isSidebarOpen } = useStore()
  const { theme, setTheme } = useAppStore()
  const { toast } = useMiniApps()
  const [backendOk, setBackendOk]     = useState<boolean | null>(null)
  const [miniAppsOpen, setMiniAppsOpen] = useState(false)

  useEffect(() => {
    healthCheck().then((r) => setBackendOk(!!r?.ok))
  }, [])

  // Apply theme on mount
  useEffect(() => {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    document.documentElement.setAttribute('data-theme', resolved)
  }, [theme])

  return (
    <div className={clsx('flex h-screen w-screen overflow-hidden var-bg var-text')}>
      {/* Sidebar */}
      <Sidebar onOpenMiniApps={() => setMiniAppsOpen(true)} />

      {/* Main */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Backend offline banner */}
        {backendOk === false && (
          <div className="px-4 py-1.5 bg-amber-900/30 border-b border-amber-500/20 text-amber-400 text-xs text-center">
            ⚠️ Backend offline — demo mode
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat"     element={<ChatPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/library"  element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>

      {/* Mini Apps Panel */}
      {miniAppsOpen && (
        <aside className="w-80 shrink-0 h-full animate-slide-in-right">
          <MiniAppsHub onClose={() => setMiniAppsOpen(false)} />
        </aside>
      )}

      {/* Toast notifications */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[#1a2a1a] border border-green-500/30 text-green-400 text-sm rounded-xl shadow-xl">
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  )
}

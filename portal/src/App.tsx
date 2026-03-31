import React, { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { ChatPage } from './components/ChatPage'
import { LibraryPage } from './components/LibraryPage'
import { DiscoverPage } from './components/DiscoverPage'
import { SettingsPage } from './components/SettingsPage'
import { useStore } from './store'
import { healthCheck } from './api'
import clsx from 'clsx'

export default function App() {
  const { isSidebarOpen } = useStore()
  const [backendOk, setBackendOk] = useState<boolean | null>(null)

  useEffect(() => {
    healthCheck().then((r) => setBackendOk(!!r?.ok))
  }, [])

  return (
    <div className={clsx(
      'flex h-screen w-screen overflow-hidden',
      'bg-[#0a0a0a] text-[#eeeeee]'
    )}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main content */}
      <main className={clsx(
        'flex-1 flex flex-col overflow-hidden transition-all duration-300',
        isSidebarOpen ? 'ml-0' : 'ml-0'
      )}>
        {/* Backend offline banner */}
        {backendOk === false && (
          <div className="px-4 py-2 bg-[#2a1515] border-b border-[#ef4444]/30 text-[#ef4444] text-xs text-center">
            ⚠️ Backend offline — running in demo mode
          </div>
        )}

        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:id" element={<ChatPage />} />
          <Route path="/discover" element={<DiscoverPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  )
}

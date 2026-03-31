import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import {
  MessageSquare, Compass, BookOpen, Settings,
  PlusCircle, ChevronLeft, ChevronRight, Monitor,
  Cpu
} from 'lucide-react'
import { useStore } from '../store'
import clsx from 'clsx'

const NAV = [
  { to: '/chat',     icon: MessageSquare, label: 'Chat' },
  { to: '/discover', icon: Compass,        label: 'Discover' },
  { to: '/library',  icon: BookOpen,       label: 'Library' },
]

export function Sidebar() {
  const { isSidebarOpen, toggleSidebar, conversations, activeConvId,
          setActiveConv, deleteConversation, newConversation, pcAgentConnected } = useStore()
  const navigate = useNavigate()

  const handleNew = () => {
    const id = newConversation()
    navigate(`/chat/${id}`)
  }

  return (
    <aside className={clsx(
      'flex flex-col border-r border-[#1e1e1e] bg-[#0d0d0d] transition-all duration-300 shrink-0',
      isSidebarOpen ? 'w-[260px]' : 'w-[56px]'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-4 border-b border-[#1e1e1e]">
        {isSidebarOpen && (
          <div className="flex items-center gap-2">
            {/* NEXUM Logo SVG */}
            <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
              <path d="M18 82L50 18L82 82M32 60L68 60" stroke="#5b8def" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="font-semibold text-[#eee] tracking-wide text-sm">NEXUM</span>
          </div>
        )}
        {!isSidebarOpen && (
          <svg width="22" height="22" viewBox="0 0 100 100" fill="none" className="mx-auto">
            <path d="M18 82L50 18L82 82M32 60L68 60" stroke="#5b8def" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        <button
          onClick={toggleSidebar}
          className="p-1.5 rounded-md text-[#555] hover:text-[#888] hover:bg-[#1a1a1a] transition-colors"
          aria-label="Toggle sidebar"
        >
          {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>
      </div>

      {/* New Chat Button */}
      <div className="px-2 py-3">
        <button
          onClick={handleNew}
          className={clsx(
            'flex items-center gap-2 w-full px-3 py-2.5 rounded-lg',
            'bg-[#5b8def] hover:bg-[#4a7de0] text-white font-medium text-sm',
            'transition-colors duration-150',
            !isSidebarOpen && 'justify-center'
          )}
        >
          <PlusCircle size={16} />
          {isSidebarOpen && <span>New chat</span>}
        </button>
      </div>

      {/* Nav links */}
      <nav className="px-2 space-y-0.5">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              isActive
                ? 'bg-[#1a1a1a] text-[#eee] font-medium'
                : 'text-[#666] hover:text-[#aaa] hover:bg-[#161616]',
              !isSidebarOpen && 'justify-center'
            )}
          >
            <Icon size={17} />
            {isSidebarOpen && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      {isSidebarOpen && conversations.length > 0 && (
        <div className="px-3 mt-4 mb-1">
          <p className="text-[10px] uppercase tracking-widest text-[#444] font-medium">Recent</p>
        </div>
      )}

      {/* Conversation list */}
      {isSidebarOpen && (
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">
          {conversations.slice(0, 30).map((conv) => (
            <div
              key={conv.id}
              onClick={() => { setActiveConv(conv.id); navigate(`/chat/${conv.id}`) }}
              className={clsx(
                'group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors',
                activeConvId === conv.id
                  ? 'bg-[#1a1a1a] text-[#eee]'
                  : 'text-[#666] hover:text-[#aaa] hover:bg-[#161616]'
              )}
            >
              <span className="truncate flex-1 pr-2">{conv.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id) }}
                className="opacity-0 group-hover:opacity-100 text-[#555] hover:text-[#ef4444] transition-all p-0.5 rounded"
                aria-label="Delete conversation"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom section */}
      <div className="mt-auto border-t border-[#1e1e1e] px-2 py-3 space-y-0.5">
        {/* PC Agent status */}
        {isSidebarOpen && (
          <div className={clsx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
            pcAgentConnected ? 'text-[#22c55e]' : 'text-[#555]'
          )}>
            <Monitor size={14} />
            <span>{pcAgentConnected ? 'PC Agent connected' : 'PC Agent offline'}</span>
            <div className={clsx(
              'ml-auto w-1.5 h-1.5 rounded-full',
              pcAgentConnected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#444]'
            )} />
          </div>
        )}

        <NavLink
          to="/settings"
          className={({ isActive }) => clsx(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
            isActive ? 'bg-[#1a1a1a] text-[#eee]' : 'text-[#666] hover:text-[#aaa] hover:bg-[#161616]',
            !isSidebarOpen && 'justify-center'
          )}
        >
          <Settings size={17} />
          {isSidebarOpen && <span>Settings</span>}
        </NavLink>
      </div>
    </aside>
  )
}

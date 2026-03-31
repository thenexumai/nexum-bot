import React, { useState } from 'react'
import {
  CheckSquare, Wallet, StickyNote, Target,
  Calendar, Users, X, ChevronRight
} from 'lucide-react'
import { TasksApp }   from './miniapps/TasksApp'
import { FinanceApp } from './miniapps/FinanceApp'
import { NotesApp }   from './miniapps/NotesApp'
import { HabitsApp }  from './miniapps/HabitsApp'
import { useAppStore } from '../appStore'
import { t } from '../i18n'
import clsx from 'clsx'

type AppId = 'tasks' | 'finance' | 'notes' | 'habits' | 'calendar' | 'contacts'

const APPS: {
  id: AppId
  icon: React.ReactNode
  color: string
  bg: string
  border: string
  labelKey: string
}[] = [
  { id: 'tasks',    icon: <CheckSquare size={20} />, color: 'text-[#5b8def]', bg: 'bg-[#5b8def]/15', border: 'border-[#5b8def]/25', labelKey: 'tasks' },
  { id: 'finance',  icon: <Wallet size={20} />,      color: 'text-green-400',  bg: 'bg-green-500/15',  border: 'border-green-500/25',  labelKey: 'finance' },
  { id: 'notes',    icon: <StickyNote size={20} />,  color: 'text-amber-400',  bg: 'bg-amber-500/15',  border: 'border-amber-500/25',  labelKey: 'notes' },
  { id: 'habits',   icon: <Target size={20} />,      color: 'text-purple-400', bg: 'bg-purple-500/15', border: 'border-purple-500/25', labelKey: 'habits' },
  { id: 'calendar', icon: <Calendar size={20} />,    color: 'text-cyan-400',   bg: 'bg-cyan-500/15',   border: 'border-cyan-500/25',   labelKey: 'calendar' },
  { id: 'contacts', icon: <Users size={20} />,       color: 'text-rose-400',   bg: 'bg-rose-500/15',   border: 'border-rose-500/25',   labelKey: 'contacts' },
]

const COMPONENTS: Partial<Record<AppId, React.ComponentType>> = {
  tasks:   TasksApp,
  finance: FinanceApp,
  notes:   NotesApp,
  habits:  HabitsApp,
}

interface Props {
  onClose: () => void
}

export function MiniAppsHub({ onClose }: Props) {
  const [active, setActive] = useState<AppId | null>(null)
  const { lang } = useAppStore()

  const ActiveComp = active ? COMPONENTS[active] : null
  const activeApp = APPS.find((a) => a.id === active)

  return (
    <div className="flex flex-col h-full var-surface border-l var-border">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3.5 border-b var-border">
        <div className="flex items-center gap-2">
          {active ? (
            <>
              <button onClick={() => setActive(null)} className="p-1 var-text-muted hover:var-text rounded-md transition-colors">
                <ChevronRight size={16} className="rotate-180" />
              </button>
              <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center', activeApp?.bg, activeApp?.color)}>
                {activeApp?.icon && React.cloneElement(activeApp.icon as React.ReactElement, { size: 14 })}
              </div>
              <span className="text-sm font-semibold var-text">{t(lang, activeApp?.labelKey ?? '')}</span>
            </>
          ) : (
            <span className="text-sm font-semibold var-text">{t(lang, 'mini_apps')}</span>
          )}
        </div>
        <button onClick={onClose} className="p-1.5 var-text-muted hover:var-text hover:var-surface-3 rounded-lg transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!active ? (
          // Apps Grid
          <div className="grid grid-cols-2 gap-3">
            {APPS.map((app) => (
              <button
                key={app.id}
                onClick={() => setActive(app.id)}
                className={clsx(
                  'flex flex-col items-center gap-2.5 p-4 rounded-xl border transition-all group',
                  'var-surface-2 border-var-border hover:border-var-border-hover'
                )}
              >
                <div className={clsx(
                  'w-12 h-12 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-105',
                  app.bg, app.border, app.color
                )}>
                  {app.icon}
                </div>
                <span className="text-xs font-medium var-text">{t(lang, app.labelKey)}</span>
              </button>
            ))}
          </div>
        ) : ActiveComp ? (
          // Active app
          <div className="animate-fade-in">
            <ActiveComp />
          </div>
        ) : (
          // Coming soon
          <div className="flex flex-col items-center justify-center py-16 text-center">
            {activeApp && (
              <div className={clsx('w-14 h-14 rounded-2xl border flex items-center justify-center mb-4', activeApp.bg, activeApp.border, activeApp.color)}>
                {activeApp.icon}
              </div>
            )}
            <p className="text-sm font-medium var-text">{t(lang, active)}</p>
            <p className="text-xs var-text-muted mt-1">Coming soon</p>
          </div>
        )}
      </div>
    </div>
  )
}

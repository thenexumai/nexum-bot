import React from 'react'
import { Dumbbell, BookOpen, Droplets, Code2, Sun, Star, Zap, Heart, Target, Trophy } from 'lucide-react'
import { useMiniApps } from '../../appStore'
import { useAppStore } from '../../appStore'
import { t } from '../../i18n'
import clsx from 'clsx'

const HABIT_ICONS: Record<string, React.ReactNode> = {
  Dumbbell:  <Dumbbell size={18} />,
  BookOpen:  <BookOpen size={18} />,
  Droplets:  <Droplets size={18} />,
  Code2:     <Code2 size={18} />,
  Sun:       <Sun size={18} />,
  Star:      <Star size={18} />,
  Zap:       <Zap size={18} />,
  Heart:     <Heart size={18} />,
  Target:    <Target size={18} />,
  Trophy:    <Trophy size={18} />,
}

const ICON_COLORS = [
  'text-blue-400 bg-blue-500/15 border-blue-500/20',
  'text-amber-400 bg-amber-500/15 border-amber-500/20',
  'text-cyan-400 bg-cyan-500/15 border-cyan-500/20',
  'text-green-400 bg-green-500/15 border-green-500/20',
  'text-purple-400 bg-purple-500/15 border-purple-500/20',
  'text-rose-400 bg-rose-500/15 border-rose-500/20',
]

export function HabitsApp() {
  const { habits, checkHabit } = useMiniApps()
  const { lang } = useAppStore()

  const doneCount = habits.filter((h) => h.doneToday).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-purple-500/15 border border-purple-500/20 flex items-center justify-center">
            <Target size={16} className="text-purple-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold var-text">{t(lang, 'habits')}</h2>
            <p className="text-xs var-text-muted">{doneCount}/{habits.length} {t(lang, 'done_today')}</p>
          </div>
        </div>
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-1.5 var-surface-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${habits.length ? (doneCount / habits.length) * 100 : 0}%` }}
            />
          </div>
          <span className="text-xs var-text-muted">{habits.length ? Math.round((doneCount / habits.length) * 100) : 0}%</span>
        </div>
      </div>

      {/* Habits grid */}
      <div className="grid grid-cols-2 gap-2">
        {habits.map((habit, i) => {
          const colorClass = ICON_COLORS[i % ICON_COLORS.length]
          const icon = HABIT_ICONS[habit.icon] ?? <Star size={18} />
          const parts = colorClass.split(' ')
          return (
            <button
              key={habit.id}
              onClick={() => checkHabit(habit.id)}
              className={clsx(
                'flex flex-col gap-2 p-3 rounded-xl border text-left transition-all',
                habit.doneToday
                  ? 'bg-purple-500/10 border-purple-500/30'
                  : 'var-surface-2 border-var-border hover:border-var-border-hover'
              )}
            >
              <div className="flex items-center justify-between">
                <div className={clsx('w-8 h-8 rounded-lg border flex items-center justify-center', colorClass)}>
                  {icon}
                </div>
                {habit.doneToday && (
                  <span className="text-[10px] text-purple-400 font-medium">✓</span>
                )}
              </div>
              <div>
                <div className="text-xs font-medium var-text leading-tight">{habit.name}</div>
                <div className="flex items-center gap-1 mt-1">
                  <Zap size={9} className="text-amber-400" />
                  <span className="text-[10px] text-amber-400">{habit.streak} {t(lang, 'streak')}</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

import React, { useState } from 'react'
import { useMiniApps } from '../../appStore'
import { Plus, Flame, CheckCircle2, Circle } from 'lucide-react'
import clsx from 'clsx'

export function HabitsApp() {
  const { habits, addHabit, checkHabit } = useMiniApps()
  const [input, setInput] = useState('')

  const submit = () => {
    if (!input.trim()) return
    addHabit(input.trim())
    setInput('')
  }

  const completedToday = habits.filter((h) => h.completedToday).length

  return (
    <div className="space-y-4">
      {/* Stats */}
      {habits.length > 0 && (
        <div className="flex items-center gap-2 text-xs var-text-muted">
          <Flame size={13} className="text-orange-400" />
          <span>{completedToday}/{habits.length} сегодня</span>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Новая привычка..."
          className="nexum-input flex-1 text-sm" />
        <button onClick={submit} className="p-2.5 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity">
          <Plus size={16} />
        </button>
      </div>

      {habits.length === 0 ? (
        <div className="text-center py-8 var-text-faint text-sm">Нет привычек</div>
      ) : (
        <div className="space-y-2">
          {habits.map((habit) => (
            <div key={habit.id}
              className="flex items-center gap-3 p-3 var-surface-2 rounded-xl border var-border hover:border-[var(--border-hover)] transition-all">
              <button onClick={() => !habit.completedToday && checkHabit(habit.id)}
                disabled={habit.completedToday}>
                {habit.completedToday
                  ? <CheckCircle2 size={18} className="text-[var(--accent)]" />
                  : <Circle size={18} className="var-text-faint" />}
              </button>
              <div className="flex-1">
                <div className={clsx('text-sm', habit.completedToday ? 'var-text-muted line-through' : 'var-text')}>
                  {habit.label}
                </div>
              </div>
              {habit.streak > 0 && (
                <div className="flex items-center gap-1 text-xs text-orange-400">
                  <Flame size={12} /><span>{habit.streak}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

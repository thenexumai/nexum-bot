import React, { useState } from 'react'
import { CheckSquare, Plus, Trash2, Flag, Circle, CheckCircle2 } from 'lucide-react'
import { useMiniApps } from '../../appStore'
import { useAppStore } from '../../appStore'
import { t } from '../../i18n'
import clsx from 'clsx'

const PRIORITY_COLORS = {
  high:   { dot: 'bg-red-500',   text: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20' },
  medium: { dot: 'bg-amber-500', text: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  low:    { dot: 'bg-green-500', text: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
}

export function TasksApp() {
  const { tasks, addTask, toggleTask, deleteTask } = useMiniApps()
  const { lang } = useAppStore()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'low'|'medium'|'high'>('medium')
  const [adding, setAdding] = useState(false)

  const submit = () => {
    if (!title.trim()) return
    addTask({ title: title.trim(), priority, done: false, date: new Date().toISOString() })
    setTitle('')
    setAdding(false)
  }

  const pending = tasks.filter((t) => !t.done)
  const done = tasks.filter((t) => t.done)

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#5b8def]/15 border border-[#5b8def]/20 flex items-center justify-center">
            <CheckSquare size={16} className="text-[#5b8def]" />
          </div>
          <div>
            <h2 className="text-sm font-semibold var-text">{t(lang, 'tasks')}</h2>
            <p className="text-xs var-text-muted">{pending.length} pending</p>
          </div>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#5b8def] text-white rounded-lg text-xs font-medium hover:bg-[#4a7de0] transition-colors">
          <Plus size={13} />{t(lang, 'add_task')}
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="var-surface-2 border var-border rounded-xl p-3 space-y-3 animate-fade-in">
          <input
            autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Task title..."
            className="w-full bg-transparent var-text text-sm placeholder-var-muted focus:outline-none"
          />
          <div className="flex items-center gap-2">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button key={p} onClick={() => setPriority(p)}
                className={clsx('flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all',
                  priority === p ? PRIORITY_COLORS[p].bg + ' ' + PRIORITY_COLORS[p].text : 'var-surface border-var-border var-text-muted')}>
                <Flag size={10} />{t(lang, `priority_${p}`)}
              </button>
            ))}
            <button onClick={submit}
              className="ml-auto px-3 py-1 bg-[#5b8def] text-white rounded-lg text-xs font-medium hover:bg-[#4a7de0] transition-colors">
              {t(lang, 'save')}
            </button>
          </div>
        </div>
      )}

      {/* Pending tasks */}
      {pending.length === 0 && !adding && (
        <div className="text-center py-8 var-text-muted text-sm">
          <CheckSquare size={32} className="mx-auto mb-2 opacity-20" />
          {t(lang, 'no_tasks')}
        </div>
      )}
      <div className="space-y-1.5">
        {pending.map((task) => (
          <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
        ))}
      </div>

      {/* Done tasks */}
      {done.length > 0 && (
        <div>
          <p className="text-xs var-text-muted mb-2 uppercase tracking-wider">Done ({done.length})</p>
          <div className="space-y-1.5 opacity-50">
            {done.slice(0, 5).map((task) => (
              <TaskRow key={task.id} task={task} onToggle={() => toggleTask(task.id)} onDelete={() => deleteTask(task.id)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TaskRow({ task, onToggle, onDelete }: any) {
  const p = PRIORITY_COLORS[task.priority as keyof typeof PRIORITY_COLORS]
  return (
    <div className="group flex items-center gap-3 p-3 var-surface-2 border var-border rounded-xl hover:border-var-border-hover transition-all">
      <button onClick={onToggle} className="shrink-0">
        {task.done
          ? <CheckCircle2 size={18} className="text-[#5b8def]" />
          : <Circle size={18} className="var-text-muted" />}
      </button>
      <span className={clsx('flex-1 text-sm', task.done ? 'line-through var-text-muted' : 'var-text')}>{task.title}</span>
      <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', p.dot)} />
      <button onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 p-1 var-text-muted hover:text-red-400 transition-all">
        <Trash2 size={13} />
      </button>
    </div>
  )
}

import React, { useState } from 'react'
import { useMiniApps } from '../../appStore'
import { Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import clsx from 'clsx'

export function TasksApp() {
  const { tasks, addTask, toggleTask, deleteTask } = useMiniApps()
  const [input, setInput] = useState('')

  const done = tasks.filter((t) => t.done).length

  const submit = () => {
    if (!input.trim()) return
    addTask(input.trim())
    setInput('')
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      {tasks.length > 0 && (
        <div className="flex items-center gap-3 text-xs var-text-muted">
          <span>{done}/{tasks.length} выполнено</span>
          <div className="flex-1 h-1 var-surface-3 rounded-full overflow-hidden">
            <div className="h-full bg-[var(--accent)] rounded-full transition-all"
              style={{ width: tasks.length ? `${(done / tasks.length) * 100}%` : '0%' }} />
          </div>
        </div>
      )}

      {/* Input */}
      <div className="flex gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="Добавить задачу..."
          className="nexum-input flex-1 text-sm" />
        <button onClick={submit}
          className="p-2.5 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity">
          <Plus size={16} />
        </button>
      </div>

      {/* Tasks */}
      {tasks.length === 0 ? (
        <div className="text-center py-8 var-text-faint text-sm">Нет задач</div>
      ) : (
        <div className="space-y-2">
          {tasks.slice().reverse().map((task) => (
            <div key={task.id}
              className="group flex items-center gap-3 p-3 var-surface-2 rounded-xl border var-border hover:border-[var(--border-hover)] transition-all">
              <button onClick={() => toggleTask(task.id)} className="shrink-0 transition-colors">
                {task.done
                  ? <CheckCircle2 size={18} className="text-[var(--accent)]" />
                  : <Circle size={18} className="var-text-faint" />}
              </button>
              <span className={clsx('flex-1 text-sm var-text', task.done && 'line-through var-text-muted')}>
                {task.text}
              </span>
              <button onClick={() => deleteTask(task.id)}
                className="opacity-0 group-hover:opacity-100 p-1 var-text-faint hover:text-red-400 transition-all">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import React, { useState } from 'react'
import { useMiniApps } from '../../appStore'
import { Plus, Trash2, StickyNote } from 'lucide-react'
import clsx from 'clsx'

export function NotesApp() {
  const { notes, addNote, deleteNote } = useMiniApps()
  const [title, setTitle] = useState('')
  const [body, setBody]   = useState('')
  const [writing, setWriting] = useState(false)

  const submit = () => {
    if (!title.trim() && !body.trim()) return
    addNote(title.trim() || body.slice(0, 30), body.trim() || title.trim())
    setTitle(''); setBody(''); setWriting(false)
  }

  return (
    <div className="space-y-4">
      {!writing ? (
        <button onClick={() => setWriting(true)}
          className="w-full flex items-center gap-2 px-4 py-3 var-surface-2 border var-border border-dashed rounded-xl text-sm var-text-muted hover:var-text hover:border-[var(--border-hover)] transition-all">
          <Plus size={15} /><span>Новая заметка</span>
        </button>
      ) : (
        <div className="var-surface-2 border var-border rounded-xl p-4 space-y-3 animate-fade-in">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок"
            className="nexum-input w-full text-sm font-medium" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Текст заметки…"
            rows={4} className="nexum-input w-full text-sm resize-none" />
          <div className="flex gap-2">
            <button onClick={submit} className="flex-1 py-2 bg-[var(--accent)] text-white rounded-lg text-sm hover:opacity-90">Сохранить</button>
            <button onClick={() => setWriting(false)} className="px-4 py-2 var-surface-3 var-text-muted rounded-lg text-sm hover:var-text">Отмена</button>
          </div>
        </div>
      )}

      {notes.length === 0 && !writing ? (
        <div className="text-center py-8 var-text-faint text-sm">Нет заметок</div>
      ) : (
        <div className="space-y-3">
          {notes.slice().reverse().map((note) => (
            <div key={note.id} className="group p-4 var-surface-2 border var-border rounded-xl hover:border-[var(--border-hover)] transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <StickyNote size={13} className="var-text-faint shrink-0 mt-0.5" />
                  <span className="text-sm font-medium var-text truncate">{note.title}</span>
                </div>
                <button onClick={() => deleteNote(note.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 var-text-faint hover:text-red-400 transition-all shrink-0">
                  <Trash2 size={12} />
                </button>
              </div>
              {note.body !== note.title && (
                <p className="text-xs var-text-muted mt-2 leading-relaxed line-clamp-3">{note.body}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

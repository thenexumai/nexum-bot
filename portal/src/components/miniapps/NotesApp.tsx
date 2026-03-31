import React, { useState } from 'react'
import { StickyNote, Plus, Trash2, Pin, PinOff } from 'lucide-react'
import { useMiniApps, patchNote } from '../../appStore'
import { useAppStore } from '../../appStore'
import { t } from '../../i18n'
import clsx from 'clsx'

export function NotesApp() {
  const { notes, addNote, deleteNote } = useMiniApps()
  const { lang } = useAppStore()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)

  const submit = () => {
    if (!title.trim() && !content.trim()) return
    addNote({ title: title || 'Untitled', content, pinned: false, date: new Date().toISOString() })
    setTitle(''); setContent(''); setAdding(false)
  }

  const pinned = notes.filter((n) => n.pinned)
  const unpinned = notes.filter((n) => !n.pinned)
  const sorted = [...pinned, ...unpinned]
  const selectedNote = notes.find((n) => n.id === selected)

  return (
    <div className="flex gap-4 h-full">
      {/* List */}
      <div className="w-48 shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-500/20 flex items-center justify-center">
              <StickyNote size={14} className="text-amber-400" />
            </div>
            <span className="text-sm font-semibold var-text">{t(lang, 'notes')}</span>
          </div>
          <button onClick={() => setAdding(!adding)}
            className="p-1.5 bg-amber-500/15 text-amber-400 rounded-lg hover:bg-amber-500/25 transition-colors">
            <Plus size={14} />
          </button>
        </div>

        {adding && (
          <div className="var-surface-2 border var-border rounded-xl p-3 space-y-2 animate-fade-in">
            <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="Title..." className="w-full bg-transparent var-text text-xs focus:outline-none border-b var-border pb-1" />
            <textarea value={content} onChange={(e) => setContent(e.target.value)}
              placeholder="Content..." rows={3}
              className="w-full bg-transparent var-text text-xs focus:outline-none resize-none" />
            <button onClick={submit}
              className="w-full py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors">
              {t(lang, 'save')}
            </button>
          </div>
        )}

        <div className="space-y-1 max-h-72 overflow-y-auto">
          {sorted.length === 0 && (
            <p className="text-xs var-text-muted text-center py-4">{t(lang, 'no_notes')}</p>
          )}
          {sorted.map((n) => (
            <div key={n.id} onClick={() => setSelected(n.id === selected ? null : n.id)}
              className={clsx('group p-2.5 rounded-xl border cursor-pointer transition-all',
                selected === n.id ? 'var-surface-3 border-[#5b8def]/40' : 'var-surface-2 border-var-border hover:border-var-border-hover')}>
              <div className="flex items-start justify-between gap-1">
                <div className="flex-1 min-w-0">
                  {n.pinned && <Pin size={9} className="text-amber-400 mb-0.5" />}
                  <div className="text-xs font-medium var-text truncate">{n.title}</div>
                  <div className="text-[10px] var-text-muted truncate mt-0.5">{n.content.slice(0, 40)}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteNote(n.id) }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 var-text-muted hover:text-red-400 transition-all shrink-0">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 var-surface-2 border var-border rounded-xl p-4">
        {selectedNote ? (
          <div>
            <h3 className="text-sm font-semibold var-text mb-3">{selectedNote.title}</h3>
            <p className="text-sm var-text-muted whitespace-pre-wrap leading-relaxed">{selectedNote.content || 'No content.'}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <StickyNote size={28} className="var-text-muted opacity-20 mb-2" />
            <p className="text-xs var-text-muted">Select a note to view</p>
          </div>
        )}
      </div>
    </div>
  )
}

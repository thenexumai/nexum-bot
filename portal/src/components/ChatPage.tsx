import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Search, Code2, Bot, Globe, Paperclip, Mic, Copy, ThumbsUp, ThumbsDown, ChevronDown, Zap } from 'lucide-react'
import { useStore }    from '../store'
import { useAppStore, useMiniApps } from '../appStore'
import { sendChat }   from '../api'
import { t }          from '../i18n'
import type { ChatMode, Source } from '../types'
import clsx from 'clsx'

const MODES: { id: ChatMode; labelKey: string; icon: React.ReactNode }[] = [
  { id: 'chat',   labelKey: 'chat',   icon: <Bot size={14} /> },
  { id: 'search', labelKey: 'search_web', icon: <Globe size={14} /> },
  { id: 'code',   labelKey: 'write_code', icon: <Code2 size={14} /> },
  { id: 'agent',  labelKey: 'mini_apps',  icon: <Zap size={14} /> },
]

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useStore()
  const { lang } = useAppStore()
  const { detectAndSave } = useMiniApps()
  const { conversations, activeConvId, setActiveConv, newConversation,
          addMessage, updateMessage, updateConvTitle, mode, setMode, isLoading, setLoading } = store

  const [input, setInput]     = useState('')
  const [modeOpen, setModeOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const modeRef     = useRef<HTMLDivElement>(null)

  useEffect(() => { if (id && id !== activeConvId) setActiveConv(id) }, [id])

  const conv = conversations.find((c) => c.id === (id ?? activeConvId))
  const messages = conv?.messages ?? []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) },
    [messages.length, messages[messages.length - 1]?.content])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [input])

  useEffect(() => {
    const h = (e: MouseEvent) => { if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const submit = useCallback(async (text?: string) => {
    const query = (text ?? input).trim()
    if (!query || isLoading) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    let convId = id ?? activeConvId
    if (!convId || !conversations.find((c) => c.id === convId)) {
      convId = newConversation()
      navigate(`/chat/${convId}`, { replace: true })
    }

    addMessage(convId, { role: 'user', content: query })
    updateConvTitle(convId, query.slice(0, 60))
    const assistantId = addMessage(convId, { role: 'assistant', content: '', isStreaming: true })
    setLoading(true)

    // Detect AI context BEFORE API call (user message)
    detectAndSave(query, lang)

    try {
      const conv2 = conversations.find((c) => c.id === convId)
      const history = (conv2?.messages ?? []).filter((m) => !m.isStreaming).slice(-20).map((m) => ({ role: m.role, content: m.content }))
      history.push({ role: 'user', content: query })

      // Inject language instruction into system context
      const langInstr = lang === 'ru' ? 'Отвечай ТОЛЬКО на русском языке.' : lang === 'uz' ? 'Faqat o\'zbek tilida javob ber.' : 'Respond in English.'
      history.unshift({ role: 'system', content: `You are NEXUM, a powerful AI assistant. ${langInstr} Be concise and helpful. Format with markdown when appropriate.` })

      const res = await sendChat(history, mode)
      updateMessage(convId, assistantId, { content: res.content, sources: res.sources, tool_used: res.tool_used, isStreaming: false })

      // Detect context from AI response too
      detectAndSave(res.content, lang)
    } catch (err: any) {
      updateMessage(convId, assistantId, { content: `**Error:** ${err.message || 'Backend offline.'}`, isStreaming: false })
    } finally {
      setLoading(false)
    }
  }, [input, id, activeConvId, conversations, mode, isLoading, lang])

  const copyMsg = (content: string, msgId: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(msgId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]

  const SUGGESTED = [
    { icon: '🔍', titleKey: 'search_web',  subKey: 'search_web_sub' },
    { icon: '💻', titleKey: 'write_code',  subKey: 'write_code_sub' },
    { icon: '📊', titleKey: 'analyze',     subKey: 'analyze_sub' },
    { icon: '🧠', titleKey: 'reasoning',   subKey: 'reasoning_sub' },
  ]

  return (
    <div className="flex flex-col h-full var-bg">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeScreen suggested={SUGGESTED} onPrompt={submit} lang={lang} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg}
                onCopy={() => copyMsg(msg.content, msg.id)}
                copied={copiedId === msg.id}
                copiedLabel={t(lang, 'copied')} />
            ))}
            {isLoading && <ThinkingIndicator label={t(lang, 'thinking')} />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t var-border var-bg px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative var-surface border var-border rounded-xl focus-within:border-[var(--border-hover)] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder={t(lang, 'ask_anything')}
              rows={1}
              className="w-full bg-transparent var-text placeholder-[var(--text-faint)] text-sm px-4 pt-4 pb-2 resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: 52, maxHeight: 200 }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-1">
                {/* Mode selector */}
                <div ref={modeRef} className="relative">
                  <button onClick={() => setModeOpen(!modeOpen)}
                    className={clsx('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      mode !== 'chat' ? 'bg-[var(--accent)]/15 text-[var(--accent)] border border-[var(--accent)]/20' : 'var-text-muted hover:var-text hover:var-surface-3')}>
                    {activeMode.icon}
                    <span>{t(lang, activeMode.labelKey)}</span>
                    <ChevronDown size={11} className={clsx('transition-transform', modeOpen && 'rotate-180')} />
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full mb-2 left-0 var-surface border var-border rounded-xl shadow-xl w-48 py-1 z-50 animate-fade-in">
                      {MODES.map((m) => (
                        <button key={m.id} onClick={() => { setMode(m.id); setModeOpen(false) }}
                          className={clsx('w-full flex items-center gap-2 px-3 py-2.5 text-xs transition-colors',
                            mode === m.id ? 'text-[var(--accent)] var-surface-3' : 'var-text-muted hover:var-text hover:var-surface-2')}>
                          {m.icon}<span>{t(lang, m.labelKey)}</span>
                          {mode === m.id && <span className="ml-auto">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="p-1.5 var-text-faint hover:var-text-muted rounded-lg hover:var-surface-3 transition-colors"><Paperclip size={15} /></button>
                <button className="p-1.5 var-text-faint hover:var-text-muted rounded-lg hover:var-surface-3 transition-colors"><Mic size={15} /></button>
              </div>
              <button onClick={() => submit()} disabled={!input.trim() || isLoading}
                className={clsx('flex items-center justify-center w-8 h-8 rounded-lg transition-all',
                  input.trim() && !isLoading ? 'bg-[var(--accent)] text-white hover:opacity-90' : 'var-surface-3 var-text-faint cursor-not-allowed')}>
                {isLoading
                  ? <div className="w-3 h-3 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
                  : <Send size={14} />}
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] var-text-faint mt-2">{t(lang, 'disclaimer')}</p>
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({ suggested, onPrompt, lang }: { suggested: any[]; onPrompt: (s: string) => void; lang: any }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-16 animate-fade-in">
      <svg width="40" height="40" viewBox="0 0 100 100" fill="none" className="mb-6">
        <path d="M18 82L50 18L82 82M32 60L68 60" stroke="var(--accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <h1 className="text-2xl font-semibold var-text mb-2">{t(lang, 'welcome_title')}</h1>
      <p className="var-text-muted text-sm mb-10">{t(lang, 'welcome_sub')}</p>
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {suggested.map((s) => (
          <button key={s.titleKey} onClick={() => onPrompt(t(lang, s.titleKey))}
            className="flex items-start gap-3 p-4 var-surface border var-border rounded-xl text-left hover:var-surface-2 hover:border-[var(--border-hover)] transition-all group">
            <span className="text-xl">{s.icon}</span>
            <div>
              <div className="text-sm font-medium var-text-muted group-hover:var-text transition-colors">{t(lang, s.titleKey)}</div>
              <div className="text-xs var-text-faint mt-0.5">{t(lang, s.subKey)}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ msg, onCopy, copied, copiedLabel }: { msg: any; onCopy: () => void; copied: boolean; copiedLabel: string }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('group animate-fade-in', isUser ? 'flex justify-end' : 'flex flex-col')}>
      {isUser ? (
        <div className="max-w-[75%] var-surface border var-border rounded-2xl rounded-tr-sm px-4 py-3 text-sm var-text leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
      ) : (
        <div className="space-y-3">
          {msg.sources?.length > 0 && <SourcesBar sources={msg.sources} />}
          {msg.tool_used && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--accent)]">
              <Search size={12} /><span>Used: {msg.tool_used}</span>
            </div>
          )}
          <div className="prose-nexum">
            {msg.isStreaming && !msg.content ? <ThinkingDots /> : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            )}
          </div>
          {!msg.isStreaming && msg.content && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionBtn onClick={onCopy} title="Copy">
                {copied ? <span className="text-[10px] text-green-400 font-medium">{copiedLabel}</span> : <Copy size={13} />}
              </ActionBtn>
              <ActionBtn title="Good"><ThumbsUp size={13} /></ActionBtn>
              <ActionBtn title="Bad"><ThumbsDown size={13} /></ActionBtn>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SourcesBar({ sources }: { sources: Source[] }) {
  const [exp, setExp] = useState(false)
  const visible = exp ? sources : sources.slice(0, 3)
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {visible.map((s, i) => {
        let hostname = ''
        try { hostname = new URL(s.url).hostname } catch {}
        return (
          <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
            className="source-card flex items-center gap-1.5 px-2.5 py-1.5 var-surface border var-border rounded-lg text-xs var-text-muted hover:var-text max-w-[180px] truncate">
            {hostname && <img src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=16`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />}
            <span className="truncate">{s.title || hostname}</span>
          </a>
        )
      })}
      {sources.length > 3 && (
        <button onClick={() => setExp(!exp)} className="text-xs text-[var(--accent)] hover:opacity-80 px-2">
          {exp ? 'less' : `+${sources.length - 3}`}
        </button>
      )}
    </div>
  )
}

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm var-text-muted animate-fade-in">
      <div className="flex gap-1">
        {[0, 150, 300].map((d) => (
          <span key={d} className="w-1.5 h-1.5 bg-[var(--accent)] rounded-full dot-bounce" style={{ animationDelay: `${d}ms` }} />
        ))}
      </div>
      <span>{label}</span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 py-2">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-2 h-2 bg-[var(--accent)] rounded-full dot-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </div>
  )
}

function ActionBtn({ onClick, title, children }: any) {
  return (
    <button onClick={onClick} title={title}
      className="p-1.5 var-text-faint hover:var-text-muted hover:var-surface-3 rounded-md transition-colors">
      {children}
    </button>
  )
}

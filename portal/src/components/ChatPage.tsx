import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Send, Search, Code2, Bot, Globe, Paperclip, Mic, Copy, ThumbsUp, ThumbsDown, RefreshCw, ChevronDown, Zap } from 'lucide-react'
import { useStore } from '../store'
import { sendChat } from '../api'
import type { ChatMode, Source } from '../types'
import clsx from 'clsx'

const SUGGESTED = [
  { icon: '🔍', title: 'Search the web', sub: 'Real-time answers with sources' },
  { icon: '💻', title: 'Write & debug code', sub: 'Any language, any framework' },
  { icon: '📊', title: 'Analyze & summarize', sub: 'Documents, data, ideas' },
  { icon: '🧠', title: 'Deep reasoning', sub: 'Complex problems & planning' },
]

const MODES: { id: ChatMode; label: string; icon: React.ReactNode }[] = [
  { id: 'chat',   label: 'Chat',   icon: <Bot size={14} /> },
  { id: 'search', label: 'Search', icon: <Globe size={14} /> },
  { id: 'code',   label: 'Code',   icon: <Code2 size={14} /> },
  { id: 'agent',  label: 'Agent',  icon: <Zap size={14} /> },
]

export function ChatPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const store = useStore()
  const { conversations, activeConvId, setActiveConv, newConversation,
          addMessage, updateMessage, updateConvTitle, mode, setMode, isLoading, setLoading } = store

  const [input, setInput] = useState('')
  const [modeOpen, setModeOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (id && id !== activeConvId) setActiveConv(id) }, [id])

  const conv = conversations.find((c) => c.id === (id ?? activeConvId))
  const messages = conv?.messages ?? []

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages.length, messages[messages.length - 1]?.content])

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

    try {
      const conv2 = conversations.find((c) => c.id === convId)
      const history = (conv2?.messages ?? []).filter((m) => !m.isStreaming).slice(-20).map((m) => ({ role: m.role, content: m.content }))
      history.push({ role: 'user', content: query })
      const res = await sendChat(history, mode)
      updateMessage(convId, assistantId, { content: res.content, sources: res.sources, tool_used: res.tool_used, isStreaming: false })
    } catch (err: any) {
      updateMessage(convId, assistantId, { content: `**Error:** ${err.message || 'Backend offline.'}`, isStreaming: false })
    } finally {
      setLoading(false)
    }
  }, [input, id, activeConvId, conversations, mode, isLoading])

  const copyMsg = (content: string, msgId: string) => {
    navigator.clipboard.writeText(content)
    setCopiedId(msgId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0]

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a]">
      <div className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <WelcomeScreen onPrompt={submit} />
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg} onCopy={() => copyMsg(msg.content, msg.id)} copied={copiedId === msg.id} />
            ))}
            {isLoading && <ThinkingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="border-t border-[#1e1e1e] bg-[#0a0a0a] px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-[#111] border border-[#2a2a2a] rounded-xl focus-within:border-[#3a3a3a] transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }}
              placeholder="Ask anything..."
              rows={1}
              className="w-full bg-transparent text-[#eee] placeholder-[#444] text-sm px-4 pt-4 pb-2 resize-none focus:outline-none leading-relaxed"
              style={{ minHeight: 52, maxHeight: 200 }}
            />
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <div className="flex items-center gap-1">
                <div ref={modeRef} className="relative">
                  <button
                    onClick={() => setModeOpen(!modeOpen)}
                    className={clsx(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      mode !== 'chat' ? 'bg-[#5b8def]/15 text-[#5b8def] border border-[#5b8def]/20' : 'text-[#555] hover:text-[#888] hover:bg-[#1a1a1a]'
                    )}
                  >
                    {activeMode.icon}<span>{activeMode.label}</span>
                    <ChevronDown size={11} className={clsx('transition-transform', modeOpen && 'rotate-180')} />
                  </button>
                  {modeOpen && (
                    <div className="absolute bottom-full mb-2 left-0 bg-[#161616] border border-[#2a2a2a] rounded-xl shadow-xl w-44 py-1 z-50 animate-fade-in">
                      {MODES.map((m) => (
                        <button key={m.id} onClick={() => { setMode(m.id); setModeOpen(false) }}
                          className={clsx('w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors', mode === m.id ? 'text-[#5b8def] bg-[#1e2a3a]' : 'text-[#666] hover:text-[#ccc] hover:bg-[#1a1a1a]')}>
                          {m.icon}<span>{m.label}</span>{mode === m.id && <span className="ml-auto">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className="p-1.5 text-[#444] hover:text-[#666] rounded-lg hover:bg-[#1a1a1a] transition-colors"><Paperclip size={15} /></button>
                <button className="p-1.5 text-[#444] hover:text-[#666] rounded-lg hover:bg-[#1a1a1a] transition-colors"><Mic size={15} /></button>
              </div>
              <button onClick={() => submit()} disabled={!input.trim() || isLoading}
                className={clsx('flex items-center justify-center w-8 h-8 rounded-lg transition-all', input.trim() && !isLoading ? 'bg-[#5b8def] text-white hover:bg-[#4a7de0]' : 'bg-[#1a1a1a] text-[#444] cursor-not-allowed')}>
                {isLoading ? <div className="w-3 h-3 border-2 border-[#5b8def]/30 border-t-[#5b8def] rounded-full animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </div>
          <p className="text-center text-[10px] text-[#333] mt-2">NEXUM can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  )
}

function WelcomeScreen({ onPrompt }: { onPrompt: (t: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-16 animate-fade-in">
      <svg width="40" height="40" viewBox="0 0 100 100" fill="none" className="mb-6">
        <path d="M18 82L50 18L82 82M32 60L68 60" stroke="#5b8def" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      <h1 className="text-2xl font-semibold text-[#eee] mb-2">What can I help with?</h1>
      <p className="text-[#555] text-sm mb-10">Powered by NEXUM Intelligence Engine</p>
      <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
        {SUGGESTED.map((s) => (
          <button key={s.title} onClick={() => onPrompt(s.title)}
            className="flex items-start gap-3 p-4 bg-[#111] border border-[#1e1e1e] rounded-xl text-left hover:bg-[#161616] hover:border-[#2a2a2a] transition-all group">
            <span className="text-xl">{s.icon}</span>
            <div>
              <div className="text-sm font-medium text-[#ccc] group-hover:text-[#eee] transition-colors">{s.title}</div>
              <div className="text-xs text-[#444] mt-0.5">{s.sub}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({ msg, onCopy, copied }: { msg: any; onCopy: () => void; copied: boolean }) {
  const isUser = msg.role === 'user'
  return (
    <div className={clsx('group animate-fade-in', isUser ? 'flex justify-end' : 'flex flex-col')}>
      {isUser ? (
        <div className="max-w-[75%] bg-[#161616] border border-[#2a2a2a] rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-[#eee] leading-relaxed whitespace-pre-wrap">{msg.content}</div>
      ) : (
        <div className="space-y-3">
          {msg.sources?.length > 0 && <SourcesBar sources={msg.sources} />}
          {msg.tool_used && (
            <div className="flex items-center gap-1.5 text-xs text-[#5b8def]">
              <Search size={12} /><span>Used: {msg.tool_used}</span>
            </div>
          )}
          <div className={clsx('prose-nexum', msg.isStreaming && !msg.content && 'cursor-blink')}>
            {msg.isStreaming && !msg.content ? <ThinkingDots /> : (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            )}
          </div>
          {!msg.isStreaming && msg.content && (
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ActionBtn onClick={onCopy} title="Copy">
                {copied ? <span className="text-[10px] text-[#22c55e] font-medium">Copied!</span> : <Copy size={13} />}
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
      {visible.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer"
          className="source-card flex items-center gap-1.5 px-2.5 py-1.5 bg-[#111] border border-[#2a2a2a] rounded-lg text-xs text-[#777] hover:text-[#ccc] max-w-[180px] truncate">
          <img src={`https://www.google.com/s2/favicons?domain=${new URL(s.url).hostname}&sz=16`} alt="" width={12} height={12} className="rounded-sm shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display='none' }} />
          <span className="truncate">{s.title || new URL(s.url).hostname}</span>
        </a>
      ))}
      {sources.length > 3 && (
        <button onClick={() => setExp(!exp)} className="text-xs text-[#5b8def] hover:text-[#4a7de0] px-2">
          {exp ? 'less' : `+${sources.length - 3}`}
        </button>
      )}
    </div>
  )
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2 text-sm text-[#555] animate-fade-in">
      <div className="flex gap-1">
        {[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 bg-[#5b8def] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
      </div>
      <span>NEXUM is thinking...</span>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div className="flex gap-1 py-2">
      {[0, 150, 300].map((d) => <span key={d} className="w-2 h-2 bg-[#5b8def] rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
    </div>
  )
}

function ActionBtn({ onClick, title, children }: any) {
  return (
    <button onClick={onClick} title={title} className="p-1.5 text-[#444] hover:text-[#888] hover:bg-[#1a1a1a] rounded-md transition-colors">{children}</button>
  )
}

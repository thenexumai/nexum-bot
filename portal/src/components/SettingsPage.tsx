import React, { useState } from 'react'
import { User, Palette, Globe, Cpu, Key, Bell, Shield, ChevronRight } from 'lucide-react'
import { useAppStore } from '../appStore'
import { LANGUAGES, t } from '../i18n'
import clsx from 'clsx'

const SECTIONS = [
  { id: 'profile',  icon: User,     labelKey: 'profile' },
  { id: 'theme',    icon: Palette,  labelKey: 'appearance' },
  { id: 'language', icon: Globe,    labelKey: 'language' },
  { id: 'models',   icon: Cpu,      labelKey: 'models' },
  { id: 'api',      icon: Key,      labelKey: 'api_keys' },
  { id: 'privacy',  icon: Shield,   labelKey: 'privacy' },
]

const MODELS = [
  { id: 'nexum-turbo',  label: 'NEXUM Turbo',  badge: 'Fast',  desc: 'Быстрый и умный' },
  { id: 'nexum-pro',    label: 'NEXUM Pro',    badge: 'Best',  desc: 'Лучшая точность' },
  { id: 'nexum-vision', label: 'NEXUM Vision', badge: 'New',   desc: 'Работает с изображениями' },
  { id: 'nexum-code',   label: 'NEXUM Code',   badge: 'Code',  desc: 'Специализация на коде' },
]

export function SettingsPage() {
  const { lang, setLang, theme, setTheme, model, setModel } = useAppStore()
  const [active, setActive] = useState('profile')
  const [name, setName]     = useState('Timur')
  const [email, setEmail]   = useState('timur@nexumai.uz')
  const [saved, setSaved]   = useState(false)

  const saveProfile = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div className="flex h-full var-bg">
      {/* Left nav */}
      <aside className="w-[220px] shrink-0 border-r var-border var-surface px-2 py-6 space-y-0.5">
        <p className="px-3 mb-3 text-[10px] uppercase tracking-widest var-text-faint font-medium">{t(lang, 'settings')}</p>
        {SECTIONS.map(({ id, icon: Icon, labelKey }) => (
          <button key={id} onClick={() => setActive(id)}
            className={clsx('w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              active === id ? 'var-surface-3 var-text font-medium' : 'var-text-muted hover:var-text hover:var-surface-2')}>
            <Icon size={15} />
            <span>{t(lang, labelKey)}</span>
            {active === id && <ChevronRight size={13} className="ml-auto" />}
          </button>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Profile */}
        {active === 'profile' && (
          <Section title={t(lang, 'profile')}>
            <Field label={t(lang, 'name')}>
              <input value={name} onChange={(e) => setName(e.target.value)} className="nexum-input" />
            </Field>
            <Field label={t(lang, 'email')}>
              <input value={email} onChange={(e) => setEmail(e.target.value)} className="nexum-input" />
            </Field>
            <button onClick={saveProfile}
              className={clsx('px-5 py-2 rounded-lg text-sm font-medium transition-colors',
                saved ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-[var(--accent)] text-white hover:opacity-90')}>
              {saved ? '✓ ' + t(lang, 'saved') : t(lang, 'save')}
            </button>
          </Section>
        )}

        {/* Appearance */}
        {active === 'theme' && (
          <Section title={t(lang, 'appearance')}>
            <Field label={t(lang, 'theme')}>
              <div className="flex gap-3">
                {(['dark', 'light', 'system'] as const).map((th) => (
                  <button key={th} onClick={() => setTheme(th)}
                    className={clsx('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm border transition-all',
                      theme === th ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : 'var-border var-text-muted hover:var-text')}>
                    <span>{th === 'dark' ? '🌙' : th === 'light' ? '☀️' : '🖥️'}</span>
                    <span className="capitalize">{t(lang, th)}</span>
                  </button>
                ))}
              </div>
            </Field>
          </Section>
        )}

        {/* Language */}
        {active === 'language' && (
          <Section title={t(lang, 'language')}>
            <div className="grid grid-cols-2 gap-3">
              {LANGUAGES.map((l) => (
                <button key={l.id} onClick={() => setLang(l.id)}
                  className={clsx('flex items-center gap-3 p-4 rounded-xl border text-sm transition-all',
                    lang === l.id ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'var-border var-surface var-text-muted hover:var-text hover:var-surface-2')}>
                  <span className="text-2xl">{l.flag}</span>
                  <div className="text-left">
                    <div className="font-medium">{l.label}</div>
                    <div className="text-xs var-text-faint">{l.native}</div>
                  </div>
                  {lang === l.id && <span className="ml-auto text-[var(--accent)]">✓</span>}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Models */}
        {active === 'models' && (
          <Section title={t(lang, 'models')}>
            <div className="space-y-3">
              {MODELS.map((m) => (
                <button key={m.id} onClick={() => setModel(m.id)}
                  className={clsx('w-full flex items-center gap-4 p-4 rounded-xl border text-left transition-all',
                    model === m.id ? 'border-[var(--accent)] bg-[var(--accent)]/8' : 'var-border var-surface-2 hover:var-surface-3')}>
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 border border-[var(--accent)]/20 flex items-center justify-center">
                    <Cpu size={16} className="text-[var(--accent)]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium var-text">{m.label}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--accent)]/15 text-[var(--accent)] font-medium">{m.badge}</span>
                    </div>
                    <div className="text-xs var-text-muted mt-0.5">{m.desc}</div>
                  </div>
                  {model === m.id && (
                    <div className="w-2 h-2 rounded-full bg-[var(--accent)]" />
                  )}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* API Keys */}
        {active === 'api' && (
          <Section title={t(lang, 'api_keys')}>
            {['OpenAI', 'Anthropic', 'Gemini', 'Perplexity'].map((provider) => (
              <Field key={provider} label={`${provider} API Key`}>
                <input type="password" placeholder="sk-..." className="nexum-input" />
              </Field>
            ))}
            <button className="px-5 py-2 bg-[var(--accent)] text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity">
              {t(lang, 'save')}
            </button>
          </Section>
        )}

        {/* Privacy */}
        {active === 'privacy' && (
          <Section title={t(lang, 'privacy')}>
            <Toggle label={t(lang, 'save_history')} defaultChecked />
            <Toggle label={t(lang, 'share_data')} />
            <Toggle label={t(lang, 'analytics')} defaultChecked />
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-xl animate-fade-in">
      <h2 className="text-lg font-semibold var-text mb-6">{title}</h2>
      <div className="space-y-5">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium var-text-muted mb-1.5 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

function Toggle({ label, defaultChecked = false }: { label: string; defaultChecked?: boolean }) {
  const [on, setOn] = useState(defaultChecked)
  return (
    <div className="flex items-center justify-between py-3 border-b var-border">
      <span className="text-sm var-text">{label}</span>
      <button onClick={() => setOn(!on)}
        className={clsx('w-11 h-6 rounded-full transition-colors', on ? 'bg-[var(--accent)]' : 'var-surface-3')}>
        <div className={clsx('w-4 h-4 bg-white rounded-full mx-1 transition-transform', on && 'translate-x-5')} />
      </button>
    </div>
  )
}

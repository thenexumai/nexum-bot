import React, { useState } from 'react'
import { User, Bell, Palette, Globe, Shield, ChevronRight, Moon, Sun, Monitor, Check } from 'lucide-react'
import clsx from 'clsx'

const SECTIONS = [
  { id: 'profile',       icon: <User size={16} />,    label: 'Profile' },
  { id: 'appearance',    icon: <Palette size={16} />,  label: 'Appearance' },
  { id: 'notifications', icon: <Bell size={16} />,     label: 'Notifications' },
  { id: 'language',      icon: <Globe size={16} />,    label: 'Language & Region' },
  { id: 'privacy',       icon: <Shield size={16} />,   label: 'Privacy' },
]

const LANGUAGES = ['English', 'Русский', 'O'zbekcha', 'العربية', '中文', 'Español']
const THEMES = ['dark', 'light', 'system'] as const

export function SettingsPage() {
  const [active, setActive] = useState('profile')
  const [theme, setTheme] = useState<typeof THEMES[number]>('dark')
  const [lang, setLang] = useState('Русский')
  const [name, setName] = useState('Timur')
  const [email, setEmail] = useState('')
  const [notifs, setNotifs] = useState({ updates: true, tips: false, weekly: true })

  return (
    <div className="flex h-full bg-[#0a0a0a] overflow-hidden">
      {/* Settings sidebar */}
      <div className="w-56 shrink-0 border-r border-[#1e1e1e] py-8 px-3">
        <h2 className="text-xs font-semibold text-[#444] uppercase tracking-widest px-3 mb-4">Settings</h2>
        <nav className="space-y-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left',
                active === s.id ? 'bg-[#161616] text-[#eee]' : 'text-[#666] hover:text-[#aaa] hover:bg-[#111]'
              )}
            >
              {s.icon}<span>{s.label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Settings content */}
      <div className="flex-1 overflow-y-auto px-8 py-8">
        <div className="max-w-xl">
          {/* Profile */}
          {active === 'profile' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#eee] mb-1">Profile</h2>
                <p className="text-xs text-[#555]">Your personal information</p>
              </div>
              <SettingCard>
                <div className="space-y-4">
                  <Field label="Display name">
                    <input value={name} onChange={(e) => setName(e.target.value)}
                      className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#eee] focus:outline-none focus:border-[#5b8def]/50 transition-colors" />
                  </Field>
                  <Field label="Email">
                    <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com"
                      className="w-full bg-[#161616] border border-[#2a2a2a] rounded-lg px-3 py-2 text-sm text-[#eee] placeholder-[#444] focus:outline-none focus:border-[#5b8def]/50 transition-colors" />
                  </Field>
                </div>
              </SettingCard>
              <SettingCard>
                <div className="space-y-3">
                  <div className="text-xs font-medium text-[#888] uppercase tracking-wider">Plan</div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-[#eee]">NEXUM Free</div>
                      <div className="text-xs text-[#555] mt-0.5">30 messages per day</div>
                    </div>
                    <button className="px-3 py-1.5 bg-[#5b8def] text-white text-xs font-medium rounded-lg hover:bg-[#4a7de0] transition-colors">Upgrade</button>
                  </div>
                </div>
              </SettingCard>
            </div>
          )}

          {/* Appearance */}
          {active === 'appearance' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#eee] mb-1">Appearance</h2>
                <p className="text-xs text-[#555]">Customize how NEXUM looks</p>
              </div>
              <SettingCard>
                <div>
                  <div className="text-xs font-medium text-[#888] uppercase tracking-wider mb-3">Theme</div>
                  <div className="grid grid-cols-3 gap-2">
                    {THEMES.map((t) => {
                      const icons = { dark: <Moon size={16} />, light: <Sun size={16} />, system: <Monitor size={16} /> }
                      return (
                        <button
                          key={t}
                          onClick={() => setTheme(t)}
                          className={clsx(
                            'flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-xs capitalize',
                            theme === t ? 'border-[#5b8def] bg-[#5b8def]/10 text-[#5b8def]' : 'border-[#2a2a2a] text-[#666] hover:border-[#3a3a3a] hover:text-[#aaa]'
                          )}
                        >
                          {icons[t]}{t}
                          {theme === t && <Check size={10} className="text-[#5b8def]" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </SettingCard>
            </div>
          )}

          {/* Notifications */}
          {active === 'notifications' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#eee] mb-1">Notifications</h2>
                <p className="text-xs text-[#555]">Control what you receive</p>
              </div>
              <SettingCard>
                <div className="space-y-4">
                  {(Object.entries(notifs) as [keyof typeof notifs, boolean][]).map(([k, v]) => (
                    <div key={k} className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-[#ccc] capitalize">{k === 'updates' ? 'Product updates' : k === 'tips' ? 'Tips & tricks' : 'Weekly digest'}</div>
                        <div className="text-xs text-[#555] mt-0.5">{k === 'updates' ? 'New features and improvements' : k === 'tips' ? 'How to get more from NEXUM' : 'Summary of your usage'}</div>
                      </div>
                      <button onClick={() => setNotifs({ ...notifs, [k]: !v })}
                        className={clsx('w-10 h-6 rounded-full transition-colors relative', v ? 'bg-[#5b8def]' : 'bg-[#2a2a2a]')}>
                        <span className={clsx('absolute top-1 w-4 h-4 bg-white rounded-full transition-all shadow-sm', v ? 'left-5' : 'left-1')} />
                      </button>
                    </div>
                  ))}
                </div>
              </SettingCard>
            </div>
          )}

          {/* Language */}
          {active === 'language' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#eee] mb-1">Language & Region</h2>
                <p className="text-xs text-[#555]">Choose your preferred language</p>
              </div>
              <SettingCard>
                <div className="space-y-1">
                  {LANGUAGES.map((l) => (
                    <button key={l} onClick={() => setLang(l)}
                      className={clsx('w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm transition-colors', lang === l ? 'bg-[#1e2a3a] text-[#5b8def]' : 'text-[#888] hover:text-[#ccc] hover:bg-[#161616]')}>
                      <span>{l}</span>
                      {lang === l && <Check size={14} />}
                    </button>
                  ))}
                </div>
              </SettingCard>
            </div>
          )}

          {/* Privacy */}
          {active === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-base font-semibold text-[#eee] mb-1">Privacy</h2>
                <p className="text-xs text-[#555]">Control your data</p>
              </div>
              <SettingCard>
                <div className="space-y-3">
                  <InfoRow label="Data storage" value="Local only — nothing sent to servers" />
                  <InfoRow label="Chat history" value="Stored in browser memory" />
                  <InfoRow label="Analytics" value="Disabled" />
                </div>
              </SettingCard>
              <SettingCard>
                <button className="text-sm text-[#ef4444] hover:text-[#dc2626] transition-colors">Delete all conversations</button>
              </SettingCard>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingCard({ children }: { children: React.ReactNode }) {
  return <div className="bg-[#111] border border-[#1e1e1e] rounded-xl p-4">{children}</div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[#666] font-medium">{label}</label>
      {children}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[#666]">{label}</span>
      <span className="text-[#888]">{value}</span>
    </div>
  )
}

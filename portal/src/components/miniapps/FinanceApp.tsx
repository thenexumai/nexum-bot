import React, { useState } from 'react'
import { Wallet, TrendingUp, TrendingDown, Plus, Trash2, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { useMiniApps } from '../../appStore'
import { useAppStore } from '../../appStore'
import { t } from '../../i18n'
import clsx from 'clsx'

const CATEGORIES = ['Salary', 'Freelance', 'Food', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Other']

export function FinanceApp() {
  const { finances, addFinance, deleteFinance } = useMiniApps()
  const { lang } = useAppStore()
  const [type, setType] = useState<'income'|'expense'>('income')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Salary')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  const totalIncome  = finances.filter((f) => f.type === 'income').reduce((s, f) => s + f.amount, 0)
  const totalExpense = finances.filter((f) => f.type === 'expense').reduce((s, f) => s + f.amount, 0)
  const balance = totalIncome - totalExpense

  const fmt = (n: number) => new Intl.NumberFormat('uz-UZ').format(n)

  const submit = () => {
    const amt = parseInt(amount.replace(/[^0-9]/g, ''))
    if (!amt) return
    addFinance({ type, amount: amt, currency: 'UZS', category, note, date: new Date().toISOString().split('T')[0] })
    setAmount(''); setNote(''); setAdding(false)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-green-500/15 border border-green-500/20 flex items-center justify-center">
            <Wallet size={16} className="text-green-400" />
          </div>
          <h2 className="text-sm font-semibold var-text">{t(lang, 'finance')}</h2>
        </div>
        <button onClick={() => setAdding(!adding)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors">
          <Plus size={13} />{t(lang, 'add_income')}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label={t(lang, 'balance')} value={fmt(balance)} suffix="UZS"
          color={balance >= 0 ? 'text-[#5b8def]' : 'text-red-400'}
          icon={<Wallet size={14} />} bg="bg-[#5b8def]/10" />
        <StatCard label={t(lang, 'income')} value={fmt(totalIncome)} suffix="UZS"
          color="text-green-400" icon={<TrendingUp size={14} />} bg="bg-green-500/10" />
        <StatCard label={t(lang, 'expense')} value={fmt(totalExpense)} suffix="UZS"
          color="text-red-400" icon={<TrendingDown size={14} />} bg="bg-red-500/10" />
      </div>

      {/* Add form */}
      {adding && (
        <div className="var-surface-2 border var-border rounded-xl p-3 space-y-3 animate-fade-in">
          <div className="flex gap-2">
            {(['income', 'expense'] as const).map((tp) => (
              <button key={tp} onClick={() => setType(tp)}
                className={clsx('flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium border transition-all',
                  type === tp
                    ? tp === 'income' ? 'bg-green-500/15 text-green-400 border-green-500/30' : 'bg-red-500/15 text-red-400 border-red-500/30'
                    : 'var-surface border-var-border var-text-muted')}>
                {tp === 'income' ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                {t(lang, tp === 'income' ? 'income' : 'expense')}
              </button>
            ))}
          </div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount (UZS)"
            className="w-full bg-transparent var-text text-sm placeholder-var-muted focus:outline-none border-b var-border pb-2" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="w-full bg-transparent var-text text-sm focus:outline-none border-b var-border pb-2">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)"
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            className="w-full bg-transparent var-text text-sm placeholder-var-muted focus:outline-none" />
          <button onClick={submit}
            className="w-full py-2 bg-[#5b8def] text-white rounded-lg text-xs font-medium hover:bg-[#4a7de0] transition-colors">
            {t(lang, 'save')}
          </button>
        </div>
      )}

      {/* Transaction list */}
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {finances.slice(0, 20).map((f) => (
          <div key={f.id} className="group flex items-center gap-3 p-3 var-surface-2 border var-border rounded-xl">
            <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center shrink-0', f.type === 'income' ? 'bg-green-500/15' : 'bg-red-500/15')}>
              {f.type === 'income' ? <ArrowUpRight size={14} className="text-green-400" /> : <ArrowDownRight size={14} className="text-red-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium var-text truncate">{f.category}</div>
              {f.note && <div className="text-xs var-text-muted truncate">{f.note}</div>}
            </div>
            <div className={clsx('text-xs font-semibold', f.type === 'income' ? 'text-green-400' : 'text-red-400')}>
              {f.type === 'income' ? '+' : '-'}{new Intl.NumberFormat('uz-UZ').format(f.amount)}
            </div>
            <button onClick={() => deleteFinance(f.id)}
              className="opacity-0 group-hover:opacity-100 p-1 var-text-muted hover:text-red-400 transition-all">
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatCard({ label, value, suffix, color, icon, bg }: any) {
  return (
    <div className="var-surface-2 border var-border rounded-xl p-3">
      <div className={clsx('w-6 h-6 rounded-md flex items-center justify-center mb-2', bg, color)}>{icon}</div>
      <div className={clsx('text-sm font-bold', color)}>{value}</div>
      <div className="text-[10px] var-text-muted mt-0.5">{suffix}</div>
      <div className="text-[10px] var-text-muted">{label}</div>
    </div>
  )
}

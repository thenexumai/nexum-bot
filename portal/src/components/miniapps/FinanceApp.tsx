import React, { useState } from 'react'
import { useMiniApps } from '../../appStore'
import { Plus, TrendingUp, TrendingDown } from 'lucide-react'
import clsx from 'clsx'

export function FinanceApp() {
  const { transactions, addTransaction } = useMiniApps()
  const [label, setLabel]   = useState('')
  const [amount, setAmount] = useState('')
  const [type, setType]     = useState<'income' | 'expense'>('expense')

  const balance = transactions.reduce((s, t) => t.type === 'income' ? s + t.amount : s - t.amount, 0)
  const income  = transactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const expense = transactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  const submit = () => {
    const a = parseFloat(amount)
    if (!label.trim() || !a || a <= 0) return
    addTransaction(label.trim(), a, type)
    setLabel(''); setAmount('')
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="p-4 var-surface-2 border var-border rounded-xl text-center">
        <div className="text-xs var-text-muted mb-1">Баланс</div>
        <div className={clsx('text-2xl font-bold', balance >= 0 ? 'text-green-400' : 'text-red-400')}>
          {balance >= 0 ? '+' : ''}{balance.toLocaleString()} ₽
        </div>
        <div className="flex justify-center gap-6 mt-3 text-xs">
          <span className="flex items-center gap-1 text-green-400"><TrendingUp size={11} />+{income.toLocaleString()}</span>
          <span className="flex items-center gap-1 text-red-400"><TrendingDown size={11} />-{expense.toLocaleString()}</span>
        </div>
      </div>

      {/* Add */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button onClick={() => setType('expense')}
            className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
              type === 'expense' ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'var-border var-text-muted hover:var-text')}>
            Расход
          </button>
          <button onClick={() => setType('income')}
            className={clsx('flex-1 py-2 rounded-lg text-xs font-medium border transition-all',
              type === 'income' ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'var-border var-text-muted hover:var-text')}>
            Доход
          </button>
        </div>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Описание" className="nexum-input w-full text-sm" />
        <div className="flex gap-2">
          <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="Сумма" className="nexum-input flex-1 text-sm" />
          <button onClick={submit}
            className="p-2.5 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity">
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* List */}
      {transactions.length === 0 ? (
        <div className="text-center py-6 var-text-faint text-sm">Нет операций</div>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {transactions.slice().reverse().map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-3 var-surface-2 rounded-xl border var-border">
              <span className="text-sm var-text truncate flex-1">{tx.label}</span>
              <span className={clsx('text-sm font-medium ml-2', tx.type === 'income' ? 'text-green-400' : 'text-red-400')}>
                {tx.type === 'income' ? '+' : '-'}{tx.amount.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

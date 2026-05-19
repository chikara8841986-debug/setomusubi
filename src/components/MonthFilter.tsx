import { jstMonthStr } from '../lib/jst'

type MonthFilterProps = {
  value: string
  onChange: (value: string) => void
  className?: string
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(year, monthNumber - 1 + delta, 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function MonthFilter({ value, onChange, className = '' }: MonthFilterProps) {
  const currentMonth = jstMonthStr(0)
  const activeMonth = value || currentMonth

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(shiftMonth(activeMonth, -1))}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-700"
      >
        前月
      </button>
      <input
        type="month"
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="表示する月"
        className="input-base w-auto min-w-[150px] bg-white text-base font-semibold"
      />
      <button
        type="button"
        onClick={() => onChange(shiftMonth(activeMonth, 1))}
        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-teal-300 hover:text-teal-700"
      >
        翌月
      </button>
      <button
        type="button"
        onClick={() => onChange(currentMonth)}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
          value === currentMonth
            ? 'border-teal-600 bg-teal-50 text-teal-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-700'
        }`}
      >
        今月
      </button>
      <button
        type="button"
        onClick={() => onChange('')}
        className={`rounded-lg border px-3 py-2 text-sm font-semibold ${
          value === ''
            ? 'border-teal-600 bg-teal-50 text-teal-700'
            : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:text-teal-700'
        }`}
      >
        全期間
      </button>
    </div>
  )
}

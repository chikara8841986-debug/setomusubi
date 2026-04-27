import { useState } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { ja } from 'date-fns/locale'
import DemoLayout from './DemoLayout'

type Slot = {
  id: string
  date: string
  startTime: string
  endTime: string
}

function dateStr(d: Date) {
  return d.toISOString().split('T')[0]
}

const today = new Date()
const INITIAL_SLOTS: Slot[] = [
  { id: 'init-1', date: dateStr(addDays(today, 1)), startTime: '09:00', endTime: '12:00' },
  { id: 'init-2', date: dateStr(addDays(today, 1)), startTime: '14:00', endTime: '17:00' },
  { id: 'init-3', date: dateStr(addDays(today, 3)), startTime: '10:00', endTime: '15:00' },
  { id: 'init-4', date: dateStr(addDays(today, 5)), startTime: '08:00', endTime: '12:00' },
]

const TIME_OPTIONS = ['07:00','08:00','09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00']

export default function DemoBusinessCalendar() {
  const [weekOffset, setWeekOffset] = useState(0)
  const [slots, setSlots] = useState<Slot[]>(INITIAL_SLOTS)
  const [addDate, setAddDate] = useState(dateStr(addDays(today, 1)))
  const [addStart, setAddStart] = useState('09:00')
  const [addEnd, setAddEnd] = useState('12:00')
  const [addError, setAddError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  // Week days
  const weekStart = startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const handleAdd = () => {
    setAddError('')
    if (addStart >= addEnd) { setAddError('終了時間は開始時間より後にしてください'); return }
    const isDup = slots.some(s => s.date === addDate && s.startTime === addStart && s.endTime === addEnd)
    if (isDup) { setAddError('同じ日時のスロットがすでに登録されています'); return }
    const id = `demo-add-${Date.now()}`
    setSlots(prev => [...prev, { id, date: addDate, startTime: addStart, endTime: addEnd }])
    showToast('空き枠を追加しました')
  }

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      setSlots(prev => prev.filter(s => s.id !== id))
      setDeletingId(null)
      showToast('削除しました')
    } else {
      setDeletingId(id)
    }
  }

  return (
    <DemoLayout role="business">
      <div>
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg">
            {toast}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-800 mb-1">カレンダー（空き枠管理）</h1>
        <p className="text-xs text-slate-400 mb-4">空き枠を追加するとMSWの検索結果に表示されます。削除ボタンを一度タップすると確認、もう一度で削除できます。</p>

        {/* Add form */}
        <div className="card mb-4 space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">空き枠を追加する</h2>
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <label className="label">日付</label>
              <input
                type="date"
                className="input-base w-auto"
                value={addDate}
                min={dateStr(today)}
                onChange={e => setAddDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">開始</label>
              <select className="input-base w-auto" value={addStart} onChange={e => setAddStart(e.target.value)}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">終了</label>
              <select className="input-base w-auto" value={addEnd} onChange={e => setAddEnd(e.target.value)}>
                {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <button onClick={handleAdd} className="btn-primary whitespace-nowrap">＋ 追加</button>
          </div>
          {addError && <p className="text-xs text-red-600">{addError}</p>}
        </div>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            className="btn-secondary text-sm px-3 py-1.5"
            disabled={weekOffset <= 0}
          >← 前週</button>
          <span className="text-sm font-semibold text-slate-700">
            {format(weekDays[0], 'M月d日', { locale: ja })} 〜 {format(weekDays[6], 'M月d日', { locale: ja })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary text-sm px-3 py-1.5">次週 →</button>
        </div>

        {/* Week grid */}
        <div className="card space-y-0 p-0 overflow-hidden">
          {weekDays.map((day, i) => {
            const ds = dateStr(day)
            const daySlots = slots.filter(s => s.date === ds).sort((a, b) => a.startTime.localeCompare(b.startTime))
            const isToday = ds === dateStr(today)
            const isPast = day < today && !isToday
            const dayLabel = ['月', '火', '水', '木', '金', '土', '日'][i]
            const textColor = i === 5 ? 'text-sky-600' : i === 6 ? 'text-red-500' : 'text-slate-700'

            return (
              <div key={ds} className={`flex gap-3 px-4 py-3 border-b border-slate-100 last:border-0 ${isPast ? 'opacity-50' : ''} ${isToday ? 'bg-teal-50' : ''}`}>
                <div className="w-12 flex-shrink-0 text-center">
                  <p className={`text-xs font-bold ${textColor}`}>{dayLabel}</p>
                  <p className={`text-lg font-bold ${isToday ? 'text-teal-700' : textColor}`}>{format(day, 'd')}</p>
                  {isToday && <p className="text-[10px] text-teal-600 font-medium">今日</p>}
                </div>
                <div className="flex-1 flex flex-wrap gap-1.5 items-center min-h-[40px]">
                  {daySlots.length === 0 ? (
                    <p className="text-xs text-slate-300">空き枠なし</p>
                  ) : (
                    daySlots.map(slot => (
                      <div key={slot.id} className="flex items-center gap-1 bg-teal-100 border border-teal-200 rounded-lg px-2 py-1">
                        <span className="text-xs font-medium text-teal-800">{slot.startTime}〜{slot.endTime}</span>
                        <button
                          onClick={() => handleDelete(slot.id)}
                          className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors ${
                            deletingId === slot.id
                              ? 'bg-red-500 text-white'
                              : 'bg-slate-200 text-slate-500 hover:bg-red-100 hover:text-red-600'
                          }`}
                        >
                          {deletingId === slot.id ? '確認' : '削除'}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 card bg-sky-50 border-sky-200 text-xs text-sky-800 space-y-1">
          <p className="font-semibold">💡 デモのヒント</p>
          <p>「＋ 追加」ボタンで空き枠を追加してみてください。追加した枠はMSWの検索で見つかるようになります（デモでは保存されません）。</p>
        </div>
      </div>
    </DemoLayout>
  )
}

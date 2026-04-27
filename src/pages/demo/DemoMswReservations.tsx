import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import {
  INITIAL_DEMO_RESERVATIONS,
  EQUIPMENT_LABELS,
  STATUS_MAP,
  type DemoReservation,
} from './demoData'

type Tab = 'active' | 'past'

export default function DemoMswReservations() {
  const navigate = useNavigate()
  const [reservations, setReservations] = useState<DemoReservation[]>([])
  const [tab, setTab] = useState<Tab>('active')
  const [selected, setSelected] = useState<DemoReservation | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  useEffect(() => {
    // Load from sessionStorage (items added via DemoMswSearch)
    try {
      const extra = JSON.parse(sessionStorage.getItem('demo_reservations') ?? '[]') as DemoReservation[]
      setReservations([...extra, ...INITIAL_DEMO_RESERVATIONS])
    } catch {
      setReservations(INITIAL_DEMO_RESERVATIONS)
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const active = reservations.filter(r => r.status === 'pending' || r.status === 'confirmed')
  const past = reservations.filter(r => ['completed', 'cancelled', 'rejected'].includes(r.status))
  const list = tab === 'active' ? [...active].sort((a, b) => a.reservation_date.localeCompare(b.reservation_date)) : past

  const handleCancel = (id: string) => {
    setReservations(prev => prev.map(r => r.id === id ? { ...r, status: 'cancelled' as const } : r))
    setSelected(null)
    setShowCancelConfirm(false)
  }

  return (
    <DemoLayout role="msw">
      <div>
        <h1 className="text-xl font-bold text-slate-800 mb-1">予約履歴</h1>
        <p className="text-xs text-slate-400 mb-4">「進行中」は申請中・確定済みの予約、「過去」は完了・キャンセル・却下を確認できます。</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          {([['active', '進行中', active.length], ['past', '過去の予約', past.length]] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                tab === key ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                  tab === key ? 'bg-white text-teal-600' : 'bg-teal-50 text-teal-700'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Pending notice */}
        {tab === 'active' && active.some(r => r.status === 'pending') && (
          <div className="mb-3 rounded-xl px-4 py-3 text-xs border bg-amber-50 border-amber-200 text-amber-800">
            <p className="font-medium">申請中の仮予約が{active.filter(r => r.status === 'pending').length}件あります</p>
            <p className="mt-0.5">事業所が確認次第、承認・却下の通知が来ます</p>
          </div>
        )}

        {list.length === 0 ? (
          <div className="card text-center py-12">
            {tab === 'active' ? (
              <>
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-500 text-sm font-medium mb-1">進行中の予約はありません</p>
                <p className="text-xs text-slate-400 mb-4">空き枠のある事業所を検索して予約申請しましょう</p>
                <button onClick={() => navigate('/demo/msw/search')} className="btn-primary text-sm">
                  空き事業所を検索する →
                </button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-slate-500 text-sm font-medium">過去の予約はありません</p>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(r => (
              <button
                key={r.id}
                onClick={() => { setSelected(r); setShowCancelConfirm(false) }}
                className="card w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800">
                      {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time}〜{r.end_time}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{r.business_name} ／ 担当: {r.contact_name}</p>
                    <p className="text-xs text-slate-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                  </div>
                  <span className={STATUS_MAP[r.status]?.cls ?? 'badge-gray'}>
                    {STATUS_MAP[r.status]?.label ?? r.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Detail modal */}
        {selected && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-slate-800">予約詳細</h3>
                  <span className={STATUS_MAP[selected.status]?.cls}>{STATUS_MAP[selected.status]?.label}</span>
                </div>
                <button onClick={() => { setSelected(null); setShowCancelConfirm(false) }} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>
              <dl className="space-y-3 text-sm">
                {[
                  ['日時', `${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time}〜${selected.end_time}`],
                  ['事業所', selected.business_name],
                  ['担当者', selected.contact_name],
                  ['患者氏名', selected.patient_name],
                  ['乗車地', selected.patient_address],
                  ['目的地', selected.destination],
                  ['使用機材', EQUIPMENT_LABELS[selected.equipment]],
                  ['機材貸出', selected.equipment_rental ? 'あり' : 'なし'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="text-slate-500 w-20 flex-shrink-0">{label}</dt>
                    <dd className="text-slate-800 font-medium break-all">{value}</dd>
                  </div>
                ))}
                {selected.notes && (
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-20 flex-shrink-0">備考</dt>
                    <dd className="text-slate-800 font-medium">{selected.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="flex gap-2 mt-4">
                <button onClick={() => { setSelected(null); setShowCancelConfirm(false) }} className="btn-secondary flex-1">閉じる</button>
                {(selected.status === 'pending' || selected.status === 'confirmed') && (
                  showCancelConfirm ? (
                    <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-2 space-y-1">
                      <p className="text-xs text-red-700 font-medium text-center">キャンセルしますか？</p>
                      <div className="flex gap-1">
                        <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary flex-1 text-xs py-1.5">戻る</button>
                        <button
                          onClick={() => handleCancel(selected.id)}
                          className="flex-1 text-xs bg-red-600 text-white px-3 py-1.5 rounded-xl font-semibold hover:bg-red-700 transition-colors"
                        >キャンセル確定</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowCancelConfirm(true)} className="btn-danger flex-1">キャンセル</button>
                  )
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DemoLayout>
  )
}

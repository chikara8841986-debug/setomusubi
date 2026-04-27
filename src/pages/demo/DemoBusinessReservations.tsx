import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import {
  INITIAL_DEMO_RESERVATIONS,
  EQUIPMENT_LABELS,
  STATUS_MAP,
  type DemoReservation,
} from './demoData'

type Tab = 'pending' | 'upcoming' | 'past'
type ConfirmAction = 'reject' | 'complete' | null

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function DemoBusinessReservations() {
  const [reservations, setReservations] = useState<DemoReservation[]>(INITIAL_DEMO_RESERVATIONS)
  const [tab, setTab] = useState<Tab>('pending')
  const [selected, setSelected] = useState<DemoReservation | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type?: 'error' | 'info' } | null>(null)

  const showToast = (msg: string, type?: 'error' | 'info') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const pending = reservations.filter(r => r.status === 'pending')
  const upcoming = reservations.filter(r => r.status === 'confirmed')
  const past = reservations.filter(r => ['completed', 'cancelled', 'rejected'].includes(r.status))

  const list = tab === 'pending' ? pending : tab === 'upcoming' ? upcoming : [...past].reverse()

  const handleApprove = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'confirmed' as const } : x))
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      setTab('upcoming')
      showToast('予約を承認しました')
    }, 700)
  }

  const handleReject = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'rejected' as const } : x))
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      showToast('申請を却下しました', 'error')
    }, 700)
  }

  const handleComplete = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'completed' as const } : x))
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      showToast('完了にしました')
    }, 700)
  }

  return (
    <DemoLayout role="business">
      <div>
        {/* Toast */}
        {toast && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg ${
            toast.type === 'error' ? 'bg-red-500 text-white' : toast.type === 'info' ? 'bg-sky-600 text-white' : 'bg-teal-600 text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-800 mb-1">予約管理</h1>
        <p className="text-xs text-slate-400 mb-4">「申請中」タブにMSWからの仮予約が届きます。承認すると予約が確定しMSWへ通知されます。</p>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {([
            { key: 'pending' as Tab, label: '申請中', count: pending.length, alert: pending.length > 0 },
            { key: 'upcoming' as Tab, label: '確定済み', count: upcoming.length, alert: false },
            { key: 'past' as Tab, label: '過去', count: past.length, alert: false },
          ] as const).map(({ key, label, count, alert }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                  tab === key ? 'bg-white text-teal-600' : alert ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Pending notice */}
        {tab === 'pending' && pending.length > 0 && (
          <div className="mb-3 rounded-xl px-4 py-3 text-sm border bg-amber-50 border-amber-200 text-amber-800">
            <p className="font-medium">仮予約申請が{pending.length}件届いています</p>
            <p className="text-xs mt-0.5 text-amber-700">申請から約2時間経過 — お早めにご対応ください</p>
          </div>
        )}

        {list.length === 0 ? (
          <div className="card text-center py-12">
            {tab === 'pending' ? (
              <>
                <div className="text-4xl mb-3">📭</div>
                <p className="text-slate-500 text-sm font-medium mb-1">新しい申請はありません</p>
                <p className="text-xs text-slate-400 mb-4">カレンダーに空き枠を追加するとMSWから申請が届きます</p>
                <Link to="/demo/business/calendar" className="btn-primary text-sm inline-flex">
                  📅 カレンダーで空き枠を追加
                </Link>
              </>
            ) : tab === 'upcoming' ? (
              <>
                <div className="text-4xl mb-2">📆</div>
                <p className="text-slate-500 text-sm font-medium">確定済みの予約はありません</p>
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
            {list.map(r => {
              const hoursElapsed = r.status === 'pending'
                ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60))
                : null
              return (
                <div key={r.id} className={`card hover:shadow-md transition-shadow ${
                  hoursElapsed !== null && hoursElapsed >= 6 ? 'border-red-200' : ''
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <button className="flex-1 text-left min-w-0" onClick={() => { setSelected(r); setConfirmAction(null) }}>
                      <p className="text-sm font-semibold text-slate-800">
                        {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time}〜{r.end_time}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.hospital_name} ／ {r.contact_name}</p>
                      <p className="text-xs text-slate-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                    </button>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={STATUS_MAP[r.status]?.cls ?? 'badge-gray'}>{STATUS_MAP[r.status]?.label}</span>
                      {r.status === 'pending' && (
                        <button
                          onClick={e => { e.stopPropagation(); handleApprove(r) }}
                          disabled={processing}
                          className="mt-0.5 text-[10px] bg-teal-600 text-white px-2 py-0.5 rounded-full font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
                        >
                          ✓ 承認
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
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
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>

              {selected.status === 'pending' && (
                <div className="mb-3 rounded-lg px-3 py-2 border text-xs font-medium text-amber-600 bg-amber-50 border-amber-200">
                  申請から約2時間経過 — 早めにご対応ください
                </div>
              )}

              <dl className="space-y-3 text-sm">
                {[
                  ['日時', `${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time}〜${selected.end_time}`],
                  ['病院', selected.hospital_name],
                  ['担当者', selected.contact_name],
                  ['患者氏名', selected.patient_name],
                  ['使用機材', EQUIPMENT_LABELS[selected.equipment]],
                  ['機材貸出', selected.equipment_rental ? 'あり' : 'なし'],
                ].map(([label, value]) => (
                  <div key={label} className="flex gap-3">
                    <dt className="text-slate-500 w-20 flex-shrink-0">{label}</dt>
                    <dd className="text-slate-800 font-medium">{value}</dd>
                  </div>
                ))}
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">乗車地</dt>
                  <dd className="font-medium text-sm flex-1 min-w-0">
                    <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline break-all">
                      📍 {selected.patient_address}
                    </a>
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">目的地</dt>
                  <dd className="font-medium text-sm flex-1 min-w-0">
                    <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline break-all">
                      📍 {selected.destination}
                    </a>
                  </dd>
                </div>
                {selected.notes && (
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-20 flex-shrink-0">備考</dt>
                    <dd className="text-slate-800 font-medium">{selected.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 space-y-2">
                {selected.status === 'pending' && (
                  <>
                    {confirmAction !== 'reject' && (
                      <button onClick={() => handleApprove(selected)} disabled={processing} className="btn-primary w-full">
                        {processing ? '処理中...' : '✓ 承認する（予約を確定）'}
                      </button>
                    )}
                    {confirmAction === 'reject' ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                        <p className="text-sm text-red-700 font-medium text-center">この申請を却下しますか？</p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1 text-sm">戻る</button>
                          <button onClick={() => handleReject(selected)} disabled={processing} className="flex-1 text-sm bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50">
                            {processing ? '処理中...' : '却下する'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmAction('reject')} disabled={processing} className="btn-danger w-full">却下する</button>
                    )}
                  </>
                )}
                {selected.status === 'confirmed' && (
                  confirmAction === 'complete' ? (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm text-orange-700 font-medium text-center">予約を完了にしますか？</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1 text-sm">戻る</button>
                        <button onClick={() => handleComplete(selected)} disabled={processing} className="flex-1 text-sm bg-orange-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50">
                          {processing ? '処理中...' : '完了にする'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmAction('complete')} disabled={processing} className="w-full text-sm bg-orange-500 text-white px-4 py-2.5 rounded-xl hover:bg-orange-600 disabled:opacity-50 font-semibold transition-colors">
                      ✓ 完了にする
                    </button>
                  )
                )}
                <button onClick={() => setSelected(null)} className="btn-secondary w-full">閉じる</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DemoLayout>
  )
}

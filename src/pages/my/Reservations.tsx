import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { MonthFilter } from '../../components/MonthFilter'
import { jstMonthStr } from '../../lib/jst'
import { filterReservationsByMonth, sortReservationsNewestFirst } from '../../lib/reservationView'
import { invokeNotifyWithRetry } from '../../lib/notifyInvoke'
import type { Reservation } from '../../types/database'

// 一般の方（ご利用者本人・ご家族）向けの予約一覧。src/pages/msw/Reservations.tsx をベースにしているが、
// - hospital_id ではなく requester_user_id = 自分 で絞り込む
// - キャンセルは cancel_reservation_by_personal RPC を使う（reservationsを直接UPDATEしない）
// - 予約詳細に「病院」欄は出さない（個人予約には無いため）

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

type ReservationWithBusiness = Reservation & {
  businesses: { name: string; cancel_phone: string | null } | null
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  pending:   { cls: 'badge-red',  label: '申請中' },
  confirmed: { cls: 'badge-blue', label: '確定' },
  completed: { cls: 'badge-green',label: '完了' },
  cancelled: { cls: 'badge-gray', label: 'キャンセル' },
  rejected:  { cls: 'badge-gray', label: '非承認' },
}

type Tab = 'active' | 'past'

export default function PersonalReservations() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [reservations, setReservations] = useState<ReservationWithBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<ReservationWithBusiness | null>(null)
  const [tab, setTab] = useState<Tab>('active')
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState('')
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [monthFilter, setMonthFilter] = useState(() => jstMonthStr(0))

  const fetchReservations = useCallback(async () => {
    if (!user) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, businesses(name, cancel_phone)')
      .eq('requester_user_id', user.id)
      .order('reservation_date', { ascending: false })
      .order('start_time', { ascending: false })
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((data as unknown as ReservationWithBusiness[]) ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected(null); setShowCancelConfirm(false) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    fetchReservations()
    if (!user) return
    const channel = supabase
      .channel('personal-reservations-' + user.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'reservations',
        filter: `requester_user_id=eq.${user.id}`,
      }, (payload) => {
        if (payload.new?.status === 'confirmed') {
          showToast('予約が確定されました', 'info')
        } else if (payload.new?.status === 'rejected') {
          showToast('申請が承認されませんでした', 'error')
        }
        fetchReservations()
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'reservations',
        filter: `requester_user_id=eq.${user.id}`,
      }, fetchReservations)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReservations, user])

  const visibleReservations = filterReservationsByMonth(reservations, monthFilter)

  const active = visibleReservations.filter(r => {
    if (r.status === 'pending') return true
    if (r.status === 'confirmed') {
      return !isPast(new Date(`${r.reservation_date}T${r.end_time}`))
    }
    return false
  })

  const switchTab = (t: Tab) => setTab(t)

  const past = visibleReservations.filter(r => {
    if (r.status === 'pending') return false
    if (r.status === 'confirmed') {
      return isPast(new Date(`${r.reservation_date}T${r.end_time}`))
    }
    return true
  })

  const list = sortReservationsNewestFirst(tab === 'active' ? active : past)

  const handleCancel = async (r: ReservationWithBusiness) => {
    setShowCancelConfirm(false)
    setCancelling(true)
    setCancelError('')
    // cancel_reservation_by_personal RPC: status='cancelled' と slot解放を一括で行う
    const { error: cancelErr } = await supabase.rpc('cancel_reservation_by_personal', { p_reservation_id: r.id })
    if (cancelErr) {
      setCancelError('キャンセルに失敗しました。再試行してください。')
      setCancelling(false)
      return
    }
    if (r.status === 'confirmed') {
      invokeNotifyWithRetry('send-cancellation', { reservation_id: r.id })
        .then((ok) => { if (!ok) showToast('キャンセルされましたが、通知メールの送信に失敗しました。事業所へ直接ご連絡ください。', 'error') })
    }
    setCancelling(false)
    setSelected(null)
    showToast('予約をキャンセルしました', 'error')
    fetchReservations()
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-16 gap-3"><span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p></div>
  if (loadError) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-2">😵</div><p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchReservations} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">予約一覧</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">「進行中」は申請中・確定済みの予約、「過去の予約」は完了・キャンセル・非承認の予約を確認できます。</p>

      <MonthFilter
        value={monthFilter}
        onChange={value => setMonthFilter(value)}
        className="mb-4"
      />

      <div className="flex gap-2 mb-4">
        <button onClick={() => switchTab('active')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}>
          進行中
          {active.length > 0 && (
            <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
              tab === 'active' ? 'bg-white text-teal-600' : 'bg-teal-50 text-teal-700'
            }`}>{active.length}</span>
          )}
        </button>
        <button onClick={() => switchTab('past')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'past' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}>
          過去の予約
          {past.length > 0 && (
            <span className={`text-xs opacity-60`}>({past.length})</span>
          )}
        </button>
      </div>

      {tab === 'active' && active.some(r => r.status === 'pending') && (
        <div className="mb-3 rounded-xl px-4 py-3 text-sm border bg-amber-50 border-amber-200 text-amber-800">
          <p className="font-medium">申請中の予約があります</p>
          <p className="mt-0.5">事業所が確認次第、承認または非承認の通知が来ます。</p>
        </div>
      )}

      {list.length === 0 ? (
        <div className="card text-center py-12">
          {tab === 'active' ? (
            <>
              <div className="text-4xl mb-3">📋</div>
              <p className="text-slate-500 text-sm font-medium mb-1">進行中の予約はありません</p>
              <p className="text-xs text-slate-400 mb-4">空きのある事業所を検索して予約申請しましょう</p>
              <button
                onClick={() => navigate('/my/search')}
                className="btn-primary text-sm"
              >
                事業所を探す →
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
          {list.map(r => {
            const msUntil = r.status === 'confirmed'
              ? new Date(`${r.reservation_date}T${r.start_time}`).getTime() - Date.now()
              : null
            const daysUntil = msUntil !== null ? Math.ceil(msUntil / (1000 * 60 * 60 * 24)) : null
            const hoursUntil = msUntil !== null ? Math.floor(msUntil / (1000 * 60 * 60)) : null
            return (
              <button key={r.id} onClick={() => { setSelected(r); setCancelError('') }}
                className="card w-full text-left hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-800 leading-snug">
                      {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                    </p>
                    <p className="text-base font-medium text-slate-600 mt-1">{r.businesses?.name ?? '—'}</p>
                    <p className="text-base text-slate-700 mt-1">ご利用者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className={STATUS_MAP[r.status]?.cls ?? 'badge-gray'}>
                      {STATUS_MAP[r.status]?.label ?? r.status}
                    </span>
                    {daysUntil !== null && daysUntil > 3 && (
                      <span className="text-[10px] text-teal-600 font-medium">あと{daysUntil}日</span>
                    )}
                    {daysUntil !== null && daysUntil > 1 && daysUntil <= 3 && (
                      <span className="text-[10px] text-amber-600 font-bold">あと{daysUntil}日</span>
                    )}
                    {daysUntil !== null && daysUntil <= 1 && hoursUntil !== null && hoursUntil > 0 && (
                      <span className="text-[10px] text-amber-600 font-bold">あと{hoursUntil}時間</span>
                    )}
                    {daysUntil !== null && hoursUntil !== null && hoursUntil <= 0 && (
                      <span className="text-[10px] text-red-600 font-bold">まもなく</span>
                    )}
                  </div>
                </div>
              </button>
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
                <span className={STATUS_MAP[selected.status]?.cls ?? 'badge-gray'}>
                  {STATUS_MAP[selected.status]?.label ?? selected.status}
                </span>
              </div>
              <button onClick={() => { setSelected(null); setShowCancelConfirm(false) }} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center" aria-label="閉じる">×</button>
            </div>

            {selected.status === 'pending' && (
              <div className="rounded-lg px-3 py-2 mb-4 text-sm border bg-amber-50 border-amber-200 text-amber-800">
                <p className="font-medium">申請中です</p>
                <p className="mt-0.5">事業所が確認後に承認または非承認を行います。</p>
              </div>
            )}
            {selected.status === 'rejected' && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4 text-sm text-slate-600 space-y-2">
                <p>この申請は承認されませんでした。別の事業所をお探しください。</p>
                <button
                  onClick={() => navigate('/my/search', {
                    state: {
                      prefill: {
                        patientName: selected.patient_name,
                        patientAddress: selected.patient_address,
                        destination: selected.destination,
                        equipment: selected.equipment,
                        equipmentRental: selected.equipment_rental,
                        notes: selected.notes ?? '',
                      },
                      searchPrefill: {
                        date: selected.reservation_date,
                        startTime: selected.start_time.slice(0, 5),
                        endTime: selected.end_time.slice(0, 5),
                      },
                    }
                  })}
                  className="w-full text-center text-sm font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded-lg py-2 hover:bg-teal-100 transition-colors"
                >
                  別の事業所を探して申請する →
                </button>
              </div>
            )}

            <dl className="space-y-3 text-base">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              <Row label="事業所" value={selected.businesses?.name ?? '—'} />
              <Row label="ご利用者" value={selected.patient_name} />
              <div className="flex gap-3">
                <dt className="text-slate-500 w-20 flex-shrink-0 text-base">乗車地</dt>
                <dd className="font-medium text-base flex-1 min-w-0">
                  <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.patient_address}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.patient_address).then(() => showToast('コピーしました')).catch(() => {})}
                    className="ml-2 text-[10px] text-slate-400 hover:text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-slate-500 w-20 flex-shrink-0 text-base">目的地</dt>
                <dd className="font-medium text-base flex-1 min-w-0">
                  <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.destination}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.destination).then(() => showToast('コピーしました')).catch(() => {})}
                    className="ml-2 text-[10px] text-slate-400 hover:text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              {selected.caller_phone && <Row label="連絡先" value={selected.caller_phone} />}
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment]} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
            </dl>

            {selected.businesses?.cancel_phone && (selected.status === 'pending' || selected.status === 'confirmed') && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mt-4">
                <p className="text-sm font-medium text-teal-800 mb-1">
                  {selected.status === 'pending' ? '急ぎの場合は直接お電話ください' : 'キャンセルの場合は直接お電話ください'}
                </p>
                <a href={`tel:${selected.businesses.cancel_phone}`} className="text-xl font-bold text-teal-900">
                  📞 {selected.businesses.cancel_phone}
                </a>
              </div>
            )}

            {cancelError && <p className="text-xs text-red-600 mt-2">{cancelError}</p>}

            {(selected.status === 'completed' || selected.status === 'cancelled') && (
              <button
                onClick={() => {
                  navigate('/my/search', {
                    state: {
                      prefill: {
                        patientName: selected.patient_name,
                        patientAddress: selected.patient_address,
                        destination: selected.destination,
                        equipment: selected.equipment,
                        equipmentRental: selected.equipment_rental,
                        notes: selected.notes ?? '',
                      },
                      searchPrefill: {
                        date: selected.reservation_date,
                        startTime: selected.start_time.slice(0, 5),
                        endTime: selected.end_time.slice(0, 5),
                      },
                    }
                  })
                }}
                className="w-full mt-4 text-sm border border-teal-300 text-teal-600 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                同じ内容で再申請する
              </button>
            )}

            <div className="flex gap-2 mt-2">
              <button onClick={() => { setSelected(null); setCancelError('') }} className="btn-secondary flex-1">閉じる</button>
              {(selected.status === 'pending' || selected.status === 'confirmed') && (
                showCancelConfirm ? (
                  <div className="w-full bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm text-red-700 font-medium text-center">キャンセルしますか？</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowCancelConfirm(false)} className="btn-secondary flex-1 text-sm">戻る</button>
                      <button
                        onClick={() => handleCancel(selected)}
                        disabled={cancelling}
                        className="flex-1 text-sm bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >{cancelling ? '処理中...' : 'キャンセルする'}</button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={cancelling}
                    className="btn-danger flex-1 text-sm"
                  >
                    キャンセル
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-slate-500 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-slate-800 font-medium break-all">{value}</dd>
    </div>
  )
}

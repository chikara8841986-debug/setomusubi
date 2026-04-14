import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { isTodayJST } from '../../lib/jst'
import type { Reservation } from '../../types/database'

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

type ReservationWithHospital = Reservation & {
  hospitals: { name: string } | null
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

type Tab = 'pending' | 'today' | 'upcoming' | 'past'
type ConfirmAction = 'reject' | 'complete' | null

export default function BusinessReservations() {
  const { businessId } = useAuth()
  const { showToast } = useToast()
  const [reservations, setReservations] = useState<ReservationWithHospital[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<ReservationWithHospital | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [initialTabSet, setInitialTabSet] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [actionError, setActionError] = useState('')
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  const fetchReservations = useCallback(async () => {
    if (!businessId) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, hospitals(name)')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((data as ReservationWithHospital[]) ?? [])
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    fetchReservations()
    if (!businessId) return
    const channel = supabase
      .channel('business-reservations-' + businessId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'reservations',
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        if (payload.new?.status === 'pending') {
          setTab('pending')
          showToast('新しい仮予約申請が届きました', 'info')
        }
        fetchReservations()
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'reservations',
        filter: `business_id=eq.${businessId}`,
      }, (payload) => {
        if (payload.new?.status === 'cancelled') {
          showToast('予約がキャンセルされました', 'error')
        }
        fetchReservations()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReservations, businessId])

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected(null); setConfirmAction(null) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // 初回ロード後: 申請中がなく今日の予約があれば「今日」タブに自動切替
  useEffect(() => {
    if (loading || initialTabSet) return
    setInitialTabSet(true)
    const pendingCount = reservations.filter(r => r.status === 'pending').length
    const todayCount = reservations.filter(r =>
      r.status === 'confirmed' && isTodayJST(r.reservation_date)
    ).length
    if (pendingCount === 0 && todayCount > 0) {
      setTab('today')
    }
  }, [loading, reservations])

  const openModal = (r: ReservationWithHospital) => {
    setSelected(r)
    setActionError('')
    setConfirmAction(null)
  }

  const closeModal = () => {
    setSelected(null)
    setConfirmAction(null)
    setActionError('')
  }

  const pending = reservations.filter(r => r.status === 'pending')
  const today = reservations.filter(r =>
    r.status === 'confirmed' && isTodayJST(r.reservation_date)
  )
  const upcoming = reservations.filter(r => {
    if (r.status !== 'confirmed') return false
    if (isTodayJST(r.reservation_date)) return false
    const dt = new Date(`${r.reservation_date}T${r.end_time}`)
    return !isPast(dt)
  })
  const past = reservations.filter(r => {
    if (r.status === 'pending') return false
    if (r.status === 'confirmed') {
      const dt = new Date(`${r.reservation_date}T${r.end_time}`)
      return isPast(dt)
    }
    return true // completed, cancelled, rejected
  })

  const handleApprove = async (r: ReservationWithHospital) => {
    setProcessing(true)
    setActionError('')

    if (r.slot_id) {
      const { data: slot } = await supabase
        .from('availability_slots')
        .select('capacity, confirmed_count, is_available')
        .eq('id', r.slot_id)
        .single()

      const capacity = slot?.capacity ?? 1
      const confirmedCount = slot?.confirmed_count ?? 0
      const newCount = confirmedCount + 1
      const nowFull = newCount >= capacity

      await supabase
        .from('availability_slots')
        .update({ confirmed_count: newCount, is_available: !nowFull })
        .eq('id', r.slot_id)

      if (nowFull) {
        await supabase
          .from('reservations')
          .update({ status: 'rejected' })
          .eq('slot_id', r.slot_id)
          .eq('status', 'pending')
          .neq('id', r.id)
      }
    }

    await supabase.from('reservations').update({ status: 'confirmed' }).eq('id', r.id)
    supabase.functions.invoke('send-confirmation', { body: { reservation_id: r.id } }).catch(() => {})

    closeModal()
    setProcessing(false)
    showToast('予約を承認しました')
    fetchReservations()
  }

  const handleReject = async (r: ReservationWithHospital) => {
    setProcessing(true)
    await supabase.from('reservations').update({ status: 'rejected' }).eq('id', r.id)
    supabase.functions.invoke('send-rejection', { body: { reservation_id: r.id } }).catch(() => {})
    closeModal()
    setProcessing(false)
    showToast('申請を却下しました', 'error')
    fetchReservations()
  }

  const handleComplete = async (r: ReservationWithHospital) => {
    setProcessing(true)
    await supabase.from('reservations').update({ status: 'completed' }).eq('id', r.id)
    if (r.slot_id) {
      const { data: slot } = await supabase
        .from('availability_slots')
        .select('confirmed_count')
        .eq('id', r.slot_id)
        .single()
      const newCount = Math.max(0, (slot?.confirmed_count ?? 1) - 1)
      await supabase
        .from('availability_slots')
        .update({ confirmed_count: newCount, is_available: true })
        .eq('id', r.slot_id)
    }
    closeModal()
    setProcessing(false)
    showToast('完了にしました')
    fetchReservations()
  }

  // 過去タブは直近が先頭（降順）
  const list = tab === 'pending' ? pending
    : tab === 'today' ? today
    : tab === 'upcoming' ? upcoming
    : [...past].reverse()

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchReservations} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">予約管理</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto">
        {([
          { key: 'pending' as Tab, label: '申請中', count: pending.length, alert: pending.length > 0 },
          { key: 'today' as Tab, label: '今日', count: today.length, alert: today.length > 0 },
          { key: 'upcoming' as Tab, label: '確定済み', count: upcoming.length, alert: false },
          { key: 'past' as Tab, label: '過去', count: past.length, alert: false },
        ] as const).map(({ key, label, count, alert }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-teal-300'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                tab === key
                  ? 'bg-white text-teal-600'
                  : alert ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Pending notice */}
      {tab === 'pending' && pending.length > 0 && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <p className="font-medium">新しい仮予約申請が{pending.length}件届いています</p>
          <p className="text-xs text-amber-700 mt-0.5">内容を確認して承認または却下してください</p>
        </div>
      )}

      {list.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {tab === 'pending' ? '新しい申請はありません' :
           tab === 'today' ? '今日の予約はありません' :
           tab === 'upcoming' ? '確定済みの予約はありません' : '過去の予約はありません'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(r => {
            const daysUntil = (tab === 'upcoming' && r.status === 'confirmed')
              ? Math.ceil(
                  (new Date(`${r.reservation_date}T${r.start_time}`).getTime() - Date.now()) /
                  (1000 * 60 * 60 * 24)
                )
              : null
            const hoursUntil = (tab === 'today' && r.status === 'confirmed')
              ? Math.ceil(
                  (new Date(`${r.reservation_date}T${r.start_time}`).getTime() - Date.now()) /
                  (1000 * 60 * 60)
                )
              : null
            return (
            <button key={r.id} onClick={() => openModal(r)}
              className="card w-full text-left hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.hospitals?.name ?? '—'} ／ {r.contact_name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <StatusBadge status={r.status} />
                  {daysUntil !== null && daysUntil > 0 && (
                    <span className="text-[10px] text-teal-600 font-medium">あと{daysUntil}日</span>
                  )}
                  {daysUntil !== null && daysUntil <= 0 && (
                    <span className="text-[10px] text-amber-600 font-bold">まもなく</span>
                  )}
                  {hoursUntil !== null && hoursUntil > 0 && (
                    <span className="text-[10px] text-teal-600 font-medium">あと{hoursUntil}時間</span>
                  )}
                  {hoursUntil !== null && hoursUntil <= 0 && (
                    <span className="text-[10px] text-amber-600 font-bold">時間になりました</span>
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
                <h3 className="font-semibold text-gray-900">予約詳細</h3>
                <StatusBadge status={selected.status} />
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {selected.status === 'pending' && (() => {
              const h = Math.floor((Date.now() - new Date(selected.created_at).getTime()) / (1000 * 60 * 60))
              const label = h < 1 ? '〜1時間以内' : h < 24 ? `${h}時間経過` : `${Math.floor(h / 24)}日${h % 24}時間経過`
              const cls = h >= 12 ? 'text-red-600 bg-red-50 border-red-200' : h >= 6 ? 'text-orange-600 bg-orange-50 border-orange-200' : h >= 3 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-gray-500 bg-gray-50 border-gray-200'
              return (
                <div className={`mb-3 rounded-lg px-3 py-2 border text-xs font-medium ${cls}`}>
                  申請から {label} — 早めにご対応ください
                </div>
              )
            })()}

            <dl className="space-y-3 text-sm">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              <Row label="病院" value={selected.hospitals?.name ?? '—'} />
              <Row label="担当者" value={selected.contact_name} />
              <Row label="患者氏名" value={selected.patient_name} />
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0 text-sm">乗車地</dt>
                <dd className="font-medium text-sm">
                  <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.patient_address}
                  </a>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0 text-sm">目的地</dt>
                <dd className="font-medium text-sm">
                  <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.destination}
                  </a>
                </dd>
              </div>
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment]} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
            </dl>

            {actionError && <p className="text-xs text-red-600 mt-3">{actionError}</p>}

            <div className="mt-4 space-y-2">
              {selected.status === 'pending' && (
                <>
                  {confirmAction !== 'reject' && (
                    <button
                      onClick={() => handleApprove(selected)}
                      disabled={processing}
                      className="btn-primary w-full"
                    >
                      {processing ? '処理中...' : '✓ 承認する（予約を確定）'}
                    </button>
                  )}

                  {confirmAction === 'reject' ? (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm text-red-700 font-medium text-center">この申請を却下しますか？</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmAction(null)}
                          className="btn-secondary flex-1 text-sm"
                        >
                          戻る
                        </button>
                        <button
                          onClick={() => handleReject(selected)}
                          disabled={processing}
                          className="flex-1 text-sm bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
                        >
                          {processing ? '処理中...' : '却下する'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmAction('reject')}
                      disabled={processing}
                      className="btn-danger w-full"
                    >
                      却下する
                    </button>
                  )}
                </>
              )}

              {selected.status === 'confirmed' && !isPast(new Date(`${selected.reservation_date}T${selected.end_time}`)) && (
                confirmAction === 'complete' ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm text-orange-700 font-medium text-center">予約を完了にしますか？（枠が解放されます）</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmAction(null)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        戻る
                      </button>
                      <button
                        onClick={() => handleComplete(selected)}
                        disabled={processing}
                        className="flex-1 text-sm bg-orange-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50 transition-colors"
                      >
                        {processing ? '処理中...' : '完了にする'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmAction('complete')}
                    disabled={processing}
                    className="w-full text-sm bg-orange-500 text-white px-4 py-2.5 rounded-xl hover:bg-orange-600 disabled:opacity-50 font-semibold transition-colors"
                  >
                    ✓ 完了にする（枠を解放）
                  </button>
                )
              )}
              <button onClick={closeModal} className="btn-secondary w-full">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending: { cls: 'badge-red', label: '申請中' },
    confirmed: { cls: 'badge-blue', label: '確定' },
    completed: { cls: 'badge-green', label: '完了' },
    cancelled: { cls: 'badge-gray', label: 'キャンセル' },
    rejected: { cls: 'badge-gray', label: '却下' },
  }
  const { cls, label } = map[status] ?? { cls: 'badge-gray', label: status }
  return <span className={cls}>{label}</span>
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-gray-500 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium break-all">{value}</dd>
    </div>
  )
}

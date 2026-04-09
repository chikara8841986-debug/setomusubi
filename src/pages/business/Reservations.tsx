import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Reservation } from '../../types/database'

type ReservationWithHospital = Reservation & {
  hospitals: { name: string } | null
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

type Tab = 'pending' | 'upcoming' | 'past'

export default function BusinessReservations() {
  const { businessId } = useAuth()
  const [reservations, setReservations] = useState<ReservationWithHospital[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReservationWithHospital | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [processing, setProcessing] = useState(false)
  const [actionError, setActionError] = useState('')

  const fetchReservations = useCallback(async () => {
    if (!businessId) return
    const { data } = await supabase
      .from('reservations')
      .select('*, hospitals(name)')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('start_time', { ascending: true })
    setReservations((data as ReservationWithHospital[]) ?? [])
    setLoading(false)
  }, [businessId])

  useEffect(() => {
    fetchReservations()
    if (!businessId) return
    const channel = supabase
      .channel('business-reservations-' + businessId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reservations',
        filter: `business_id=eq.${businessId}`,
      }, fetchReservations)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReservations, businessId])

  const pending = reservations.filter(r => r.status === 'pending')
  const upcoming = reservations.filter(r => {
    if (r.status !== 'confirmed') return false
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

    // If there's a linked slot, try to lock it atomically
    if (r.slot_id) {
      const { data: locked } = await supabase
        .from('availability_slots')
        .update({ is_available: false })
        .eq('id', r.slot_id)
        .eq('is_available', true)
        .select()
        .single()

      if (!locked) {
        // Slot already taken — still allow approval (business can override)
        // Just warn them
        const ok = confirm('この時間帯は既に別の予約で埋まっている可能性があります。\nそれでも承認しますか？')
        if (!ok) { setProcessing(false); return }
      }

      // Auto-reject other pending requests for same slot
      await supabase
        .from('reservations')
        .update({ status: 'rejected' })
        .eq('slot_id', r.slot_id)
        .eq('status', 'pending')
        .neq('id', r.id)
    }

    await supabase.from('reservations').update({ status: 'confirmed' }).eq('id', r.id)

    // Send confirmation email (non-blocking)
    supabase.functions.invoke('send-confirmation', { body: { reservation_id: r.id } })
      .catch(() => {})

    setSelected(null)
    setProcessing(false)
    fetchReservations()
  }

  const handleReject = async (r: ReservationWithHospital) => {
    if (!confirm('この申請を却下しますか？')) return
    setProcessing(true)
    await supabase.from('reservations').update({ status: 'rejected' }).eq('id', r.id)
    // Notify MSW (non-blocking)
    supabase.functions.invoke('send-rejection', { body: { reservation_id: r.id } }).catch(() => {})
    setSelected(null)
    setProcessing(false)
    fetchReservations()
  }

  const handleComplete = async (r: ReservationWithHospital) => {
    if (!confirm('予約を完了にしますか？\n枠が即時解放されます。')) return
    setProcessing(true)
    await supabase.from('reservations').update({ status: 'completed' }).eq('id', r.id)
    if (r.slot_id) {
      await supabase.from('availability_slots').update({ is_available: true }).eq('id', r.slot_id)
    }
    setSelected(null)
    setProcessing(false)
    fetchReservations()
  }

  const list = tab === 'pending' ? pending : tab === 'upcoming' ? upcoming : past

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">予約管理</h1>

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
              tab === key ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                tab === key
                  ? 'bg-white text-blue-600'
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
           tab === 'upcoming' ? '確定済みの予約はありません' : '過去の予約はありません'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(r => (
            <button key={r.id} onClick={() => { setSelected(r); setActionError('') }}
              className="card w-full text-left hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.hospitals?.name ?? '—'} ／ {r.contact_name}</p>
                  <p className="text-xs text-gray-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                </div>
                <StatusBadge status={r.status} />
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
                <h3 className="font-semibold text-gray-900">予約詳細</h3>
                <StatusBadge status={selected.status} />
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <dl className="space-y-3 text-sm">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              <Row label="病院" value={selected.hospitals?.name ?? '—'} />
              <Row label="担当者" value={selected.contact_name} />
              <Row label="患者氏名" value={selected.patient_name} />
              <Row label="乗車地" value={selected.patient_address} />
              <Row label="目的地" value={selected.destination} />
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment]} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
            </dl>

            {actionError && <p className="text-xs text-red-600 mt-3">{actionError}</p>}

            <div className="mt-4 space-y-2">
              {selected.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(selected)}
                    disabled={processing}
                    className="btn-primary w-full"
                  >
                    {processing ? '処理中...' : '✓ 承認する（予約を確定）'}
                  </button>
                  <button
                    onClick={() => handleReject(selected)}
                    disabled={processing}
                    className="btn-danger w-full"
                  >
                    却下する
                  </button>
                </>
              )}
              {selected.status === 'confirmed' && !isPast(new Date(`${selected.reservation_date}T${selected.end_time}`)) && (
                <button
                  onClick={() => handleComplete(selected)}
                  disabled={processing}
                  className="w-full text-sm bg-orange-500 text-white px-4 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
                >
                  {processing ? '処理中...' : '✓ 完了にする（枠を解放）'}
                </button>
              )}
              <button onClick={() => setSelected(null)} className="btn-secondary w-full">閉じる</button>
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

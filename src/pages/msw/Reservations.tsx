import { useState, useEffect } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Reservation } from '../../types/database'

type ReservationWithBusiness = Reservation & {
  businesses: { name: string; cancel_phone: string | null } | null
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

export default function MswReservations() {
  const { hospitalId } = useAuth()
  const [reservations, setReservations] = useState<ReservationWithBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<ReservationWithBusiness | null>(null)
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    if (!hospitalId) return
    supabase
      .from('reservations')
      .select('*, businesses(name, cancel_phone)')
      .eq('hospital_id', hospitalId)
      .order('reservation_date', { ascending: false })
      .order('start_time', { ascending: false })
      .then(({ data }) => {
        setReservations((data as ReservationWithBusiness[]) ?? [])
        setLoading(false)
      })
  }, [hospitalId])

  const upcoming = reservations.filter(r => {
    const dt = new Date(`${r.reservation_date}T${r.end_time}`)
    return !isPast(dt) && r.status === 'confirmed'
  })
  const past = reservations.filter(r => {
    const dt = new Date(`${r.reservation_date}T${r.end_time}`)
    return isPast(dt) || r.status !== 'confirmed'
  })

  const list = tab === 'upcoming' ? upcoming : past

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">予約履歴</h1>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('upcoming')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'upcoming' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          今後の予約 ({upcoming.length})
        </button>
        <button
          onClick={() => setTab('past')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'past' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          過去の予約 ({past.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {tab === 'upcoming' ? '今後の予約はありません' : '過去の予約はありません'}
        </div>
      ) : (
        <div className="space-y-2">
          {list.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="card w-full text-left hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{r.businesses?.name ?? '—'}</p>
                  <p className="text-xs text-gray-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                </div>
                <span className={
                  r.status === 'confirmed' ? 'badge-blue' :
                  r.status === 'completed' ? 'badge-green' : 'badge-gray'
                }>
                  {r.status === 'confirmed' ? '確定' : r.status === 'completed' ? '完了' : 'キャンセル'}
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
              <h3 className="font-semibold text-gray-900">予約詳細</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              <Row label="事業所" value={selected.businesses?.name ?? '—'} />
              <Row label="担当者" value={selected.contact_name} />
              <Row label="患者氏名" value={selected.patient_name} />
              <Row label="乗車地" value={selected.patient_address} />
              <Row label="目的地" value={selected.destination} />
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment]} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
            </dl>

            {selected.status === 'confirmed' && selected.businesses?.cancel_phone && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-4">
                <p className="text-xs font-medium text-amber-800 mb-1">キャンセルの場合は直接お電話ください</p>
                <a href={`tel:${selected.businesses.cancel_phone}`} className="text-base font-bold text-amber-900">
                  📞 {selected.businesses.cancel_phone}
                </a>
              </div>
            )}

            <button onClick={() => setSelected(null)} className="btn-secondary w-full mt-4">閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-gray-500 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
  )
}

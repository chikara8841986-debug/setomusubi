import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { jstTodayStr, jstMonthStr, jstMonthLabel } from '../../lib/jst'
import type { Reservation, ReservationStatus } from '../../types/database'

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

const STATUS_LABELS: Record<string, string> = {
  pending: '申請中',
  confirmed: '確定',
  completed: '完了',
  cancelled: 'キャンセル',
  rejected: '却下',
}

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-red',
  confirmed: 'badge-blue',
  completed: 'badge-green',
  cancelled: 'badge-gray',
  rejected: 'badge-gray',
}

type ReservationFull = Reservation & {
  businesses: { name: string } | null
  hospitals: { name: string } | null
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング',
  stretcher: 'ストレッチャー',
}

function exportCSV(reservations: ReservationFull[]) {
  const header = ['予約日', '開始時間', '終了時間', '事業所名', '病院名', '担当者', '患者氏名', '乗車地', '目的地', '使用機材', '機材貸出', 'ステータス', '備考', '作成日時']
  const rows = reservations.map(r => [
    r.reservation_date,
    r.start_time.slice(0, 5),
    r.end_time.slice(0, 5),
    r.businesses?.name ?? '',
    r.hospitals?.name ?? '',
    r.contact_name,
    r.patient_name,
    r.patient_address,
    r.destination,
    EQUIPMENT_LABELS[r.equipment] ?? r.equipment,
    r.equipment_rental ? 'あり' : 'なし',
    STATUS_LABELS[r.status] ?? r.status,
    r.notes ?? '',
    r.created_at.slice(0, 16).replace('T', ' '),
  ])
  const csv = [header, ...rows].map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\r\n')
  const bom = '\uFEFF'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reservations_${jstTodayStr()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const STATUS_OPTIONS = [
  { value: '', label: 'すべて' },
  { value: 'pending', label: '申請中' },
  { value: 'confirmed', label: '確定' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: 'キャンセル' },
  { value: 'rejected', label: '却下' },
]

export default function AdminReservations() {
  const [reservations, setReservations] = useState<ReservationFull[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [statusFilter, setStatusFilter] = useState('')
  const [monthFilter, setMonthFilter] = useState(() => jstMonthStr(0))
  const [nameSearch, setNameSearch] = useState('')
  const [selected, setSelected] = useState<ReservationFull | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [statusUpdateError, setStatusUpdateError] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const loadReservations = async () => {
    setLoading(true)
    setLoadError(false)
    let query = supabase
      .from('reservations')
      .select('*, businesses(name), hospitals(name)')
      .order('reservation_date', { ascending: false })
      .order('start_time', { ascending: false })

    if (monthFilter) {
      const [y, m] = monthFilter.split('-').map(Number)
      const from = `${y}-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(y, m, 0).getDate()
      const to = `${y}-${String(m).padStart(2, '0')}-${lastDay}`
      query = query.gte('reservation_date', from).lte('reservation_date', to)
    }
    if (statusFilter) {
      query = query.eq('status', statusFilter as ReservationStatus)
    }

    const { data, error } = await query
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((data as ReservationFull[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { loadReservations() }, [statusFilter, monthFilter])

  const handleStatusUpdate = async (newStatus: ReservationStatus) => {
    if (!selected) return
    setUpdatingStatus(true)
    setStatusUpdateError('')
    const { error } = await supabase
      .from('reservations')
      .update({ status: newStatus })
      .eq('id', selected.id)
    if (error) {
      setStatusUpdateError('更新に失敗しました')
      setUpdatingStatus(false)
      return
    }
    setSelected(prev => prev ? { ...prev, status: newStatus } : null)
    setReservations(prev => prev.map(r => r.id === selected.id ? { ...r, status: newStatus } : r))
    setUpdatingStatus(false)
  }

  const q = nameSearch.trim().toLowerCase()
  const filtered = q
    ? reservations.filter(r =>
        r.patient_name.toLowerCase().includes(q) ||
        (r.businesses?.name ?? '').toLowerCase().includes(q) ||
        (r.hospitals?.name ?? '').toLowerCase().includes(q) ||
        r.contact_name.toLowerCase().includes(q)
      )
    : reservations

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">全予約一覧</h1>
      <p className="text-xs text-gray-400 mb-4">全事業所・全病院の予約を確認できます</p>

      {/* Filters + Export */}
      <div className="flex flex-wrap gap-2 mb-4">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMonthFilter('')}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              monthFilter === ''
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
            }`}
          >全期間</button>
          {monthFilter !== '' && (<>
            <button
              onClick={() => {
                const [y, m] = monthFilter.split('-').map(Number)
                const d = new Date(y, m - 2, 1)
                setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }}
              className="px-2 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:border-teal-300 transition-colors"
              title="前月"
            >‹</button>
            <input
              type="month"
              className="input-base w-auto"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
            />
            <button
              onClick={() => {
                const [y, m] = monthFilter.split('-').map(Number)
                const d = new Date(y, m, 1)
                setMonthFilter(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
              }}
              className="px-2 py-1.5 rounded-lg text-sm border border-gray-200 bg-white text-gray-600 hover:border-teal-300 transition-colors"
              title="翌月"
            >›</button>
            {monthFilter !== jstMonthStr(0) && (
              <button
                onClick={() => setMonthFilter(jstMonthStr(0))}
                className="px-2.5 py-1.5 rounded-lg text-xs border border-teal-300 text-teal-600 bg-teal-50 hover:bg-teal-100 transition-colors"
              >{jstMonthLabel(0)}</button>
            )}
          </>)}
        </div>
        {filtered.length > 0 && (
          <button
            onClick={() => exportCSV(filtered)}
            className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
            title={q ? `絞り込み結果 ${filtered.length}件をエクスポート` : `${filtered.length}件をエクスポート`}
          >
            ↓ CSV{q ? ` (${filtered.length})` : ''}
          </button>
        )}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex-shrink-0 ${
                statusFilter === opt.value
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Name search */}
      {!loading && !loadError && reservations.length > 0 && (
        <div className="mb-3 relative">
          <input
            type="text"
            className="input-base pr-8"
            placeholder="患者名・事業所名・病院名で絞り込み..."
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
          />
          {nameSearch && (
            <button
              onClick={() => setNameSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"
            >×</button>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : loadError ? (
        <div className="card text-center py-10">
          <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
          <button onClick={loadReservations} className="btn-secondary text-sm">再試行</button>
        </div>
      ) : reservations.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">予約が見つかりません</div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">該当する予約がありません</div>
      ) : (
        <>
          <p className="text-xs text-gray-400 mb-2">
            {filtered.length}件{q && reservations.length !== filtered.length ? ` / 全${reservations.length}件` : ''}
          </p>
          <div className="space-y-2">
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => setSelected(r)}
                className="card w-full text-left hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                    </p>
                    <p className="text-xs text-gray-600 mt-0.5 truncate">
                      {r.businesses?.name ?? '—'} ← {r.hospitals?.name ?? '—'}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment] ?? r.equipment}</p>
                  </div>
                  <span className={`flex-shrink-0 ${STATUS_BADGE[r.status] ?? 'badge-gray'}`}>
                    {STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </>
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
              <Row label="ステータス" value={STATUS_LABELS[selected.status] ?? selected.status} />
              <Row label="事業所" value={selected.businesses?.name ?? '—'} />
              <Row label="病院" value={selected.hospitals?.name ?? '—'} />
              <Row label="担当者" value={selected.contact_name} />
              <Row label="患者氏名" value={selected.patient_name} />
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0">乗車地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
                  <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.patient_address}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.patient_address).catch(() => {})}
                    className="ml-1 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0">目的地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
                  <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.destination}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.destination).catch(() => {})}
                    className="ml-1 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment] ?? selected.equipment} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
              <Row label="作成日時" value={format(parseISO(selected.created_at), 'yyyy/M/d HH:mm', { locale: ja })} />
            </dl>
            <div className="mt-5 border-t pt-4">
              <p className="text-xs text-gray-500 font-medium mb-2">ステータスを変更</p>
              <div className="flex flex-wrap gap-1.5">
                {(['pending', 'confirmed', 'completed', 'cancelled', 'rejected'] as ReservationStatus[]).map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusUpdate(s)}
                    disabled={updatingStatus || selected.status === s}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors disabled:opacity-40 ${
                      selected.status === s
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-default'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-teal-400 hover:text-teal-700'
                    }`}
                  >
                    {updatingStatus ? '...' : STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              {statusUpdateError && <p className="text-xs text-red-600 mt-1">{statusUpdateError}</p>}
            </div>
            <button onClick={() => { setSelected(null); setStatusUpdateError('') }} className="btn-secondary w-full mt-3">閉じる</button>
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
      <dd className="text-gray-900 font-medium break-all">{value}</dd>
    </div>
  )
}

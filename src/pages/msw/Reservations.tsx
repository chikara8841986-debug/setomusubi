import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Reservation } from '../../types/database'

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
  rejected:  { cls: 'badge-gray', label: '却下' },
}

type Tab = 'active' | 'past'

export default function MswReservations() {
  const { hospitalId } = useAuth()
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
  const [nameSearch, setNameSearch] = useState('')
  const [pastStatusFilter, setPastStatusFilter] = useState<'' | 'completed' | 'cancelled' | 'rejected'>('')

  const fetchReservations = useCallback(async () => {
    if (!hospitalId) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, businesses(name, cancel_phone)')
      .eq('hospital_id', hospitalId)
      .order('reservation_date', { ascending: false })
      .order('start_time', { ascending: false })
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((data as ReservationWithBusiness[]) ?? [])
    setLoading(false)
  }, [hospitalId])

  // ESCキーでモーダルを閉じる
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setSelected(null); setShowCancelConfirm(false) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    fetchReservations()
    if (!hospitalId) return
    const channel = supabase
      .channel('msw-reservations-' + hospitalId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'reservations',
        filter: `hospital_id=eq.${hospitalId}`,
      }, (payload) => {
        if (payload.new?.status === 'confirmed') {
          showToast('予約が確定されました', 'info')
        } else if (payload.new?.status === 'rejected') {
          showToast('申請が却下されました', 'error')
        }
        fetchReservations()
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'reservations',
        filter: `hospital_id=eq.${hospitalId}`,
      }, fetchReservations)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchReservations, hospitalId])

  // Active: pending + confirmed future
  const active = reservations.filter(r => {
    if (r.status === 'pending') return true
    if (r.status === 'confirmed') {
      return !isPast(new Date(`${r.reservation_date}T${r.end_time}`))
    }
    return false
  })

  const switchTab = (t: Tab) => {
    setTab(t)
    setNameSearch('')
    if (t !== 'past') setPastStatusFilter('')
  }

  // Past: confirmed past + completed + cancelled + rejected
  const past = reservations.filter(r => {
    if (r.status === 'pending') return false
    if (r.status === 'confirmed') {
      return isPast(new Date(`${r.reservation_date}T${r.end_time}`))
    }
    return true
  })

  // 進行中は直近の予約が先頭になるよう昇順ソート
  const pastFiltered = pastStatusFilter ? past.filter(r => r.status === pastStatusFilter) : past
  const sorted = tab === 'active'
    ? [...active].sort((a, b) => {
        const da = `${a.reservation_date}T${a.start_time}`
        const db = `${b.reservation_date}T${b.start_time}`
        return da.localeCompare(db)
      })
    : pastFiltered
  const q = nameSearch.trim().toLowerCase()
  const list = q
    ? sorted.filter(r =>
        r.patient_name.toLowerCase().includes(q) ||
        (r.businesses?.name ?? '').toLowerCase().includes(q) ||
        r.contact_name.toLowerCase().includes(q)
      )
    : sorted

  const handleCancel = async (r: ReservationWithBusiness) => {
    setShowCancelConfirm(false)
    setCancelling(true)
    setCancelError('')
    await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', r.id)
    if (r.slot_id && r.status === 'confirmed') {
      // confirmed_count を1減らし、is_available を true に戻す
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
    // 確定済みキャンセルは事業所へメール通知
    if (r.status === 'confirmed') {
      supabase.functions.invoke('send-cancellation', { body: { reservation_id: r.id } }).catch(() => {})
    }
    setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'cancelled' as const } : x))
    setCancelling(false)
    setSelected(null)
    showToast('予約をキャンセルしました', 'error')
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
      <h1 className="text-xl font-bold text-gray-900 mb-4">予約履歴</h1>

      <div className="flex gap-2 mb-4">
        <button onClick={() => switchTab('active')}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'active' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
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
            tab === 'past' ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}>
          過去の予約
          {past.length > 0 && (
            <span className={`text-xs opacity-60`}>({past.length})</span>
          )}
        </button>
      </div>

      {/* Past tab status filter chips */}
      {tab === 'past' && past.length > 0 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto">
          {([
            { value: '' as const, label: 'すべて', count: past.length },
            { value: 'completed' as const, label: '完了', count: past.filter(r => r.status === 'completed').length },
            { value: 'cancelled' as const, label: 'キャンセル', count: past.filter(r => r.status === 'cancelled').length },
            { value: 'rejected' as const, label: '却下', count: past.filter(r => r.status === 'rejected').length },
          ].filter(o => o.value === '' || o.count > 0)).map(opt => (
            <button
              key={opt.value}
              onClick={() => { setPastStatusFilter(opt.value); setNameSearch('') }}
              className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap flex-shrink-0 ${
                pastStatusFilter === opt.value
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-teal-300'
              }`}
            >
              {opt.label}
              {opt.count > 0 && <span className={`text-[10px] ${pastStatusFilter === opt.value ? 'opacity-80' : 'text-gray-400'}`}>({opt.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Pending notice */}
      {tab === 'active' && active.some(r => r.status === 'pending') && (() => {
        const pendingList = active.filter(r => r.status === 'pending')
        const oldest = pendingList.reduce((a, b) =>
          new Date(a.created_at) < new Date(b.created_at) ? a : b
        )
        const hrs = (Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60)
        const elapsed = hrs < 1 ? '〜1時間以内' : hrs < 24 ? `${Math.floor(hrs)}時間前` : `${Math.floor(hrs / 24)}日前`
        const isLong = hrs >= 12
        return (
          <div className={`mb-3 rounded-xl px-4 py-3 text-xs border ${isLong ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <p className="font-medium">申請中の仮予約が{pendingList.length}件あります</p>
            <p className="mt-0.5">
              最も古い申請: {elapsed}
              {isLong ? ' — 事業所に直接確認することをお勧めします' : ' — 事業所が確認次第、承認・却下の通知が来ます'}
            </p>
          </div>
        )
      })()}

      {/* Name search */}
      {((tab === 'past' && past.length > 0) || (tab === 'active' && active.length > 2)) && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              className="input-base pr-8"
              placeholder="患者名・事業所名・担当者名で絞り込み..."
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
          {q && (
            <p className="text-xs text-gray-400 mt-1">
              {list.length}件 / 全{tab === 'active' ? active.length : pastFiltered.length}件
            </p>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card text-center py-12">
          {q ? (
            <>
              <div className="text-4xl mb-2">🔍</div>
              <p className="text-slate-500 text-sm font-medium mb-1">「{q}」に一致する予約がありません</p>
              <button onClick={() => setNameSearch('')} className="mt-2 text-xs text-teal-600 hover:underline">
                検索をクリア
              </button>
            </>
          ) : (
            tab === 'active' ? (
              <>
                <div className="text-4xl mb-3">📋</div>
                <p className="text-slate-500 text-sm font-medium mb-1">進行中の予約はありません</p>
                <p className="text-xs text-slate-400 mb-4">空き枠のある事業所を検索して予約申請しましょう</p>
                <button
                  onClick={() => navigate('/msw/search')}
                  className="btn-primary text-sm"
                >
                  空き事業所を検索する →
                </button>
              </>
            ) : pastStatusFilter ? (
              <>
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-slate-500 text-sm font-medium mb-2">該当する過去の予約がありません</p>
                <button onClick={() => setPastStatusFilter('')} className="text-xs text-teal-600 hover:underline">
                  絞り込みをクリア
                </button>
              </>
            ) : (
              <>
                <div className="text-4xl mb-2">🗂️</div>
                <p className="text-slate-500 text-sm font-medium">過去の予約はありません</p>
              </>
            )
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
                    <p className="text-sm font-semibold text-gray-900">
                      {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.businesses?.name ?? '—'} ／ 担当: {r.contact_name}</p>
                    <p className="text-xs text-gray-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
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
                <h3 className="font-semibold text-gray-900">予約詳細</h3>
                <span className={STATUS_MAP[selected.status]?.cls ?? 'badge-gray'}>
                  {STATUS_MAP[selected.status]?.label ?? selected.status}
                </span>
              </div>
              <button onClick={() => { setSelected(null); setShowCancelConfirm(false) }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {selected.status === 'pending' && (() => {
              const hrs = (Date.now() - new Date(selected.created_at).getTime()) / (1000 * 60 * 60)
              const elapsed = hrs < 1 ? '〜1時間以内' : hrs < 24 ? `${Math.floor(hrs)}時間前` : `${Math.floor(hrs / 24)}日前`
              const isLong = hrs >= 12
              return (
                <div className={`rounded-lg px-3 py-2 mb-4 text-xs border ${isLong ? 'bg-orange-50 border-orange-200 text-orange-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
                  <p className="font-medium">申請から {elapsed}</p>
                  <p className="mt-0.5">{isLong ? '事業所への直接連絡をお勧めします。' : '事業所が確認後に承認・却下を行います。'}</p>
                </div>
              )
            })()}
            {selected.status === 'rejected' && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 mb-4 text-xs text-gray-600 space-y-2">
                <p>この申請は事業所により却下されました。別の事業所をお探しください。</p>
                <button
                  onClick={() => navigate('/msw/search', {
                    state: {
                      prefill: {
                        patientName: selected.patient_name,
                        patientAddress: selected.patient_address,
                        destination: selected.destination,
                        equipment: selected.equipment,
                        equipmentRental: selected.equipment_rental,
                        notes: selected.notes ?? '',
                        contactName: selected.contact_name,
                      },
                      searchPrefill: {
                        date: selected.reservation_date,
                        startTime: selected.start_time.slice(0, 5),
                        endTime: selected.end_time.slice(0, 5),
                      },
                    }
                  })}
                  className="w-full text-center text-xs font-medium text-teal-700 bg-teal-50 border border-teal-200 rounded-lg py-1.5 hover:bg-teal-100 transition-colors"
                >
                  別の事業所を探して申請する →
                </button>
              </div>
            )}

            <dl className="space-y-3 text-sm">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              <Row label="事業所" value={selected.businesses?.name ?? '—'} />
              <Row label="担当者" value={selected.contact_name} />
              <Row label="患者氏名" value={selected.patient_name} />
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0 text-sm">乗車地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
                  <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.patient_address}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.patient_address).catch(() => {})}
                    className="ml-2 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              <div className="flex gap-3">
                <dt className="text-gray-500 w-20 flex-shrink-0 text-sm">目的地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
                  <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer"
                    className="text-teal-700 hover:underline break-all">
                    📍 {selected.destination}
                  </a>
                  <button onClick={() => navigator.clipboard.writeText(selected.destination).catch(() => {})}
                    className="ml-2 text-[10px] text-gray-400 hover:text-gray-600 border border-gray-200 px-1.5 py-0.5 rounded">
                    コピー
                  </button>
                </dd>
              </div>
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment]} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {selected.notes && <Row label="備考" value={selected.notes} />}
            </dl>

            {selected.businesses?.cancel_phone && (selected.status === 'pending' || selected.status === 'confirmed') && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mt-4">
                <p className="text-xs font-medium text-teal-800 mb-1">
                  {selected.status === 'pending' ? '急ぎの場合は直接お電話ください' : 'キャンセルの場合は直接お電話ください'}
                </p>
                <a href={`tel:${selected.businesses.cancel_phone}`} className="text-base font-bold text-teal-900">
                  📞 {selected.businesses.cancel_phone}
                </a>
              </div>
            )}

            {cancelError && <p className="text-xs text-red-600 mt-2">{cancelError}</p>}

            {/* Re-apply with same content (only for completed/cancelled) */}
            {(selected.status === 'completed' || selected.status === 'cancelled') && (
              <button
                onClick={() => {
                  navigate('/msw/search', {
                    state: {
                      prefill: {
                        patientName: selected.patient_name,
                        patientAddress: selected.patient_address,
                        destination: selected.destination,
                        equipment: selected.equipment,
                        equipmentRental: selected.equipment_rental,
                        notes: selected.notes ?? '',
                        contactName: selected.contact_name,
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
      <dt className="text-gray-500 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-gray-900 font-medium break-all">{value}</dd>
    </div>
  )
}



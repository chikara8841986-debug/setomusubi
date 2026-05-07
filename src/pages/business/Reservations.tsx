import { useState, useEffect, useCallback } from 'react'
import { format, parseISO, isPast } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { isTodayJST, jstTodayStr } from '../../lib/jst'
import type { Reservation } from '../../types/database'

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

type ReservationWithHospital = Reservation & {
  hospitals: { name: string; phone: string | null } | null
}

type PhoneForm = {
  date: string
  startTime: string
  endTime: string
  patientName: string
  patientAddress: string
  destination: string
  equipment: string
  equipmentRental: boolean
  callerName: string
  callerPhone: string
  notes: string
}

const EMPTY_PHONE_FORM: PhoneForm = {
  date: '',
  startTime: '',
  endTime: '',
  patientName: '',
  patientAddress: '',
  destination: '',
  equipment: 'wheelchair',
  equipmentRental: false,
  callerName: '',
  callerPhone: '',
  notes: '',
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
  const [nameSearch, setNameSearch] = useState('')
  const [pastStatusFilter, setPastStatusFilter] = useState<'' | 'completed' | 'cancelled' | 'rejected'>('')
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneForm, setPhoneForm] = useState<PhoneForm>({ ...EMPTY_PHONE_FORM, date: jstTodayStr() })
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  const fetchReservations = useCallback(async () => {
    if (!businessId) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('reservations')
      .select('*, hospitals(name, phone)')
      .eq('business_id', businessId)
      .order('reservation_date', { ascending: true })
      .order('start_time', { ascending: true })
    if (error) { setLoadError(true); setLoading(false); return }
    setReservations((data as unknown as ReservationWithHospital[]) ?? [])
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
      if (e.key === 'Escape') {
        setSelected(null); setConfirmAction(null)
        setShowPhoneModal(false); setPhoneError('')
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // 初回ロード後: 最も有用なタブに自動切替
  useEffect(() => {
    if (loading || initialTabSet) return
    setInitialTabSet(true)
    const pendingCount = reservations.filter(r => r.status === 'pending').length
    const todayCount = reservations.filter(r =>
      r.status === 'confirmed' && isTodayJST(r.reservation_date)
    ).length
    const upcomingCount = reservations.filter(r => {
      if (r.status !== 'confirmed') return false
      if (isTodayJST(r.reservation_date)) return false
      const dt = new Date(`${r.reservation_date}T${r.end_time}`)
      return !isPast(dt)
    }).length
    if (pendingCount > 0) return // 申請中優先（デフォルトタブ）
    if (todayCount > 0) { setTab('today'); return }
    if (upcomingCount > 0) setTab('upcoming')
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

    // approve_reservation RPC: トランザクションで slot.confirmed_count++ /
    // 満車時の自動却下 / status='confirmed' をまとめて行う
    const { data, error } = await supabase.rpc('approve_reservation', { p_reservation_id: r.id })
    if (error) {
      setActionError('承認に失敗しました。再試行してください。')
      setProcessing(false)
      return
    }
    const autoRejectedCount: number = typeof data === 'number' ? data : 0
    supabase.functions.invoke('send-confirmation', { body: { reservation_id: r.id } }).catch(() => {})

    closeModal()
    setProcessing(false)
    if (autoRejectedCount > 0) {
      showToast(`予約を承認しました。満車のため他${autoRejectedCount}件の申請を自動却下しました`, 'info')
    } else {
      showToast('予約を承認しました')
    }
    fetchReservations()
  }

  const handleReject = async (r: ReservationWithHospital) => {
    setProcessing(true)
    setActionError('')
    const { error } = await supabase.rpc('reject_reservation', { p_reservation_id: r.id })
    if (error) {
      setActionError('却下に失敗しました。再試行してください。')
      setProcessing(false)
      return
    }
    // 却下時は occupied_slot も削除（仮押さえを解放）
    await supabase.from('occupied_slots').delete().eq('reservation_id', r.id)
    supabase.functions.invoke('send-rejection', { body: { reservation_id: r.id } }).catch(() => {})
    closeModal()
    setProcessing(false)
    showToast('申請を却下しました', 'error')
    fetchReservations()
  }

  const handleComplete = async (r: ReservationWithHospital) => {
    setProcessing(true)
    setActionError('')
    const { error } = await supabase.rpc('complete_reservation', { p_reservation_id: r.id })
    if (error) {
      setActionError('完了処理に失敗しました。再試行してください。')
      setProcessing(false)
      return
    }
    closeModal()
    setProcessing(false)
    showToast('完了にしました')
    fetchReservations()
  }

  const handlePhoneSubmit = async () => {
    const f = phoneForm
    if (!businessId) return
    if (!f.date || !f.startTime || !f.endTime) { setPhoneError('日付と時間を入力してください'); return }
    if (f.startTime >= f.endTime) { setPhoneError('終了時間は開始時間より後にしてください'); return }
    if (!f.patientName.trim()) { setPhoneError('患者氏名を入力してください'); return }
    if (!f.patientAddress.trim()) { setPhoneError('乗車地を入力してください'); return }
    if (!f.destination.trim()) { setPhoneError('目的地を入力してください'); return }

    setPhoneSaving(true); setPhoneError('')

    // create_phone_reservation RPC: スロット作成と予約作成をトランザクションで実行
    const { error } = await supabase.rpc('create_phone_reservation', {
      p_date: f.date,
      p_start_time: f.startTime + ':00',
      p_end_time: f.endTime + ':00',
      p_caller_name: f.callerName,
      p_caller_phone: f.callerPhone,
      p_patient_name: f.patientName,
      p_patient_address: f.patientAddress,
      p_destination: f.destination,
      p_equipment: f.equipment as 'wheelchair' | 'reclining_wheelchair' | 'stretcher',
      p_equipment_rental: f.equipmentRental,
      p_notes: f.notes,
    })

    setPhoneSaving(false)
    if (error) {
      setPhoneError('予約の登録に失敗しました。再試行してください。')
      return
    }

    setShowPhoneModal(false)
    setPhoneForm({ ...EMPTY_PHONE_FORM, date: jstTodayStr() })
    showToast('電話予約を記録しました')
    fetchReservations()
  }

  // 過去タブは直近が先頭（降順）
  const pastFiltered = pastStatusFilter ? past.filter(r => r.status === pastStatusFilter) : past
  const rawList = tab === 'pending' ? pending
    : tab === 'today' ? today
    : tab === 'upcoming' ? upcoming
    : [...pastFiltered].reverse()
  const nq = nameSearch.trim().toLowerCase()
  const list = nq
    ? rawList.filter(r =>
        r.patient_name.toLowerCase().includes(nq) ||
        (r.hospitals?.name ?? '').toLowerCase().includes(nq) ||
        r.contact_name.toLowerCase().includes(nq)
      )
    : rawList

  if (loading) return <div className="flex flex-col items-center justify-center py-16 gap-3"><span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p></div>
  if (loadError) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-2">😵</div><p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchReservations} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-slate-800">予約管理</h1>
        <button
          onClick={() => { setShowPhoneModal(true); setPhoneError('') }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 transition-colors"
        >
          📞 電話予約を記録
        </button>
      </div>
      <p className="text-xs text-slate-400 mb-4">「申請中」タブにMSWからの仮予約が届きます。承認すると予約が確定し、MSWへ通知メールが送られます。</p>

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
            onClick={() => { setTab(key); setNameSearch(''); if (key !== 'past') setPastStatusFilter('') }}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === key ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300'
            }`}
          >
            {label}
            {count > 0 && (
              <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                tab === key
                  ? 'bg-white text-teal-600'
                  : alert ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Past tab status filter */}
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
                  : 'bg-white text-slate-500 border-slate-200 hover:border-teal-300'
              }`}
            >
              {opt.label}
              {opt.count > 0 && <span className={`text-[10px] ${pastStatusFilter === opt.value ? 'opacity-80' : 'text-slate-400'}`}>({opt.count})</span>}
            </button>
          ))}
        </div>
      )}

      {/* Name search (all tabs with > 2 items) */}
      {rawList.length > 2 && (
        <div className="mb-3">
          <div className="relative">
            <input
              type="text"
              className="input-base pr-8"
              placeholder="患者名・病院名・担当者名で絞り込み..."
              value={nameSearch}
              onChange={e => setNameSearch(e.target.value)}
            />
            {nameSearch && (
              <button
                onClick={() => setNameSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 w-5 h-5 flex items-center justify-center" aria-label="閉じる"
              >×</button>
            )}
          </div>
          {nq && (
            <p className="text-xs text-slate-400 mt-1">
              {list.length}件 / 全{rawList.length}件
            </p>
          )}
        </div>
      )}

      {/* Pending notice */}
      {tab === 'pending' && pending.length > 0 && (() => {
        const oldest = pending.reduce((a, b) =>
          new Date(a.created_at) < new Date(b.created_at) ? a : b
        )
        const hoursOldest = Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60))
        const isUrgent = hoursOldest >= 6
        return (
          <div className={`mb-3 rounded-xl px-4 py-3 text-sm border ${isUrgent ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            <p className="font-medium">仮予約申請が{pending.length}件届いています</p>
            <p className={`text-xs mt-0.5 ${isUrgent ? 'text-red-700' : 'text-amber-700'}`}>
              最も古い申請: {hoursOldest < 1 ? '1時間以内' : hoursOldest < 24 ? `${hoursOldest}時間経過` : `${Math.floor(hoursOldest / 24)}日経過`}
              {isUrgent && ' — お早めにご対応ください'}
            </p>
          </div>
        )
      })()}

      {list.length === 0 ? (
        <div className="card text-center py-12">
          {nq ? (
            <>
              <div className="text-4xl mb-2">🔍</div>
              <p className="text-slate-500 text-sm font-medium mb-2">「{nq}」に一致する予約がありません</p>
              <button onClick={() => setNameSearch('')} className="text-xs text-teal-600 hover:underline">
                検索をクリア
              </button>
            </>
          ) : tab === 'pending' ? (
            <>
              <div className="text-4xl mb-3">📭</div>
              <p className="text-slate-500 text-sm font-medium mb-1">新しい申請はありません</p>
              <p className="text-xs text-slate-400 mb-4">カレンダーに空き枠を追加するとMSWから申請が届きます</p>
              <Link to="/business/calendar" className="btn-primary text-sm inline-flex items-center gap-1">
                📅 カレンダーで空き枠を追加
              </Link>
            </>
          ) : tab === 'today' ? (
            <>
              <div className="text-4xl mb-2">☀️</div>
              <p className="text-slate-500 text-sm font-medium">今日の予約はありません</p>
            </>
          ) : tab === 'upcoming' ? (
            <>
              <div className="text-4xl mb-3">📆</div>
              <p className="text-slate-500 text-sm font-medium mb-1">確定済みの予約はありません</p>
              <Link to="/business/calendar" className="mt-2 inline-block text-xs text-teal-600 hover:underline">
                カレンダーで空き枠を確認する →
              </Link>
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
          )}
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
            const hoursElapsed = r.status === 'pending'
              ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60))
              : null
            return (
            <div key={r.id} className={`card hover:shadow-md transition-shadow ${
              hoursElapsed !== null && hoursElapsed >= 12 ? 'border-red-200' :
              hoursElapsed !== null && hoursElapsed >= 6 ? 'border-orange-200' : ''
            }`}>
              <div className="flex items-start justify-between gap-2">
                <button className="flex-1 text-left min-w-0" onClick={() => openModal(r)}>
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5 flex-wrap">
                    {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time.slice(0, 5)}〜{r.end_time.slice(0, 5)}
                    {r.source === 'phone' && <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">📞 電話</span>}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {r.source === 'phone' ? (r.caller_name || '電話予約') : (r.hospitals?.name ?? '—')} ／ {r.contact_name}
                  </p>
                  <p className="text-xs text-slate-600 mt-0.5">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                </button>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <StatusBadge status={r.status} />
                  {hoursElapsed !== null && hoursElapsed >= 6 && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      hoursElapsed >= 12 ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'
                    }`}>
                      {hoursElapsed >= 24 ? `${Math.floor(hoursElapsed / 24)}日経過` : `${hoursElapsed}時間経過`}
                    </span>
                  )}
                  {daysUntil !== null && daysUntil > 3 && (
                    <span className="text-[10px] text-teal-600 font-medium">あと{daysUntil}日</span>
                  )}
                  {daysUntil !== null && daysUntil > 0 && daysUntil <= 3 && (
                    <span className="text-[10px] text-amber-600 font-bold">あと{daysUntil}日</span>
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
                  {tab === 'today' && r.status === 'confirmed' && hoursUntil !== null && hoursUntil <= 0 && (
                    <button
                      onClick={e => { e.stopPropagation(); openModal(r); setConfirmAction('complete') }}
                      className="mt-0.5 text-[10px] bg-orange-500 text-white px-2 py-0.5 rounded-full font-medium hover:bg-orange-600 transition-colors"
                    >
                      ✓ 完了
                    </button>
                  )}
                  {tab === 'pending' && r.status === 'pending' && (
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
                <StatusBadge status={selected.status} />
              </div>
              <button onClick={closeModal} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center" aria-label="閉じる">×</button>
            </div>

            {selected.status === 'pending' && (() => {
              const h = Math.floor((Date.now() - new Date(selected.created_at).getTime()) / (1000 * 60 * 60))
              const label = h < 1 ? '〜1時間以内' : h < 24 ? `${h}時間経過` : `${Math.floor(h / 24)}日${h % 24}時間経過`
              const cls = h >= 12 ? 'text-red-600 bg-red-50 border-red-200' : h >= 6 ? 'text-orange-600 bg-orange-50 border-orange-200' : h >= 3 ? 'text-amber-600 bg-amber-50 border-amber-200' : 'text-slate-500 bg-slate-50 border-slate-200'
              return (
                <div className={`mb-3 rounded-lg px-3 py-2 border text-xs font-medium ${cls}`}>
                  申請から {label} — 早めにご対応ください
                </div>
              )
            })()}

            {selected.source === 'phone' && (
              <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-blue-500">📞</span>
                <span className="text-xs text-blue-700 font-medium">電話予約（手動記録）</span>
              </div>
            )}

            <dl className="space-y-3 text-sm">
              <Row label="日時" value={`${format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} ${selected.start_time.slice(0,5)}〜${selected.end_time.slice(0,5)}`} />
              {selected.source === 'phone' ? (
                <>
                  {selected.caller_name && <Row label="連絡者" value={selected.caller_name} />}
                  {selected.caller_phone && (
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">連絡先</dt>
                      <dd className="font-medium text-sm">
                        <a href={`tel:${selected.caller_phone}`} className="text-teal-700 hover:underline">
                          📞 {selected.caller_phone}
                        </a>
                      </dd>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <Row label="病院" value={selected.hospitals?.name ?? '—'} />
                  {selected.hospitals?.phone && (
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">病院電話</dt>
                      <dd className="font-medium text-sm">
                        <a href={`tel:${selected.hospitals.phone}`} className="text-teal-700 hover:underline">
                          📞 {selected.hospitals.phone}
                        </a>
                      </dd>
                    </div>
                  )}
                  <Row label="担当者" value={selected.contact_name} />
                </>
              )}
              <Row label="患者氏名" value={selected.patient_name} />
              <div className="flex gap-3">
                <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">乗車地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
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
                <dt className="text-slate-500 w-20 flex-shrink-0 text-sm">目的地</dt>
                <dd className="font-medium text-sm flex-1 min-w-0">
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
              <Row label="使用機材" value={EQUIPMENT_LABELS[selected.equipment] ?? selected.equipment} />
              <Row label="機材貸出" value={selected.equipment_rental ? 'あり' : 'なし'} />
              {(selected.ward || selected.room_number) && (
                <Row label="病棟・病室" value={[selected.ward, selected.room_number].filter(Boolean).join(' ')} />
              )}
              <Row label="同乗者" value={selected.companion_count === 0 ? 'なし' : `${selected.companion_count}人`} />
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

              {selected.status === 'confirmed' && (
                confirmAction === 'complete' ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                    <p className="text-sm text-orange-700 font-medium text-center">予約を完了にしますか？</p>
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
                    ✓ 完了にする
                  </button>
                )
              )}
              <button onClick={closeModal} className="btn-secondary w-full">閉じる</button>
            </div>
          </div>
        </div>
      )}
      {/* Phone reservation modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">📞 電話予約を記録</h3>
              <button onClick={() => { setShowPhoneModal(false); setPhoneError('') }}
                className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center" aria-label="閉じる">×</button>
            </div>

            <div className="space-y-3">
              {/* 日時 */}
              <div>
                <label className="label">日付<span className="text-red-500 ml-0.5">*</span></label>
                <input type="date" className="input-base"
                  value={phoneForm.date}
                  onChange={e => setPhoneForm(f => ({ ...f, date: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">開始時間<span className="text-red-500 ml-0.5">*</span></label>
                  <input type="time" className="input-base"
                    value={phoneForm.startTime}
                    onChange={e => setPhoneForm(f => ({ ...f, startTime: e.target.value }))} />
                </div>
                <div>
                  <label className="label">終了時間<span className="text-red-500 ml-0.5">*</span></label>
                  <input type="time" className="input-base"
                    value={phoneForm.endTime}
                    onChange={e => setPhoneForm(f => ({ ...f, endTime: e.target.value }))} />
                </div>
              </div>

              {/* 連絡者 */}
              <div>
                <label className="label">連絡者名</label>
                <input type="text" className="input-base" placeholder="例: 田中MSW"
                  value={phoneForm.callerName}
                  onChange={e => setPhoneForm(f => ({ ...f, callerName: e.target.value }))} />
              </div>
              <div>
                <label className="label">連絡先電話</label>
                <input type="tel" className="input-base" placeholder="例: 087-000-0000"
                  value={phoneForm.callerPhone}
                  onChange={e => setPhoneForm(f => ({ ...f, callerPhone: e.target.value }))} />
              </div>

              {/* 患者情報 */}
              <div>
                <label className="label">患者氏名<span className="text-red-500 ml-0.5">*</span></label>
                <input type="text" className="input-base" placeholder="例: 山田 太郎"
                  value={phoneForm.patientName}
                  onChange={e => setPhoneForm(f => ({ ...f, patientName: e.target.value }))} />
              </div>
              <div>
                <label className="label">乗車地<span className="text-red-500 ml-0.5">*</span></label>
                <input type="text" className="input-base" placeholder="例: 香川県高松市〇〇町1-2-3"
                  value={phoneForm.patientAddress}
                  onChange={e => setPhoneForm(f => ({ ...f, patientAddress: e.target.value }))} />
              </div>
              <div>
                <label className="label">目的地<span className="text-red-500 ml-0.5">*</span></label>
                <input type="text" className="input-base" placeholder="例: 高松赤十字病院"
                  value={phoneForm.destination}
                  onChange={e => setPhoneForm(f => ({ ...f, destination: e.target.value }))} />
              </div>

              {/* 機材 */}
              <div>
                <label className="label">使用機材<span className="text-red-500 ml-0.5">*</span></label>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { value: 'wheelchair', label: '車椅子' },
                    { value: 'reclining_wheelchair', label: 'リクライニング' },
                    { value: 'stretcher', label: 'ストレッチャー' },
                  ].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setPhoneForm(f => ({ ...f, equipment: opt.value }))}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        phoneForm.equipment === opt.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'
                      }`}
                    >{opt.label}</button>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="rounded border-slate-300 text-teal-600"
                  checked={phoneForm.equipmentRental}
                  onChange={e => setPhoneForm(f => ({ ...f, equipmentRental: e.target.checked }))} />
                <span className="text-sm text-slate-700">機材貸出あり</span>
              </label>

              {/* 備考 */}
              <div>
                <label className="label">備考</label>
                <textarea className="input-base resize-none" rows={2} placeholder="特記事項など"
                  value={phoneForm.notes}
                  onChange={e => setPhoneForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>

            {phoneError && <p className="text-xs text-red-600 mt-3">{phoneError}</p>}

            <div className="mt-4 flex gap-2">
              <button onClick={() => { setShowPhoneModal(false); setPhoneError('') }} className="btn-secondary flex-1">
                キャンセル
              </button>
              <button onClick={handlePhoneSubmit} disabled={phoneSaving} className="btn-primary flex-1">
                {phoneSaving ? '保存中...' : '記録する'}
              </button>
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
      <dt className="text-slate-500 w-20 flex-shrink-0">{label}</dt>
      <dd className="text-slate-800 font-medium break-all">{value}</dd>
    </div>
  )
}




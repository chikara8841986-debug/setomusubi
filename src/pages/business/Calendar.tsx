import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format, addDays, startOfWeek, isSameDay, parseISO, isBefore, startOfDay, addWeeks } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { jstMonthRange, jstMonthLabel, isTodayJST, jstTodayStr } from '../../lib/jst'
import type { AvailabilitySlot, Reservation, Business } from '../../types/database'

// ────────────────────────────────────────────────
// Grid constants
// ────────────────────────────────────────────────
const GRID_START  = 6                           // 6:00 から表示
const GRID_END    = 22                          // 22:00 まで表示
const TOTAL_SLOTS = (GRID_END - GRID_START) * 2 // 30分単位 × 32スロット
const CELL_H      = 28                          // px / 30-minスロット

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return Math.max(0, Math.min(TOTAL_SLOTS, (h - GRID_START) * 2 + (m >= 30 ? 1 : 0)))
}

function slotToTime(n: number): string {
  const totalMins = n * 30 + GRID_START * 60
  const h  = Math.floor(totalMins / 60)
  const mm = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────
type SlotWithReservation = AvailabilitySlot & {
  reservation?: Array<Reservation & { hospitals: { name: string; phone: string | null } | null }>
}

type DragState = {
  dayIdx:    number
  dateStr:   string
  startSlot: number
  endSlot:   number
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────
const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair:           '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher:            'ストレッチャー',
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

const QUICK_TIMES = [
  { label: '午前', start: '09:00', end: '12:00' },
  { label: '午後', start: '13:00', end: '17:00' },
  { label: '終日', start: '09:00', end: '18:00' },
]

// ────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────
export default function BusinessCalendar() {
  const { businessId, user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  // ── 週ナビゲーション ──
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  // useMemo で weekStart が変わった時だけ再生成（handleCellMouseDown 等の useCallback 安定化）
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  // ── スロットデータ ──
  const [slots,      setSlots]      = useState<SlotWithReservation[]>([])
  const [loading,    setLoading]    = useState(true)
  const [fetchError, setFetchError] = useState(false)

  // ── 事業所プロフィール ──
  const [closedDays,        setClosedDays]        = useState<number[]>([])
  const [bizHoursStart,     setBizHoursStart]     = useState('09:00')
  const [bizHoursEnd,       setBizHoursEnd]       = useState('18:00')
  const [profileIncomplete, setProfileIncomplete] = useState(false)

  // ── 月次統計 ──
  const [monthStats, setMonthStats] = useState({ confirmed: 0, completed: 0, pending: 0 })

  // ── ドラッグ状態 ──
  const isDraggingRef = useRef(false)
  const dragRef       = useRef<DragState | null>(null)
  const [drag,       setDragState] = useState<DragState | null>(null)
  const [addingSlot, setAddingSlot] = useState(false)

  // ── スロット詳細ポップアップ ──
  const [selectedSlot, setSelectedSlot] = useState<SlotWithReservation | null>(null)

  // ── スロット操作 ──
  const [completingId,    setCompletingId]    = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [completeConfirm, setCompleteConfirm] = useState<{ reservationId: string; slotId: string } | null>(null)

  // ── 週次設定モーダル ──
  const [showRecurModal, setShowRecurModal] = useState(false)
  const [recurDays,      setRecurDays]      = useState<boolean[]>([true, true, true, true, true, false, false])
  const [recurStart,     setRecurStart]     = useState('09:00')
  const [recurEnd,       setRecurEnd]       = useState('18:00')
  const [recurWeeks,     setRecurWeeks]     = useState(4)
  const [recurCapacity,  setRecurCapacity]  = useState(1)
  const [recurSaving,    setRecurSaving]    = useState(false)
  const [recurResult,    setRecurResult]    = useState<{ added: number; skipped: number } | null>(null)
  const [recurError,     setRecurError]     = useState('')

  // ────────────────────────────────────────────────
  // Data fetching
  // ────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('businesses')
      .select('service_areas, cancel_phone, closed_days, business_hours_start, business_hours_end')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        const biz = data as Pick<Business, 'service_areas' | 'cancel_phone' | 'closed_days' | 'business_hours_start' | 'business_hours_end'> | null
        if (biz) {
          if (biz.service_areas.length === 0 || !biz.cancel_phone) setProfileIncomplete(true)
          if (biz.closed_days?.length)   setClosedDays(biz.closed_days)
          if (biz.business_hours_start)  setBizHoursStart(biz.business_hours_start.slice(0, 5))
          if (biz.business_hours_end)    setBizHoursEnd(biz.business_hours_end.slice(0, 5))
        }
      })
  }, [user])

  const fetchMonthStats = useCallback(async () => {
    if (!businessId) return
    const { start: from, end: to } = jstMonthRange(0)
    const [{ count: confirmed }, { count: completed }, { count: pending }] = await Promise.all([
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'confirmed')
        .gte('reservation_date', from).lte('reservation_date', to),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'completed')
        .gte('reservation_date', from).lte('reservation_date', to),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'pending'),
    ])
    setMonthStats({ confirmed: confirmed ?? 0, completed: completed ?? 0, pending: pending ?? 0 })
  }, [businessId])

  useEffect(() => { fetchMonthStats() }, [fetchMonthStats])

  const fetchSlots = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    setFetchError(false)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to   = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('availability_slots')
      .select(`*, reservation:reservations(*, hospitals(name, phone))`)
      .eq('business_id', businessId)
      .gte('date', from)
      .lte('date', to)
      .order('start_time')
    if (error) { setFetchError(true); setLoading(false); return }
    setSlots((data as unknown as SlotWithReservation[]) ?? [])
    setLoading(false)
  }, [businessId, weekStart])

  // selectedSlot をリアルタイム更新に追従させる
  // slots が再取得されると古い参照を持つ selectedSlot はデータが陳腐化するため同期する
  useEffect(() => {
    if (!selectedSlot) return
    const updated = slots.find(s => s.id === selectedSlot.id)
    if (updated) {
      setSelectedSlot(updated as SlotWithReservation)
    } else {
      // 枠が外部から削除されたらモーダルを閉じる
      setSelectedSlot(null)
    }
  }, [slots]) // selectedSlot は依存に入れない（無限ループ防止）

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowRecurModal(false)
        setDeleteConfirmId(null)
        setCompleteConfirm(null)
        setSelectedSlot(null)
      }
      const tag = (e.target as HTMLElement).tagName
      if (showRecurModal || selectedSlot) return
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft')  setWeekStart(w => addDays(w, -7))
      if (e.key === 'ArrowRight') setWeekStart(w => addDays(w, 7))
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showRecurModal, selectedSlot])

  // Realtime subscription
  useEffect(() => {
    fetchSlots()
    if (!businessId) return
    const channel = supabase
      .channel('calendar-' + businessId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'availability_slots', filter: `business_id=eq.${businessId}` }, fetchSlots)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reservations', filter: `business_id=eq.${businessId}` }, (payload) => {
        if (payload.new?.status === 'pending') showToast('新しい仮予約申請が届きました', 'info')
        fetchSlots(); fetchMonthStats()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'reservations', filter: `business_id=eq.${businessId}` }, () => {
        fetchSlots(); fetchMonthStats()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSlots, fetchMonthStats, businessId])

  // ────────────────────────────────────────────────
  // Drag handlers
  // ────────────────────────────────────────────────
  const handleCellMouseDown = useCallback((dayIdx: number, slotIdx: number) => {
    const dateStr = format(weekDays[dayIdx], 'yyyy-MM-dd')
    const d: DragState = { dayIdx, dateStr, startSlot: slotIdx, endSlot: slotIdx }
    isDraggingRef.current = true
    dragRef.current = d
    setDragState(d)
    window.getSelection()?.removeAllRanges()
  }, [weekDays])

  const handleCellMouseEnter = useCallback((dayIdx: number, slotIdx: number) => {
    if (!isDraggingRef.current || dragRef.current?.dayIdx !== dayIdx) return
    const d: DragState = { ...dragRef.current, endSlot: slotIdx }
    dragRef.current = d
    setDragState({ ...d })
  }, [])

  // Touch support
  const handleCellTouchStart = useCallback((dayIdx: number, slotIdx: number) => (e: React.TouchEvent) => {
    e.preventDefault()
    const dateStr = format(weekDays[dayIdx], 'yyyy-MM-dd')
    const d: DragState = { dayIdx, dateStr, startSlot: slotIdx, endSlot: slotIdx }
    isDraggingRef.current = true
    dragRef.current = d
    setDragState(d)
  }, [weekDays])

  const handleGridTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || !dragRef.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return
    const dayAttr  = el.getAttribute('data-day')
    const slotAttr = el.getAttribute('data-slot')
    if (dayAttr === null || slotAttr === null) return
    const dIdx = parseInt(dayAttr)
    const sIdx = parseInt(slotAttr)
    if (dIdx !== dragRef.current.dayIdx) return
    const d: DragState = { ...dragRef.current, endSlot: sIdx }
    dragRef.current = d
    setDragState({ ...d })
  }, [])

  // mouseup / touchend → スロット作成
  useEffect(() => {
    const finishDrag = async () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      const d = dragRef.current
      dragRef.current = null
      setDragState(null)
      if (!d || !businessId) return

      const startS = Math.min(d.startSlot, d.endSlot)
      const endS   = Math.max(d.startSlot, d.endSlot) + 1
      if (startS >= TOTAL_SLOTS) return

      const startTime = slotToTime(startS)
      const endTime   = slotToTime(Math.min(endS, TOTAL_SLOTS))

      setAddingSlot(true)
      const { error } = await supabase.from('availability_slots').insert({
        business_id:     businessId,
        date:            d.dateStr,
        start_time:      startTime,
        end_time:        endTime,
        is_available:    true,
        capacity:        1,
        confirmed_count: 0,
      })
      setAddingSlot(false)
      if (error) {
        showToast('追加に失敗しました。再試行してください。', 'error')
      } else {
        showToast(`${d.dateStr.slice(5).replace('-', '/')} ${startTime}〜${endTime} を追加しました`)
        fetchSlots()
      }
    }
    window.addEventListener('mouseup', finishDrag)
    window.addEventListener('touchend', finishDrag)
    return () => {
      window.removeEventListener('mouseup', finishDrag)
      window.removeEventListener('touchend', finishDrag)
    }
  }, [businessId, showToast, fetchSlots])

  // ────────────────────────────────────────────────
  // Slot CRUD
  // ────────────────────────────────────────────────
  const handleDeleteSlot = async (slotId: string) => {
    setDeleteConfirmId(null)
    const { error } = await supabase.from('availability_slots').delete().eq('id', slotId)
    if (error) { showToast('削除に失敗しました。再試行してください。', 'error'); return }
    showToast('空き枠を削除しました', 'error')
    setSelectedSlot(null)
    fetchSlots()
  }

  const handleComplete = async (reservation: Reservation, slotId: string) => {
    setCompleteConfirm(null)
    setCompletingId(reservation.id)
    const { error } = await supabase.from('reservations').update({ status: 'completed' }).eq('id', reservation.id)
    if (error) { showToast('完了処理に失敗しました。再試行してください。', 'error'); setCompletingId(null); return }
    const { data: slot } = await supabase.from('availability_slots').select('confirmed_count').eq('id', slotId).single()
    const newCount = Math.max(0, (slot?.confirmed_count ?? 0) - 1)
    await supabase.from('availability_slots').update({ confirmed_count: newCount, is_available: true }).eq('id', slotId)
    setCompletingId(null)
    showToast('完了にしました')
    fetchSlots(); fetchMonthStats()
  }

  // ────────────────────────────────────────────────
  // Recurring slots
  // ────────────────────────────────────────────────
  const handleRecurAdd = async () => {
    if (!businessId) return
    if (recurStart >= recurEnd) { setRecurError('終了時間は開始時間より後にしてください'); return }
    if (!recurDays.some(Boolean)) { setRecurError('曜日を1つ以上選択してください'); return }

    setRecurSaving(true); setRecurError(''); setRecurResult(null)

    const today = parseISO(jstTodayStr())
    const datesToAdd: string[] = []
    for (let w = 0; w < recurWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        if (!recurDays[d]) continue
        const weekMonday = startOfWeek(addWeeks(today, w), { weekStartsOn: 1 })
        const date = addDays(weekMonday, d)
        if (isBefore(date, today)) continue
        datesToAdd.push(format(date, 'yyyy-MM-dd'))
      }
    }
    if (datesToAdd.length === 0) {
      setRecurError('追加対象の日付がありません（過去の日付は除外されます）')
      setRecurSaving(false); return
    }

    const { data: existing, error: existErr } = await supabase
      .from('availability_slots').select('date, start_time, end_time')
      .eq('business_id', businessId).in('date', datesToAdd)
      .eq('start_time', recurStart).eq('end_time', recurEnd)
    if (existErr) { setRecurError('重複確認に失敗しました。再試行してください。'); setRecurSaving(false); return }

    const existingKeys = new Set((existing ?? []).map(s => s.date))
    const newDates = datesToAdd.filter(d => !existingKeys.has(d))
    const skipped  = datesToAdd.length - newDates.length

    if (newDates.length > 0) {
      const rows = newDates.map(date => ({
        business_id: businessId, date,
        start_time: recurStart, end_time: recurEnd,
        is_available: true, capacity: recurCapacity, confirmed_count: 0,
      }))
      const { error } = await supabase.from('availability_slots').insert(rows)
      if (error) { setRecurError('追加に失敗しました。再試行してください。'); setRecurSaving(false); return }
    }

    setRecurResult({ added: newDates.length, skipped })
    setRecurSaving(false)
    if (newDates.length > 0) showToast(`${newDates.length}件の空き枠を追加しました`)
    fetchSlots()
  }

  // ────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────
  const slotsForDay = (date: Date) => slots.filter(s => isSameDay(parseISO(s.date), date))
  const todayJST    = parseISO(jstTodayStr())
  const isPastDay   = (date: Date) => isBefore(startOfDay(date), todayJST)

  const bizStartSlot = timeToSlot(bizHoursStart)
  const bizEndSlot   = timeToSlot(bizHoursEnd)

  // ────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────
  return (
    <div>
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">稼働カレンダー</h1>
          <p className="text-xs text-slate-400 mt-0.5">グリッドをドラッグして空き枠を追加 / ブロックをタップで詳細</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              const defaults = [true, true, true, true, true, false, false]
              const presetDays = defaults.map((def, i) => {
                const jsDay = i < 6 ? i + 1 : 0
                return closedDays.includes(jsDay) ? false : def
              })
              setRecurDays(presetDays)
              setRecurStart(bizHoursStart); setRecurEnd(bizHoursEnd)
              setShowRecurModal(true); setRecurResult(null); setRecurError('')
            }}
            className="px-3 h-8 rounded-lg border border-teal-200 bg-teal-50 text-xs text-teal-600 hover:bg-teal-100 font-medium"
          >
            週次設定
          </button>
          <button onClick={() => setWeekStart(d => addDays(d, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm"
            title="前の週（←キー）">◀</button>
          {(() => {
            const isCurrentWeek = weekStart.getTime() === startOfWeek(new Date(), { weekStartsOn: 1 }).getTime()
            return (
              <button onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))} disabled={isCurrentWeek}
                className={`px-3 h-8 rounded-lg border text-xs font-medium transition-colors ${isCurrentWeek ? 'border-teal-300 bg-teal-50 text-teal-600 cursor-default' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                今週
              </button>
            )
          })()}
          <button onClick={() => setWeekStart(d => addDays(d, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm"
            title="次の週（→キー）">▶</button>
        </div>
      </div>

      {/* ── Monthly stats ── */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: `${jstMonthLabel()}確定`, value: monthStats.confirmed, color: 'text-teal-600',  href: monthStats.confirmed > 0 ? '/business/reservations' : null, activeClass: 'border-teal-200 hover:bg-teal-50' },
          { label: `${jstMonthLabel()}完了`, value: monthStats.completed, color: 'text-green-600', href: null, activeClass: '' },
          { label: '申請中', value: monthStats.pending, color: monthStats.pending > 0 ? 'text-amber-600' : 'text-slate-400', href: monthStats.pending > 0 ? '/business/reservations' : null, activeClass: 'border-amber-200 hover:bg-amber-50' },
        ].map(s => s.href ? (
          <button key={s.label} onClick={() => navigate(s.href!)}
            className={`bg-white rounded-xl border py-2 px-3 text-center shadow-sm transition-colors ${s.activeClass}`}>
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </button>
        ) : (
          <div key={s.label} className="bg-white rounded-xl border border-slate-100 py-2 px-3 text-center shadow-sm">
            <p className="text-xs text-slate-400">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ── Profile warning ── */}
      {profileIncomplete && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm">
          <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
          <div>
            <p className="text-amber-800 font-medium">プロフィールが未設定です</p>
            <p className="text-amber-700 text-xs mt-0.5">対応エリアやキャンセル連絡先を設定するとMSWの検索に表示されます。</p>
            <Link to="/business/profile" className="text-amber-700 underline text-xs font-medium mt-1 inline-block">プロフィールを設定する →</Link>
          </div>
        </div>
      )}

      {/* ── Week header ── */}
      <p className="text-xs text-slate-400 mb-2 text-center">
        {format(weekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(addDays(weekStart, 6), 'M月d日', { locale: ja })}
      </p>

      {/* ── Week status strip ── */}
      <div className="grid grid-cols-7 gap-1 mb-3 bg-white rounded-xl border border-slate-100 px-2 py-2 shadow-sm">
        {weekDays.map(date => {
          const dateStr   = format(date, 'yyyy-MM-dd')
          const daySlots  = !loading ? slotsForDay(date) : []
          const past      = isPastDay(date)
          const todayFlag = isTodayJST(dateStr)
          const dow    = date.getDay()
          const isSun  = dow === 0; const isSat = dow === 6
          const isClosed      = closedDays.includes(dow)
          const hasPending    = daySlots.some(s => Array.isArray(s.reservation) && s.reservation.some(r => r.status === 'pending'))
          const hasConfirmed  = daySlots.some(s => (s.confirmed_count ?? 0) > 0)
          const isFull        = daySlots.length > 0 && daySlots.every(s => (s.capacity ?? 1) <= (s.confirmed_count ?? 0))
          const hasOpen       = daySlots.some(s => s.is_available && (s.confirmed_count ?? 0) < (s.capacity ?? 1))
          const barColor = past ? 'bg-slate-100' : loading ? 'bg-slate-100 animate-pulse' :
            isFull ? 'bg-orange-400' : hasPending ? 'bg-amber-400' : hasConfirmed ? 'bg-teal-400' :
            hasOpen ? 'bg-green-400' : isClosed ? 'bg-red-100' : 'bg-slate-200'
          return (
            <div key={dateStr} className="text-center">
              <p className={`text-[10px] font-medium leading-tight ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                {format(date, 'E', { locale: ja })}
              </p>
              <p className={`text-xs font-bold leading-tight ${todayFlag ? 'text-teal-600' : past ? 'text-slate-300' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                {format(date, 'd')}
              </p>
              <div className={`h-1.5 rounded-full mt-0.5 transition-colors ${barColor}`} />
            </div>
          )
        })}
      </div>

      {/* ── Legend ── */}
      {!loading && !fetchError && (
        <div className="flex items-center gap-3 mb-2 px-1 flex-wrap">
          {[
            { color: 'bg-green-400',  label: '空き' },
            { color: 'bg-teal-400',   label: '予約あり' },
            { color: 'bg-amber-400',  label: '申請中' },
            { color: 'bg-orange-400', label: '満車' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1">
              <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-[10px] text-slate-400">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-0.5 h-3 bg-teal-200 rounded" />
            <span className="text-[10px] text-slate-400">営業時間</span>
          </div>
        </div>
      )}

      {/* ── Time Grid ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p>
        </div>
      ) : fetchError ? (
        <div className="card text-center py-8">
          <div className="text-3xl mb-2">😵</div>
          <p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
          <button onClick={fetchSlots} className="btn-secondary text-sm">再試行</button>
        </div>
      ) : (
        <div
          className={`bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden select-none ${addingSlot ? 'opacity-60 pointer-events-none' : ''}`}
          onTouchMove={handleGridTouchMove}
        >
          {/* Day column headers */}
          <div className="grid border-b border-slate-200 sticky top-0 z-30 bg-white" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
            <div className="h-10 border-r border-slate-100" />
            {weekDays.map((date, _dayIdx) => {
              const dateStr     = format(date, 'yyyy-MM-dd')
              const todayFlag   = isTodayJST(dateStr)
              const dow         = date.getDay()
              const isSun       = dow === 0; const isSat = dow === 6
              const isClosedDay = closedDays.includes(dow)
              return (
                <div key={dateStr}
                  className={`py-1.5 px-0.5 text-center border-l border-slate-100 ${todayFlag ? 'bg-teal-50' : ''}`}>
                  <p className={`text-[10px] font-medium ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                    {format(date, 'E', { locale: ja })}
                  </p>
                  <p className={`text-sm font-bold leading-tight ${todayFlag ? 'text-teal-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                    {format(date, 'd')}
                  </p>
                  {isClosedDay && <span className="text-[8px] text-red-300 leading-none">定休</span>}
                </div>
              )
            })}
          </div>

          {/* Scrollable grid body */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)', minHeight: '360px' }}>
            <div className="grid" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>

              {/* Time labels column */}
              <div className="border-r border-slate-100">
                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                  <div key={i} style={{ height: CELL_H }}
                    className={`relative ${i % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50'}`}>
                    {i % 2 === 0 && (
                      <span className="absolute -top-2 right-1 text-[9px] text-slate-300 leading-none pointer-events-none">
                        {slotToTime(i).slice(0, 5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((date, dayIdx) => {
                const dateStr   = format(date, 'yyyy-MM-dd')
                const past      = isPastDay(date)
                const todayFlag = isTodayJST(dateStr)
                const daySlots  = slotsForDay(date)

                return (
                  <div key={dateStr}
                    className={`relative border-l border-slate-100 ${todayFlag ? 'bg-teal-50/20' : ''}`}
                    style={{ height: TOTAL_SLOTS * CELL_H }}>

                    {/* Cell hit-targets for drag */}
                    {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                      const inBiz      = slotIdx >= bizStartSlot && slotIdx < bizEndSlot
                      const isDragCell = drag?.dayIdx === dayIdx &&
                        slotIdx >= Math.min(drag.startSlot, drag.endSlot) &&
                        slotIdx <= Math.max(drag.startSlot, drag.endSlot)
                      return (
                        <div
                          key={slotIdx}
                          data-day={dayIdx}
                          data-slot={slotIdx}
                          style={{ height: CELL_H, top: slotIdx * CELL_H }}
                          className={[
                            'absolute left-0 right-0 z-0',
                            slotIdx % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50',
                            inBiz ? '' : 'bg-slate-50/60',
                            isDragCell ? '!bg-teal-100' : '',
                            past ? 'cursor-default' : 'cursor-crosshair hover:bg-teal-50/50',
                          ].join(' ')}
                          onMouseDown={!past ? () => handleCellMouseDown(dayIdx, slotIdx) : undefined}
                          onMouseEnter={!past ? () => handleCellMouseEnter(dayIdx, slotIdx) : undefined}
                          onTouchStart={!past ? handleCellTouchStart(dayIdx, slotIdx) : undefined}
                        />
                      )
                    })}

                    {/* Business hours left-edge indicator */}
                    <div
                      className="absolute left-0 w-0.5 bg-teal-200/80 pointer-events-none z-10"
                      style={{ top: bizStartSlot * CELL_H, height: (bizEndSlot - bizStartSlot) * CELL_H }}
                    />

                    {/* Existing slot blocks */}
                    {daySlots.map(slot => {
                      const startS = timeToSlot(slot.start_time.slice(0, 5))
                      const endS   = timeToSlot(slot.end_time.slice(0, 5))
                      const top    = startS * CELL_H + 1
                      const height = Math.max((endS - startS) * CELL_H - 2, 6)
                      const resArr         = Array.isArray(slot.reservation) ? slot.reservation : []
                      const confirmedCount = slot.confirmed_count ?? 0
                      const capacity       = slot.capacity ?? 1
                      const hasPending     = resArr.some(r => r.status === 'pending')
                      const isFull         = confirmedCount >= capacity
                      const bgClass = isFull          ? 'bg-orange-400 border-orange-500' :
                                      confirmedCount > 0 ? 'bg-teal-400 border-teal-500'   :
                                      hasPending      ? 'bg-amber-400 border-amber-500'  :
                                                        'bg-green-400 border-green-500'
                      return (
                        <div
                          key={slot.id}
                          style={{ top, height, left: 3, right: 3 }}
                          className={`absolute ${bgClass} border rounded text-white overflow-hidden cursor-pointer z-20 hover:brightness-95 transition-all`}
                          onMouseDown={e => { e.stopPropagation(); setSelectedSlot(slot) }}
                          onTouchStart={e => { e.stopPropagation(); setSelectedSlot(slot) }}
                        >
                          <div className="px-1 py-0.5 text-[9px] font-medium leading-tight whitespace-nowrap overflow-hidden">
                            <span>{slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}</span>
                            {confirmedCount > 0 && <span className="ml-1 opacity-90">✓{confirmedCount}</span>}
                            {hasPending && confirmedCount === 0 && <span className="ml-1 opacity-90">⏳</span>}
                            {capacity > 1 && <span className="ml-1 opacity-70">{capacity}台</span>}
                          </div>
                        </div>
                      )
                    })}

                    {/* Drag preview */}
                    {drag?.dayIdx === dayIdx && (() => {
                      const startS = Math.min(drag.startSlot, drag.endSlot)
                      const endS   = Math.max(drag.startSlot, drag.endSlot) + 1
                      return (
                        <div
                          style={{ top: startS * CELL_H + 1, height: (endS - startS) * CELL_H - 2, left: 3, right: 3 }}
                          className="absolute bg-teal-200/80 border-2 border-teal-400 rounded pointer-events-none z-30 flex items-center justify-center"
                        >
                          <span className="text-[10px] text-teal-800 font-semibold">
                            {slotToTime(startS)}〜{slotToTime(endS)}
                          </span>
                        </div>
                      )
                    })()}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Slot detail modal ── */}
      {selectedSlot && (() => {
        const slot           = selectedSlot
        const resArr         = Array.isArray(slot.reservation) ? slot.reservation : []
        const confirmedCount = slot.confirmed_count ?? 0
        const capacity       = slot.capacity ?? 1
        const confirmedList  = resArr.filter(r => r.status === 'confirmed')
        const pendingList    = resArr.filter(r => r.status === 'pending')
        const isFull         = confirmedCount >= capacity
        const hasPending     = pendingList.length > 0
        const remaining      = capacity - confirmedCount
        return (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
            onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setCompleteConfirm(null) }}
          >
            <div
              className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-800 text-base">
                    {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {format(parseISO(slot.date), 'M月d日（E）', { locale: ja })}
                    {capacity > 1 && <span className="ml-2">{capacity}台対応</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isFull ? (
                    <span className="badge-red">満車</span>
                  ) : confirmedCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800">空き{remaining}台</span>
                  ) : hasPending ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">申請中</span>
                  ) : (
                    <span className="badge-green">空き{capacity > 1 ? `${capacity}台` : ''}</span>
                  )}
                  <button
                    onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setCompleteConfirm(null) }}
                    className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center"
                  >×</button>
                </div>
              </div>

              {/* Confirmed reservations */}
              {confirmedList.length > 0 && (
                <div className="border-t border-slate-100 pt-3 space-y-3">
                  {confirmedList.map((res, idx) => (
                    <div key={res.id} className="text-xs text-slate-600 space-y-1">
                      {capacity > 1 && <p className="text-[10px] text-slate-400 font-medium">── 予約{idx + 1}</p>}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-medium text-slate-700">{res.hospitals?.name ?? '—'} ／ {res.contact_name}</span>
                        {res.hospitals?.phone && (
                          <a href={`tel:${res.hospitals.phone}`}
                            className="text-[10px] text-teal-700 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-full hover:bg-teal-100">
                            📞 {res.hospitals.phone}
                          </a>
                        )}
                      </div>
                      <p>患者：{res.patient_name}　<span className="text-slate-400">{EQUIPMENT_LABELS[res.equipment] ?? res.equipment}{res.equipment_rental ? '（貸出あり）' : ''}</span></p>
                      <div className="flex items-center gap-1">
                        <a href={mapsUrl(res.patient_address)} target="_blank" rel="noopener noreferrer"
                          className="flex-1 truncate text-teal-700 hover:underline">📍 乗車：{res.patient_address}</a>
                        <button onClick={() => navigator.clipboard.writeText(res.patient_address).then(() => showToast('コピーしました')).catch(() => {})}
                          className="text-slate-300 hover:text-slate-600 text-[11px] px-1">コピー</button>
                      </div>
                      <div className="flex items-center gap-1">
                        <a href={mapsUrl(res.destination)} target="_blank" rel="noopener noreferrer"
                          className="flex-1 truncate text-teal-700 hover:underline">📍 目的：{res.destination}</a>
                        <button onClick={() => navigator.clipboard.writeText(res.destination).then(() => showToast('コピーしました')).catch(() => {})}
                          className="text-slate-300 hover:text-slate-600 text-[11px] px-1">コピー</button>
                      </div>
                      {/* Complete button */}
                      {completeConfirm?.reservationId === res.id ? (
                        <div className="mt-1.5 bg-orange-50 border border-orange-200 rounded-lg p-2 space-y-1.5">
                          <p className="text-[11px] text-orange-700 text-center font-medium">予約を完了にしますか？</p>
                          <div className="flex gap-1.5">
                            <button onClick={() => setCompleteConfirm(null)}
                              className="flex-1 text-xs bg-white border border-slate-200 text-slate-600 px-2 py-1 rounded-lg hover:bg-slate-50">戻る</button>
                            <button onClick={() => handleComplete(res, slot.id)} disabled={completingId === res.id}
                              className="flex-1 text-xs bg-orange-500 text-white px-2 py-1 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium">
                              {completingId === res.id ? '処理中...' : '完了にする'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setCompleteConfirm({ reservationId: res.id, slotId: slot.id })}
                          disabled={completingId === res.id}
                          className="mt-1 w-full text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors">
                          {completingId === res.id ? '処理中...' : '✓ 完了にする'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Pending */}
              {hasPending && (
                <div className="border-t border-amber-100 pt-3 mt-3 text-xs text-amber-700">
                  <p className="font-medium mb-1">申請中: {pendingList.length}件</p>
                  {pendingList.slice(0, 3).map(r => {
                    const hrs = (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60)
                    const elapsed = hrs < 1 ? '〜1時間以内' : hrs < 24 ? `${Math.floor(hrs)}時間経過` : `${Math.floor(hrs / 24)}日経過`
                    const isOld = hrs >= 6
                    return (
                      <div key={r.id} className="flex items-start gap-1 justify-between mt-0.5">
                        <span className="text-amber-600">{r.hospitals?.name ?? '—'} ／ {r.patient_name}</span>
                        <span className={`flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isOld ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                          {elapsed}
                        </span>
                      </div>
                    )
                  })}
                  {pendingList.length > 3 && <p className="text-amber-500 mt-0.5">他{pendingList.length - 3}件…</p>}
                  <Link to="/business/reservations"
                    className="inline-block text-[10px] text-amber-600 underline mt-1 hover:text-amber-800">
                    予約管理で承認・却下する →
                  </Link>
                </div>
              )}

              {/* Delete */}
              {confirmedCount === 0 && !hasPending && (
                <div className="border-t border-slate-100 pt-3 mt-3">
                  {deleteConfirmId === slot.id ? (
                    <div className="flex gap-2">
                      <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary text-sm">戻る</button>
                      <button onClick={() => handleDeleteSlot(slot.id)}
                        className="flex-1 text-sm bg-red-500 text-white rounded-xl px-4 py-2 hover:bg-red-600 font-medium">削除確定</button>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(slot.id)}
                      className="w-full text-xs text-red-400 hover:text-red-600 text-center py-1">
                      この枠を削除する
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Recurring modal ── */}
      {showRecurModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">週次スケジュール設定</h3>
              <button onClick={() => setShowRecurModal(false)} aria-label="閉じる"
                className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <p className="text-xs text-slate-500 mb-4">指定した曜日・時間帯のスロットを複数週まとめて追加します。既存のスロットは重複追加されません。</p>

            {/* Day picker */}
            <div className="mb-4">
              <p className="label mb-2">稼働曜日</p>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, i) => {
                  const jsDay = i < 6 ? i + 1 : 0
                  const isProfileClosed = closedDays.includes(jsDay)
                  return (
                    <button key={label} type="button"
                      onClick={() => setRecurDays(prev => prev.map((v, idx) => idx === i ? !v : v))}
                      title={isProfileClosed ? '定休日（プロフィール設定）' : undefined}
                      className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                        recurDays[i] ? 'bg-teal-600 text-white border-teal-600' :
                        isProfileClosed ? 'bg-red-50 text-red-300 border-red-200' :
                        'bg-slate-50 text-slate-400 border-slate-200'}`}>
                      {label}
                    </button>
                  )
                })}
              </div>
              {closedDays.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1.5">※ プロフィールの定休日は自動で除外されています（再チェックで追加可）</p>
              )}
            </div>

            {/* Time */}
            <div className="mb-3">
              <p className="label mb-1.5">クイック選択</p>
              <div className="flex gap-2 mb-3 flex-wrap">
                {[{ label: '営業時間', start: bizHoursStart, end: bizHoursEnd }, ...QUICK_TIMES]
                  .filter((qt, i, arr) => i === 0 || !(qt.start === arr[0].start && qt.end === arr[0].end))
                  .map(qt => (
                    <button key={qt.label} type="button"
                      onClick={() => { setRecurStart(qt.start); setRecurEnd(qt.end) }}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        recurStart === qt.start && recurEnd === qt.end
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                      {qt.label}
                    </button>
                  ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">開始時間</label>
                  <input type="time" className="input-base" value={recurStart} onChange={e => setRecurStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">終了時間</label>
                  <input type="time" className="input-base" value={recurEnd} onChange={e => setRecurEnd(e.target.value)} />
                </div>
              </div>
            </div>

            {/* Capacity */}
            <div className="mb-4">
              <label className="label">対応台数</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" onClick={() => setRecurCapacity(n)}
                    className={`flex-1 py-1.5 rounded-lg text-sm font-bold border transition-colors ${
                      recurCapacity === n ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                    {n}台
                  </button>
                ))}
              </div>
            </div>

            {/* Weeks */}
            <div className="mb-4">
              <label className="label">追加する週数</label>
              <div className="flex gap-2">
                {[2, 4, 8, 12].map(w => (
                  <button key={w} type="button" onClick={() => setRecurWeeks(w)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      recurWeeks === w ? 'bg-teal-600 text-white border-teal-600' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300'}`}>
                    {w}週
                  </button>
                ))}
              </div>
            </div>

            {recurError && <p className="text-xs text-red-600 mb-2">{recurError}</p>}

            {recurResult && (
              recurResult.added === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800">
                  すべて既存のスロットと重複していたためスキップしました（{recurResult.skipped}枠）
                </div>
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-xs text-green-800">
                  ✓ {recurResult.added}枠を追加しました{recurResult.skipped > 0 && ` （重複${recurResult.skipped}枠はスキップ）`}
                </div>
              )
            )}

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowRecurModal(false)}>閉じる</button>
              <button className="btn-primary flex-1" onClick={handleRecurAdd} disabled={recurSaving}>
                {recurSaving ? '追加中...' : '一括追加'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

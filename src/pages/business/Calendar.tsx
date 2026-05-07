import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDay, isBefore, parseISO, startOfDay, startOfMonth, startOfWeek, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { isTodayJST, jstMonthLabel, jstMonthRange } from '../../lib/jst'
import type { Business, OccupiedSlot, Reservation, Vehicle } from '../../types/database'

const GRID_START = 6
const GRID_END = 22
const TOTAL_SLOTS = (GRID_END - GRID_START) * 2
const CELL_H = 28

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

type SlotWithReservation = OccupiedSlot & {
  reservation: (Reservation & { hospitals: { name: string; phone: string | null } | null }) | null
}

type ReservationWithHospital = Reservation & {
  hospitals: { name: string; phone: string | null } | null
}

type DragState = {
  dayIdx: number
  dateStr: string
  startSlot: number
  endSlot: number
}

function timeToSlot(time: string) {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number)
  return Math.max(0, Math.min(TOTAL_SLOTS, (hours - GRID_START) * 2 + (minutes >= 30 ? 1 : 0)))
}

function slotToTime(slot: number) {
  const totalMinutes = slot * 30 + GRID_START * 60
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function BusinessCalendar() {
  const { businessId, user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart])
  const [viewMode, setViewMode] = useState<'month' | 'week'>('week')
  const [monthStart, setMonthStart] = useState(() => startOfMonth(new Date()))

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)
  const [slots, setSlots] = useState<SlotWithReservation[]>([])
  const [monthSlots, setMonthSlots] = useState<SlotWithReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [monthLoading, setMonthLoading] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [addingSlot, setAddingSlot] = useState(false)

  const [closedDays, setClosedDays] = useState<number[]>([])
  const [bizHoursStart, setBizHoursStart] = useState('09:00')
  const [bizHoursEnd, setBizHoursEnd] = useState('18:00')
  const [profileIncomplete, setProfileIncomplete] = useState(false)
  const [monthStats, setMonthStats] = useState({ confirmed: 0, completed: 0, pending: 0 })

  const [selectedSlot, setSelectedSlot] = useState<SlotWithReservation | null>(null)
  const [selectedPendingRes, setSelectedPendingRes] = useState<ReservationWithHospital | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [completeConfirmId, setCompleteConfirmId] = useState<string | null>(null)
  const [cancelPendingConfirmId, setCancelPendingConfirmId] = useState<string | null>(null)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const [pendingReservations, setPendingReservations] = useState<ReservationWithHospital[]>([])
  const [monthPendingReservations, setMonthPendingReservations] = useState<ReservationWithHospital[]>([])

  const dragRef = useRef<DragState | null>(null)
  const isDraggingRef = useRef(false)
  const [drag, setDrag] = useState<DragState | null>(null)

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles],
  )

  const bizStartSlot = timeToSlot(bizHoursStart)
  const bizEndSlot = timeToSlot(bizHoursEnd)

  const slotsByDate = useMemo(() => {
    const grouped = new Map<string, SlotWithReservation[]>()
    for (const slot of slots) {
      const entry = grouped.get(slot.date)
      if (entry) {
        entry.push(slot)
      } else {
        grouped.set(slot.date, [slot])
      }
    }
    return grouped
  }, [slots])

  const slotsForDay = useCallback((date: Date) => slotsByDate.get(format(date, 'yyyy-MM-dd')) ?? [], [slotsByDate])
  const isPastDay = useCallback((date: Date) => isBefore(date, startOfDay(new Date())), [])
  const monthSlotsByDate = useMemo(() => {
    const grouped = new Map<string, SlotWithReservation[]>()
    for (const slot of monthSlots) {
      const entry = grouped.get(slot.date)
      if (entry) {
        entry.push(slot)
      } else {
        grouped.set(slot.date, [slot])
      }
    }
    return grouped
  }, [monthSlots])
  const monthDays = useMemo(
    () => eachDayOfInterval({ start: monthStart, end: endOfMonth(monthStart) }),
    [monthStart],
  )
  const monthLeadingEmptyDays = useMemo(() => getDay(monthStart), [monthStart])
  const monthTrailingEmptyDays = useMemo(
    () => (7 - ((monthLeadingEmptyDays + monthDays.length) % 7)) % 7,
    [monthDays.length, monthLeadingEmptyDays],
  )
  const monthSlotsForDay = useCallback(
    (date: Date) => monthSlotsByDate.get(format(date, 'yyyy-MM-dd')) ?? [],
    [monthSlotsByDate],
  )

  useEffect(() => {
    if (!user) return

    supabase
      .from('businesses')
      .select('service_areas, cancel_phone, closed_days, business_hours_start, business_hours_end')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        const business = data as Pick<
          Business,
          'service_areas' | 'cancel_phone' | 'closed_days' | 'business_hours_start' | 'business_hours_end'
        > | null
        if (!business) return

        if (!business.cancel_phone || business.service_areas.length === 0) setProfileIncomplete(true)
        if (business.closed_days?.length) setClosedDays(business.closed_days)
        if (business.business_hours_start) setBizHoursStart(business.business_hours_start.slice(0, 5))
        if (business.business_hours_end) setBizHoursEnd(business.business_hours_end.slice(0, 5))
      })
  }, [user])

  const fetchVehicles = useCallback(async () => {
    if (!businessId) return
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (error) {
      setFetchError(true)
      return
    }

    const nextVehicles = (data ?? []) as Vehicle[]
    setVehicles(nextVehicles)
    setSelectedVehicleId((current) => {
      if (nextVehicles.length === 0) return null
      if (current && nextVehicles.some((vehicle) => vehicle.id === current)) return current
      return nextVehicles[0].id
    })
  }, [businessId])

  const fetchMonthStats = useCallback(async () => {
    if (!businessId) return
    const { start, end } = jstMonthRange(0)
    const [{ count: confirmed }, { count: completed }, { count: pending }] = await Promise.all([
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'confirmed')
        .gte('reservation_date', start).lte('reservation_date', end),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'completed')
        .gte('reservation_date', start).lte('reservation_date', end),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('business_id', businessId).eq('status', 'pending'),
    ])
    setMonthStats({
      confirmed: confirmed ?? 0,
      completed: completed ?? 0,
      pending: pending ?? 0,
    })
  }, [businessId])

  const fetchSlots = useCallback(async () => {
    if (!selectedVehicleId) {
      setSlots([])
      setLoading(false)
      return
    }

    setLoading(true)
    setFetchError(false)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('occupied_slots')
      .select('*')
      .eq('vehicle_id', selectedVehicleId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      setFetchError(true)
      setLoading(false)
      return
    }

    const baseSlots = (data ?? []) as OccupiedSlot[]
    const reservationIds = Array.from(
      new Set(baseSlots.map((slot) => slot.reservation_id).filter(Boolean)),
    ) as string[]

    let reservationMap = new Map<string, SlotWithReservation['reservation']>()
    if (reservationIds.length > 0) {
      const { data: reservationRows } = await supabase
        .from('reservations')
        .select('*')
        .in('id', reservationIds)

      const reservations = (reservationRows ?? []) as Reservation[]
      const hospitalIds = Array.from(
        new Set(reservations.map((reservation) => reservation.hospital_id).filter(Boolean)),
      ) as string[]

      let hospitalMap = new Map<string, { name: string; phone: string | null }>()
      if (hospitalIds.length > 0) {
        const { data: hospitalRows } = await supabase
          .from('hospitals')
          .select('id, name, phone')
          .in('id', hospitalIds)

        hospitalMap = new Map(
          ((hospitalRows ?? []) as Array<{ id: string; name: string; phone: string | null }>).map((hospital) => [
            hospital.id,
            { name: hospital.name, phone: hospital.phone },
          ]),
        )
      }

      reservationMap = new Map(
        reservations.map((reservation) => [
          reservation.id,
          {
            ...reservation,
            hospitals: reservation.hospital_id ? hospitalMap.get(reservation.hospital_id) ?? null : null,
          },
        ]),
      )
    }

    setSlots(
      baseSlots.map((slot) => ({
        ...slot,
        reservation: slot.reservation_id ? reservationMap.get(slot.reservation_id) ?? null : null,
      })),
    )
    setLoading(false)
  }, [selectedVehicleId, weekStart])

  const fetchMonthSlots = useCallback(async () => {
    if (!selectedVehicleId) {
      setMonthSlots([])
      setMonthLoading(false)
      return
    }

    setMonthLoading(true)
    setFetchError(false)
    const from = format(monthStart, 'yyyy-MM-dd')
    const to = format(endOfMonth(monthStart), 'yyyy-MM-dd')
    const { data, error } = await supabase
      .from('occupied_slots')
      .select('*')
      .eq('vehicle_id', selectedVehicleId)
      .gte('date', from)
      .lte('date', to)
      .order('date', { ascending: true })
      .order('start_time', { ascending: true })

    if (error) {
      setFetchError(true)
      setMonthLoading(false)
      return
    }

    const baseSlots = (data ?? []) as OccupiedSlot[]
    const reservationIds = Array.from(
      new Set(baseSlots.map((slot) => slot.reservation_id).filter(Boolean)),
    ) as string[]

    let reservationMap = new Map<string, SlotWithReservation['reservation']>()
    if (reservationIds.length > 0) {
      const { data: reservationRows } = await supabase
        .from('reservations')
        .select('*')
        .in('id', reservationIds)

      const reservations = (reservationRows ?? []) as Reservation[]
      const hospitalIds = Array.from(
        new Set(reservations.map((reservation) => reservation.hospital_id).filter(Boolean)),
      ) as string[]

      let hospitalMap = new Map<string, { name: string; phone: string | null }>()
      if (hospitalIds.length > 0) {
        const { data: hospitalRows } = await supabase
          .from('hospitals')
          .select('id, name, phone')
          .in('id', hospitalIds)

        hospitalMap = new Map(
          ((hospitalRows ?? []) as Array<{ id: string; name: string; phone: string | null }>).map((hospital) => [
            hospital.id,
            { name: hospital.name, phone: hospital.phone },
          ]),
        )
      }

      reservationMap = new Map(
        reservations.map((reservation) => [
          reservation.id,
          {
            ...reservation,
            hospitals: reservation.hospital_id ? hospitalMap.get(reservation.hospital_id) ?? null : null,
          },
        ]),
      )
    }

    setMonthSlots(
      baseSlots.map((slot) => ({
        ...slot,
        reservation: slot.reservation_id ? reservationMap.get(slot.reservation_id) ?? null : null,
      })),
    )
    setMonthLoading(false)
  }, [monthStart, selectedVehicleId])

  const fetchPendingReservations = useCallback(async () => {
    if (!businessId) return
    const from = format(weekStart, 'yyyy-MM-dd')
    const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('reservations')
      .select('*, hospitals(name, phone)')
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .gte('reservation_date', from)
      .lte('reservation_date', to)
    setPendingReservations((data ?? []) as unknown as ReservationWithHospital[])
  }, [businessId, weekStart])

  const fetchMonthPendingReservations = useCallback(async () => {
    if (!businessId) return
    const from = format(monthStart, 'yyyy-MM-dd')
    const to = format(endOfMonth(monthStart), 'yyyy-MM-dd')
    const { data } = await supabase
      .from('reservations')
      .select('*, hospitals(name, phone)')
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed'])
      .gte('reservation_date', from)
      .lte('reservation_date', to)
    setMonthPendingReservations((data ?? []) as unknown as ReservationWithHospital[])
  }, [businessId, monthStart])

  useEffect(() => {
    fetchVehicles()
    fetchMonthStats()
  }, [fetchVehicles, fetchMonthStats])

  useEffect(() => {
    fetchSlots()
    fetchPendingReservations()
  }, [fetchSlots, fetchPendingReservations])

  useEffect(() => {
    fetchMonthSlots()
    fetchMonthPendingReservations()
  }, [fetchMonthSlots, fetchMonthPendingReservations])

  useEffect(() => {
    if (!selectedSlot) return
    const updated = [...slots, ...monthSlots].find((slot) => slot.id === selectedSlot.id)
    setSelectedSlot(updated ?? null)
  }, [monthSlots, selectedSlot, slots])

  useEffect(() => {
    if (!selectedPendingRes) return
    const updated = [...pendingReservations, ...monthPendingReservations].find((res) => res.id === selectedPendingRes.id)
    setSelectedPendingRes(updated ?? null)
  }, [monthPendingReservations, pendingReservations, selectedPendingRes])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedSlot(null)
        setSelectedPendingRes(null)
        setDeleteConfirmId(null)
        setCompleteConfirmId(null)
        setCancelPendingConfirmId(null)
      }
      const tag = (e.target as HTMLElement).tagName
      if (selectedSlot || selectedPendingRes) return
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'ArrowLeft') setWeekStart((current) => addDays(current, -7))
      if (e.key === 'ArrowRight') setWeekStart((current) => addDays(current, 7))
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [selectedPendingRes, selectedSlot])

  useEffect(() => {
    if (!businessId) return

    const channel = supabase
      .channel(`calendar-${businessId}-${selectedVehicleId ?? 'none'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'occupied_slots',
          filter: selectedVehicleId ? `vehicle_id=eq.${selectedVehicleId}` : undefined,
        },
        () => { fetchSlots() },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'occupied_slots',
          filter: selectedVehicleId ? `vehicle_id=eq.${selectedVehicleId}` : undefined,
        },
        () => { fetchMonthSlots() },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          fetchSlots()
          fetchMonthSlots()
          fetchMonthStats()
          fetchPendingReservations()
          fetchMonthPendingReservations()
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [businessId, fetchMonthSlots, fetchMonthStats, fetchSlots, fetchPendingReservations, fetchMonthPendingReservations, selectedVehicleId])

  const handleCellMouseDown = useCallback((dayIdx: number, slotIdx: number) => {
    if (!selectedVehicleId) return
    const dateStr = format(weekDays[dayIdx], 'yyyy-MM-dd')
    const state: DragState = { dayIdx, dateStr, startSlot: slotIdx, endSlot: slotIdx }
    dragRef.current = state
    isDraggingRef.current = true
    setDrag(state)
    window.getSelection()?.removeAllRanges()
  }, [selectedVehicleId, weekDays])

  const handleCellMouseEnter = useCallback((dayIdx: number, slotIdx: number) => {
    if (!isDraggingRef.current || dragRef.current?.dayIdx !== dayIdx) return
    const next = { ...dragRef.current, endSlot: slotIdx }
    dragRef.current = next
    setDrag(next)
  }, [])

  const handleCellTouchStart = useCallback((dayIdx: number, slotIdx: number) => (e: React.TouchEvent) => {
    e.preventDefault()
    if (!selectedVehicleId) return
    const dateStr = format(weekDays[dayIdx], 'yyyy-MM-dd')
    const state: DragState = { dayIdx, dateStr, startSlot: slotIdx, endSlot: slotIdx }
    dragRef.current = state
    isDraggingRef.current = true
    setDrag(state)
  }, [selectedVehicleId, weekDays])

  const handleGridTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || !dragRef.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const element = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!element) return

    const dayAttr = element.getAttribute('data-day')
    const slotAttr = element.getAttribute('data-slot')
    if (dayAttr === null || slotAttr === null) return

    const nextDayIdx = Number(dayAttr)
    const nextSlotIdx = Number(slotAttr)
    if (nextDayIdx !== dragRef.current.dayIdx) return

    const next = { ...dragRef.current, endSlot: nextSlotIdx }
    dragRef.current = next
    setDrag(next)
  }, [])

  useEffect(() => {
    const finishDrag = async () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      const current = dragRef.current
      dragRef.current = null
      setDrag(null)

      if (!current || !selectedVehicleId) return

      const startSlot = Math.min(current.startSlot, current.endSlot)
      const endSlot = Math.max(current.startSlot, current.endSlot) + 1
      if (startSlot >= TOTAL_SLOTS) return

      const startTime = slotToTime(startSlot)
      const endTime = slotToTime(Math.min(endSlot, TOTAL_SLOTS))
      setAddingSlot(true)
      const { error } = await supabase.from('occupied_slots').insert({
        vehicle_id: selectedVehicleId,
        date: current.dateStr,
        start_time: startTime,
        end_time: endTime,
        reservation_id: null,
      })
      setAddingSlot(false)

      if (error) {
        showToast('稼働ブロックの追加に失敗しました', 'error')
        return
      }

      showToast(`${current.dateStr.slice(5).replace('-', '/')} ${startTime}〜${endTime} を登録しました`)
      fetchSlots()
    }

    window.addEventListener('mouseup', finishDrag)
    window.addEventListener('touchend', finishDrag)
    return () => {
      window.removeEventListener('mouseup', finishDrag)
      window.removeEventListener('touchend', finishDrag)
    }
  }, [fetchSlots, selectedVehicleId, showToast])

  const handleDeleteSlot = async (slotId: string) => {
    setDeleteConfirmId(null)
    const { error } = await supabase.from('occupied_slots').delete().eq('id', slotId)
    if (error) {
      showToast('ブロック削除に失敗しました', 'error')
      return
    }
    setSelectedSlot(null)
    showToast('ブロックを削除しました')
    fetchSlots()
    fetchMonthSlots()
  }

  const handleComplete = async (reservationId: string) => {
    setCompleteConfirmId(null)
    setCompletingId(reservationId)
    const { error } = await supabase.rpc('complete_reservation', { p_reservation_id: reservationId })
    setCompletingId(null)

    if (error) {
      showToast('完了処理に失敗しました', 'error')
      return
    }

    showToast('予約を完了にしました')
    setSelectedSlot(null)
    fetchSlots()
    fetchMonthStats()
  }

  const handleCancelReservation = async (reservationId: string, slotId?: string) => {
    setDeleteConfirmId(null)
    setCancelPendingConfirmId(null)
    setCancellingId(reservationId)

    const { error: reservationError } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)

    if (reservationError) {
      setCancellingId(null)
      showToast('予約をキャンセルできませんでした', 'error')
      return
    }

    const { error: deleteByReservationError } = await supabase
      .from('occupied_slots')
      .delete()
      .eq('reservation_id', reservationId)

    if (deleteByReservationError) {
      setCancellingId(null)
      showToast('予約をキャンセルできませんでした', 'error')
      return
    }

    if (slotId) {
      const { error: deleteByIdError } = await supabase
        .from('occupied_slots')
        .delete()
        .eq('id', slotId)

      if (deleteByIdError) {
        setCancellingId(null)
        showToast('予約をキャンセルできませんでした', 'error')
        return
      }
    }

    setCancellingId(null)
    setSelectedPendingRes(null)
    setSelectedSlot(null)
    showToast('予約をキャンセルしました', 'error')
    fetchSlots()
    fetchMonthSlots()
    fetchPendingReservations()
    fetchMonthPendingReservations()
    fetchMonthStats()
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-slate-800">稼働カレンダー</h1>
          <p className="text-xs text-slate-400 mt-0.5">車両ごとの稼働ブロックを管理します</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            {(['month', 'week'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={`px-3 h-8 transition-colors ${
                  viewMode === mode ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {mode === 'month' ? '月表示' : '週表示'}
              </button>
            ))}
          </div>
          {viewMode === 'week' && (
            <>
              <button onClick={() => setWeekStart((current) => addDays(current, -7))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm">
                ◀
              </button>
              <button
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="px-3 h-8 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                今週
              </button>
              <button onClick={() => setWeekStart((current) => addDays(current, 7))} className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm">
                ▶
              </button>
            </>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: `${jstMonthLabel()}確定`, value: monthStats.confirmed, color: 'text-teal-600', href: monthStats.confirmed > 0 ? '/business/reservations' : null, activeClass: 'border-teal-200 hover:bg-teal-50' },
          { label: `${jstMonthLabel()}完了`, value: monthStats.completed, color: 'text-green-600', href: null, activeClass: '' },
          { label: '申請中', value: monthStats.pending, color: monthStats.pending > 0 ? 'text-amber-600' : 'text-slate-400', href: monthStats.pending > 0 ? '/business/reservations' : null, activeClass: 'border-amber-200 hover:bg-amber-50' },
        ].map((item) =>
          item.href ? (
            <button key={item.label} onClick={() => navigate(item.href!)} className={`bg-white rounded-xl border py-2 px-3 text-center shadow-sm transition-colors ${item.activeClass}`}>
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </button>
          ) : (
            <div key={item.label} className="bg-white rounded-xl border border-slate-100 py-2 px-3 text-center shadow-sm">
              <p className="text-xs text-slate-400">{item.label}</p>
              <p className={`text-xl font-bold ${item.color}`}>{item.value}</p>
            </div>
          ),
        )}
      </div>

      {profileIncomplete && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm">
          <p className="text-amber-800 font-medium">プロフィールの必須項目が未設定です</p>
          <p className="text-amber-700 text-xs mt-0.5">対応エリアとキャンセル連絡先を設定すると検索に表示されます。</p>
          <Link to="/business/profile" className="text-amber-700 underline text-xs font-medium mt-1 inline-block">
            プロフィールを設定する
          </Link>
        </div>
      )}

      {vehicles.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {vehicles.map((vehicle) => (
            <button
              key={vehicle.id}
              onClick={() => setSelectedVehicleId(vehicle.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                selectedVehicleId === vehicle.id
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              {vehicle.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🚗</div>
          <p className="text-slate-700 font-medium">車両が登録されていません</p>
          <p className="text-sm text-slate-500 mt-1">プロフィール画面で車両を追加するとカレンダーを利用できます</p>
          <Link to="/business/profile" className="btn-primary inline-flex mt-4">
            車両を登録する
          </Link>
        </div>
      )}

      {vehicles.length > 0 && selectedVehicle && (
        <>
          {viewMode === 'month' ? (
            <>
              <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-3 shadow-sm">
                <button
                  type="button"
                  onClick={() => setMonthStart((current) => subMonths(current, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                >
                  ◀
                </button>
                <div className="text-center">
                  <p className="text-xs text-slate-400">{selectedVehicle.name}</p>
                  <h2 className="text-xl font-bold text-slate-800">{format(monthStart, 'yyyy年M月')}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setMonthStart((current) => addMonths(current, 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                >
                  ▶
                </button>
              </div>

              {monthLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <span className="spinner" />
                  <p className="text-sm text-slate-400">読み込み中...</p>
                </div>
              ) : fetchError ? (
                <div className="card text-center py-8">
                  <div className="text-3xl mb-2">!</div>
                  <p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
                  <button onClick={fetchMonthSlots} className="btn-secondary text-sm">
                    再読み込み
                  </button>
                </div>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100 bg-white shadow-sm">
                  <div className="grid grid-cols-7 border-b border-slate-200">
                    {['日', '月', '火', '水', '木', '金', '土'].map((label, index) => (
                      <div
                        key={label}
                        className={`border-r border-slate-100 py-2 text-center text-sm font-medium last:border-r-0 ${
                          index === 0 ? 'text-red-500' : index === 6 ? 'text-blue-500' : 'text-slate-500'
                        }`}
                      >
                        {label}
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {Array.from({ length: monthLeadingEmptyDays }).map((_, index) => (
                      <div key={`empty-start-${index}`} className="min-h-[80px] border-r border-b border-slate-100 bg-slate-50/40 last:border-r-0" />
                    ))}
                    {monthDays.map((date) => {
                      const dateStr = format(date, 'yyyy-MM-dd')
                      const todayFlag = isTodayJST(dateStr)
                      const past = isPastDay(date)
                      const dow = date.getDay()
                      const isSun = dow === 0
                      const isSat = dow === 6
                      const daySlots = monthSlotsForDay(date)
                      const dayPending = monthPendingReservations.filter(
                        (r) => r.reservation_date === dateStr && !daySlots.some((s) => s.reservation_id === r.id)
                      )
                      const visibleSlots = daySlots.slice(0, 3)
                      const overflowCount = daySlots.length - visibleSlots.length
                      return (
                        <div
                          key={dateStr}
                          className={`min-h-[80px] border-r border-b border-slate-100 p-2 last:border-r-0 ${
                            todayFlag
                              ? 'bg-teal-50 border-teal-300'
                              : past
                                ? 'bg-slate-50'
                                : 'bg-white'
                          }`}
                        >
                          <div
                            className={`mb-1 text-sm font-bold leading-none ${
                              todayFlag
                                ? 'text-teal-600'
                                : isSun
                                  ? 'text-red-500'
                                  : isSat
                                    ? 'text-blue-500'
                                    : 'text-slate-700'
                            }`}
                          >
                            {format(date, 'd')}
                          </div>
                          <div className="space-y-1">
                            {visibleSlots.map((slot) => (
                              <button
                                key={slot.id}
                                type="button"
                                onClick={() => setSelectedSlot(slot)}
                                className={`block w-full truncate rounded-full px-2 py-1 text-left text-xs ${
                                  slot.reservation_id
                                    ? 'bg-teal-100 text-teal-800 hover:bg-teal-200'
                                    : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                                }`}
                              >
                                {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)} {slot.reservation_id ? slot.reservation?.patient_name ?? '' : 'ブロック'}
                              </button>
                            ))}
                            {dayPending.map((res) =>
                              res.status === 'confirmed' ? (
                                <div key={`p-${res.id}`} onClick={() => setSelectedPendingRes(res)} className="block w-full truncate rounded-full px-2 py-1 text-xs bg-teal-100 text-teal-800 border border-teal-300 cursor-pointer">
                                  確定 {res.start_time.slice(0, 5)}〜{res.end_time.slice(0, 5)} {res.patient_name}
                                </div>
                              ) : (
                                <div key={`p-${res.id}`} onClick={() => setSelectedPendingRes(res)} className="block w-full truncate rounded-full px-2 py-1 text-xs bg-amber-100 text-amber-700 border border-dashed border-amber-400 cursor-pointer">
                                  仮 {res.start_time.slice(0, 5)}〜{res.end_time.slice(0, 5)} {res.patient_name}
                                </div>
                              )
                            )}
                            {overflowCount > 0 && (
                              <div className="px-1 text-xs text-slate-400">+{overflowCount}件</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    {Array.from({ length: monthTrailingEmptyDays }).map((_, index) => (
                      <div key={`empty-end-${index}`} className="min-h-[80px] border-r border-b border-slate-100 bg-slate-50/40 last:border-r-0" />
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
          <p className="text-xs text-slate-400 mb-2 text-center">
            {selectedVehicle.name} / {format(weekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(addDays(weekStart, 6), 'M月d日', { locale: ja })}
          </p>

          <div className="grid grid-cols-7 gap-1 mb-3 bg-white rounded-xl border border-slate-100 px-2 py-2 shadow-sm">
            {weekDays.map((date) => {
              const dateStr = format(date, 'yyyy-MM-dd')
              const daySlots = !loading ? slotsForDay(date) : []
              const past = isPastDay(date)
              const todayFlag = isTodayJST(dateStr)
              const dow = date.getDay()
              const isSun = dow === 0
              const isSat = dow === 6
              const barColor = past ? 'bg-slate-300' : loading ? 'bg-slate-100 animate-pulse' : daySlots.length > 0 ? 'bg-teal-400' : 'bg-green-400'
              return (
                <div key={dateStr} className="text-center">
                  <p className={`text-[10px] font-medium leading-tight ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                    {format(date, 'E', { locale: ja })}
                  </p>
                  <p className={`text-xs font-bold leading-tight ${todayFlag ? 'text-teal-600' : past ? 'text-slate-300' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                    {format(date, 'd')}
                  </p>
                  <div className={`h-1.5 rounded-full mt-0.5 ${barColor}`} />
                </div>
              )
            })}
          </div>

          {!loading && !fetchError && (
            <div className="flex items-center gap-3 mb-2 px-1 flex-wrap">
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
                <span className="text-[10px] text-slate-400">稼働あり</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                <span className="text-[10px] text-slate-400">全日空き</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                <span className="text-[10px] text-slate-400">過去日</span>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <span className="spinner" />
              <p className="text-sm text-slate-400">読み込み中...</p>
            </div>
          ) : fetchError ? (
            <div className="card text-center py-8">
              <div className="text-3xl mb-2">!</div>
              <p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
              <button onClick={fetchSlots} className="btn-secondary text-sm">
                再読み込み
              </button>
            </div>
          ) : (
            <div className={`bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden select-none ${addingSlot ? 'opacity-60 pointer-events-none' : ''}`} onTouchMove={handleGridTouchMove}>
              <div className="grid border-b border-slate-200 sticky top-0 z-30 bg-white" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
                <div className="h-10 border-r border-slate-100" />
                {weekDays.map((date) => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const todayFlag = isTodayJST(dateStr)
                  const dow = date.getDay()
                  const isSun = dow === 0
                  const isSat = dow === 6
                  const isClosedDay = closedDays.includes(dow)
                  return (
                    <div key={dateStr} className={`py-1.5 px-0.5 text-center border-l border-slate-100 ${todayFlag ? 'bg-teal-50' : ''}`}>
                      <p className={`text-[10px] font-medium ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                        {format(date, 'E', { locale: ja })}
                      </p>
                      <p className={`text-sm font-bold leading-tight ${todayFlag ? 'text-teal-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                        {format(date, 'd')}
                      </p>
                      {isClosedDay && <span className="text-[8px] text-red-300 leading-none">休業</span>}
                    </div>
                  )
                })}
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 360px)', minHeight: '360px' }}>
                <div className="grid" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
                  <div className="border-r border-slate-100">
                    {Array.from({ length: TOTAL_SLOTS }).map((_, index) => (
                      <div key={index} style={{ height: CELL_H }} className={`relative ${index % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50'}`}>
                        {index % 2 === 0 && (
                          <span className="absolute -top-2 right-1 text-[9px] text-slate-300 leading-none pointer-events-none">
                            {slotToTime(index)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  {weekDays.map((date, dayIdx) => {
                    const dateStr = format(date, 'yyyy-MM-dd')
                    const past = isPastDay(date)
                    const todayFlag = isTodayJST(dateStr)
                    const daySlots = slotsForDay(date)
                    return (
                      <div key={dateStr} className={`relative border-l border-slate-100 ${todayFlag ? 'bg-teal-50/20' : ''}`} style={{ height: TOTAL_SLOTS * CELL_H }}>
                        {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                          const inBizHours = slotIdx >= bizStartSlot && slotIdx < bizEndSlot
                          const isDragCell = drag?.dayIdx === dayIdx && slotIdx >= Math.min(drag.startSlot, drag.endSlot) && slotIdx <= Math.max(drag.startSlot, drag.endSlot)
                          return (
                            <div
                              key={slotIdx}
                              data-day={dayIdx}
                              data-slot={slotIdx}
                              style={{ height: CELL_H, top: slotIdx * CELL_H }}
                              className={[
                                'absolute left-0 right-0 z-0',
                                slotIdx % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50',
                                inBizHours ? '' : 'bg-slate-50/60',
                                isDragCell ? '!bg-teal-100' : '',
                                past ? 'cursor-default' : 'cursor-crosshair hover:bg-teal-50/50',
                              ].join(' ')}
                              onMouseDown={!past ? () => handleCellMouseDown(dayIdx, slotIdx) : undefined}
                              onMouseEnter={!past ? () => handleCellMouseEnter(dayIdx, slotIdx) : undefined}
                              onTouchStart={!past ? handleCellTouchStart(dayIdx, slotIdx) : undefined}
                            />
                          )
                        })}

                        <div className="absolute left-0 w-0.5 bg-teal-200/80 pointer-events-none z-10" style={{ top: bizStartSlot * CELL_H, height: (bizEndSlot - bizStartSlot) * CELL_H }} />

                        {daySlots.map((slot) => {
                          const startSlot = timeToSlot(slot.start_time)
                          const endSlot = timeToSlot(slot.end_time)
                          const top = startSlot * CELL_H + 1
                          const height = Math.max((endSlot - startSlot) * CELL_H - 2, 6)
                          const status = slot.reservation?.status
                          const colorClass =
                            slot.reservation_id === null
                              ? 'bg-green-400 border-green-500'
                              : status === 'pending'
                                ? 'bg-amber-400 border-amber-500'
                                : 'bg-teal-400 border-teal-500'
                          return (
                            <div
                              key={slot.id}
                              style={{ top, height, left: 3, right: 3 }}
                              className={`absolute ${colorClass} border rounded text-white overflow-hidden cursor-pointer z-20 hover:brightness-95 transition-all`}
                              onMouseDown={(e) => { e.stopPropagation(); setSelectedSlot(slot) }}
                              onTouchStart={(e) => { e.stopPropagation(); setSelectedSlot(slot) }}
                            >
                              <div className="px-1 py-0.5 text-[9px] font-medium leading-tight whitespace-nowrap overflow-hidden">
                                <span>{slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}</span>
                                {slot.reservation_id === null ? (
                                  <span className="ml-1 opacity-90">手動</span>
                                ) : (
                                  <span className="ml-1 opacity-90">{status === 'pending' ? '申請中' : '予約'}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}

                        {pendingReservations
                          .filter((res) => res.reservation_date === dateStr && !slots.some((s) => s.reservation_id === res.id))
                          .map((res) => {
                            const startSlot = timeToSlot(res.start_time)
                            const endSlot = timeToSlot(res.end_time)
                            const top = startSlot * CELL_H + 1
                            const height = Math.max((endSlot - startSlot) * CELL_H - 2, 6)
                            const isConfirmed = res.status === 'confirmed'
                            return isConfirmed ? (
                              <div
                                key={`pending-${res.id}`}
                                style={{ top, height, left: 3, right: 3 }}
                                className="absolute bg-teal-400 border border-teal-500 rounded overflow-hidden cursor-pointer z-15"
                                onMouseDown={(e) => { e.stopPropagation(); setSelectedPendingRes(res) }}
                                onTouchStart={(e) => { e.stopPropagation(); setSelectedPendingRes(res) }}
                              >
                                <div className="px-1 py-0.5 text-[9px] font-bold leading-tight whitespace-nowrap overflow-hidden text-white">
                                  <span className="mr-0.5">確定</span>
                                  <span>{res.start_time.slice(0, 5)}〜{res.end_time.slice(0, 5)}</span>
                                  <span className="ml-1 font-normal opacity-90">{res.patient_name}</span>
                                </div>
                              </div>
                            ) : (
                              <div
                                key={`pending-${res.id}`}
                                style={{ top, height, left: 3, right: 3 }}
                                className="absolute border-2 border-dashed border-amber-500 bg-amber-50 rounded overflow-hidden cursor-pointer z-15"
                                onMouseDown={(e) => { e.stopPropagation(); setSelectedPendingRes(res) }}
                                onTouchStart={(e) => { e.stopPropagation(); setSelectedPendingRes(res) }}
                              >
                                <div className="px-1 py-0.5 text-[9px] font-bold leading-tight whitespace-nowrap overflow-hidden text-amber-700">
                                  <span className="mr-0.5">仮</span>
                                  <span>{res.start_time.slice(0, 5)}〜{res.end_time.slice(0, 5)}</span>
                                  <span className="ml-1 font-normal opacity-80">{res.patient_name}</span>
                                </div>
                              </div>
                            )
                          })}

                        {drag?.dayIdx === dayIdx && (() => {
                          const startSlot = Math.min(drag.startSlot, drag.endSlot)
                          const endSlot = Math.max(drag.startSlot, drag.endSlot) + 1
                          return (
                            <div style={{ top: startSlot * CELL_H + 1, height: (endSlot - startSlot) * CELL_H - 2, left: 3, right: 3 }} className="absolute bg-teal-200/80 border-2 border-teal-400 rounded pointer-events-none z-30 flex items-center justify-center">
                              <span className="text-[10px] text-teal-800 font-semibold">
                                {slotToTime(startSlot)}〜{slotToTime(endSlot)}
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
            </>
          )}
        </>
      )}

      {selectedSlot && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setCompleteConfirmId(null) }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-bold text-slate-800 text-base">
                  {selectedSlot.start_time.slice(0, 5)}〜{selectedSlot.end_time.slice(0, 5)}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {format(parseISO(selectedSlot.date), 'M月d日（E）', { locale: ja })}
                </p>
              </div>
              <button onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setCompleteConfirmId(null) }} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>

            {selectedSlot.reservation_id === null ? (
              <div className="space-y-3">
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                  手動で登録した稼働ブロックです
                </div>
                {deleteConfirmId === selectedSlot.id ? (
                  <div className="flex gap-2">
                    <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary">
                      キャンセル
                    </button>
                    <button onClick={() => handleDeleteSlot(selectedSlot.id)} className="flex-1 bg-red-500 text-white rounded-xl px-4 py-2 hover:bg-red-600 font-medium">
                      削除する
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleteConfirmId(selectedSlot.id)} className="w-full bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-100">
                    ブロックを削除
                  </button>
                )}
              </div>
            ) : selectedSlot.reservation ? (
              <div className="space-y-3 text-sm text-slate-700">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                  <p>
                    <span className="text-slate-500">状態:</span>{' '}
                    <span className="font-medium">{selectedSlot.reservation.status === 'pending' ? '申請中' : selectedSlot.reservation.status === 'confirmed' ? '確定' : selectedSlot.reservation.status}</span>
                  </p>
                  <p>
                    <span className="text-slate-500">連絡元:</span>{' '}
                    {selectedSlot.reservation.source === 'phone'
                      ? `電話${selectedSlot.reservation.caller_name ? ` / ${selectedSlot.reservation.caller_name}` : ''}`
                      : `${selectedSlot.reservation.hospitals?.name ?? '病院'} / ${selectedSlot.reservation.contact_name}`}
                  </p>
                  <p><span className="text-slate-500">患者名:</span> {selectedSlot.reservation.patient_name}</p>
                  <p>
                    <span className="text-slate-500">機材:</span>{' '}
                    {EQUIPMENT_LABELS[selectedSlot.reservation.equipment] ?? selectedSlot.reservation.equipment}
                    {selectedSlot.reservation.equipment_rental ? ' / 貸出あり' : ''}
                  </p>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">患者住所</p>
                    <a href={mapsUrl(selectedSlot.reservation.patient_address)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                      {selectedSlot.reservation.patient_address}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">行き先</p>
                    <a href={mapsUrl(selectedSlot.reservation.destination)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                      {selectedSlot.reservation.destination}
                    </a>
                  </div>
                  {(selectedSlot.reservation.ward || selectedSlot.reservation.room_number) && (
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">病棟・病室</p>
                      <p className="text-slate-700">{[selectedSlot.reservation.ward, selectedSlot.reservation.room_number].filter(Boolean).join(' ')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">同乗者</p>
                    <p className="text-slate-700">{selectedSlot.reservation.companion_count === 0 ? 'なし' : `${selectedSlot.reservation.companion_count}人`}</p>
                  </div>
                  {selectedSlot.reservation.notes && (
                    <div>
                      <p className="text-xs text-slate-400 mb-0.5">備考</p>
                      <p className="text-slate-700 whitespace-pre-wrap">{selectedSlot.reservation.notes}</p>
                    </div>
                  )}
                </div>

                {selectedSlot.reservation.status === 'confirmed' && (
                  deleteConfirmId === `cancel-${selectedSlot.reservation.id}` ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                      <p className="text-sm text-red-800 font-medium text-center">この予約をキャンセルしますか？</p>
                      <div className="flex gap-2">
                        <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary">
                          戻る
                        </button>
                        <button onClick={() => handleCancelReservation(selectedSlot.reservation!.id, selectedSlot.id)} disabled={cancellingId === selectedSlot.reservation.id} className="flex-1 bg-red-500 text-white rounded-xl px-4 py-2 hover:bg-red-600 font-medium disabled:opacity-50">
                          {cancellingId === selectedSlot.reservation.id ? '処理中...' : 'キャンセルする'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setDeleteConfirmId(`cancel-${selectedSlot.reservation!.id}`)} disabled={cancellingId === selectedSlot.reservation.id} className="w-full bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                      予約をキャンセル
                    </button>
                  )
                )}

                {completeConfirmId === selectedSlot.reservation.id ? (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm text-orange-800 font-medium text-center">この予約を完了にしますか？</p>
                    <div className="flex gap-2">
                      <button onClick={() => setCompleteConfirmId(null)} className="flex-1 btn-secondary">
                        キャンセル
                      </button>
                      <button onClick={() => handleComplete(selectedSlot.reservation!.id)} disabled={completingId === selectedSlot.reservation.id} className="flex-1 bg-orange-500 text-white rounded-xl px-4 py-2 hover:bg-orange-600 font-medium disabled:opacity-50">
                        {completingId === selectedSlot.reservation.id ? '処理中...' : '完了にする'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setCompleteConfirmId(selectedSlot.reservation!.id)} disabled={selectedSlot.reservation.status === 'completed'} className="w-full btn-primary disabled:opacity-50">
                    {selectedSlot.reservation.status === 'completed' ? '完了済み' : '完了にする'}
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">予約詳細を取得できませんでした</p>
            )}
          </div>
        </div>
      )}

      {selectedPendingRes && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => { setSelectedPendingRes(null); setCancelPendingConfirmId(null) }}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${selectedPendingRes.status === 'confirmed' ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                    {selectedPendingRes.status === 'confirmed' ? '確定' : '仮申請'}
                  </span>
                  <p className="font-bold text-slate-800 text-base">
                    {selectedPendingRes.start_time.slice(0, 5)}〜{selectedPendingRes.end_time.slice(0, 5)}
                  </p>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {format(parseISO(selectedPendingRes.reservation_date), 'M月d日(E)', { locale: ja })}
                </p>
              </div>
              <button onClick={() => { setSelectedPendingRes(null); setCancelPendingConfirmId(null) }} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm text-slate-700">
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1.5">
                <p>
                  <span className="text-slate-500">病院名/担当者:</span>{' '}
                  {selectedPendingRes.source === 'phone'
                    ? `電話${selectedPendingRes.caller_name ? ` / ${selectedPendingRes.caller_name}` : ''}`
                    : `${selectedPendingRes.hospitals?.name ?? '病院未設定'} / ${selectedPendingRes.contact_name}`}
                </p>
                <p><span className="text-slate-500">患者名:</span> {selectedPendingRes.patient_name}</p>
                <p>
                  <span className="text-slate-500">機材:</span>{' '}
                  {EQUIPMENT_LABELS[selectedPendingRes.equipment] ?? selectedPendingRes.equipment}
                  {selectedPendingRes.equipment_rental ? ' / 貸出あり' : ''}
                </p>
                <p><span className="text-slate-500">同乗者数:</span> {selectedPendingRes.companion_count === 0 ? 'なし' : `${selectedPendingRes.companion_count}人`}</p>
              </div>

              <div className="space-y-2">
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">患者住所</p>
                  <a href={mapsUrl(selectedPendingRes.patient_address)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                    {selectedPendingRes.patient_address}
                  </a>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-0.5">行き先</p>
                  <a href={mapsUrl(selectedPendingRes.destination)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline">
                    {selectedPendingRes.destination}
                  </a>
                </div>
                {(selectedPendingRes.ward || selectedPendingRes.room_number) && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">病棟・病室</p>
                    <p className="text-slate-700">{[selectedPendingRes.ward, selectedPendingRes.room_number].filter(Boolean).join(' ')}</p>
                  </div>
                )}
                {selectedPendingRes.notes && (
                  <div>
                    <p className="text-xs text-slate-400 mb-0.5">備考</p>
                    <p className="text-slate-700 whitespace-pre-wrap">{selectedPendingRes.notes}</p>
                  </div>
                )}
              </div>

              {cancelPendingConfirmId === selectedPendingRes.id ? (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2">
                  <p className="text-sm text-red-800 font-medium text-center">この予約をキャンセルしますか？</p>
                  <div className="flex gap-2">
                    <button onClick={() => setCancelPendingConfirmId(null)} className="flex-1 btn-secondary">
                      戻る
                    </button>
                    <button onClick={() => handleCancelReservation(selectedPendingRes.id)} disabled={cancellingId === selectedPendingRes.id} className="flex-1 bg-red-500 text-white rounded-xl px-4 py-2 hover:bg-red-600 font-medium disabled:opacity-50">
                      {cancellingId === selectedPendingRes.id ? '処理中...' : 'キャンセルする'}
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setCancelPendingConfirmId(selectedPendingRes.id)} disabled={cancellingId === selectedPendingRes.id} className="w-full bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-red-100 disabled:opacity-50">
                  予約をキャンセル
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

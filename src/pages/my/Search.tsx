import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isBefore,
  parseISO,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { jstHour, jstTodayStr } from '../../lib/jst'
import { invokeNotifyWithRetry } from '../../lib/notifyInvoke'
import type { AvailabilitySlot, Business, Vehicle } from '../../types/database'
import { SERVICE_AREAS } from '../../lib/constants'

// 一般の方（ご利用者本人・ご家族）向けの検索・予約申請画面。
// src/pages/msw/Search.tsx をベースにしているが、以下が異なる:
//  - accepts_personal_requests=true の事業所のみを対象にする（RLSでも二重に担保されている）
//  - 病棟・病室は表示しない（GENERAL_USERS_PLAN.md §4.5）
//  - 連絡担当者は申込者本人（氏名は固定・電話番号は必須入力）
//  - お気に入り機能はMSW専用（favoritesテーブルがhospital_id前提のため）なので出さない
//  - 予約作成時に source: 'personal', requester_user_id を必ずセットする

function fmtDate(dateStr: string) {
  return format(parseISO(dateStr), 'M月d日（E）', { locale: ja })
}

const MAX_BUFFER_MINUTES = 120

function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, totalMinutes))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function overlapsWithBuffer(slotStart: string, slotEnd: string, reqStart: string, reqEnd: string, bufferMinutes: number): boolean {
  const s = toMinutes(slotStart)
  const e = toMinutes(slotEnd)
  const rs = toMinutes(reqStart) - bufferMinutes
  const re = toMinutes(reqEnd) + bufferMinutes
  return s < re && e > rs
}

type SearchResult = Business & {
  matchedSlot: AvailabilitySlot
  availableVehicles: Vehicle[]
}

type BookingForm = {
  patientName: string
  patientAddress: string
  destination: string
  equipment: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental: boolean
  notes: string
  companionCount: 0 | 1 | 2 | 3 | 4
  callerPhone: string
}

type PrefillState = {
  patientName?: string
  patientAddress?: string
  destination?: string
  equipment?: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental?: boolean
  notes?: string
}

type SearchPrefillState = {
  date?: string
  startTime?: string
  endTime?: string
  areas?: string[]
}

type VehicleWithBusiness = Vehicle & {
  businesses: Business | null
}

const EQUIPMENT_OPTIONS = [
  { value: 'wheelchair', label: '車椅子' },
  { value: 'reclining_wheelchair', label: 'リクライニング車椅子' },
  { value: 'stretcher', label: 'ストレッチャー' },
] as const

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

function formatHours(start: string | null, end: string | null) {
  if (!start || !end) return null
  return `${start.slice(0, 5)}〜${end.slice(0, 5)}`
}

function hasVehicleCapability(
  vehicles: Vehicle[],
  field:
    | 'has_wheelchair'
    | 'has_reclining_wheelchair'
    | 'has_stretcher'
    | 'rental_wheelchair'
    | 'rental_reclining_wheelchair'
    | 'rental_stretcher',
) {
  return vehicles.some((vehicle) => vehicle[field])
}

function defaultStartTime() {
  const hour = jstHour()
  const next = hour < 9 ? 9 : hour >= 17 ? 10 : hour + 1
  return `${String(next).padStart(2, '0')}:00`
}

function addHour(time: string, hours = 1) {
  const [h, m] = time.split(':').map(Number)
  return `${String(Math.min(h + hours, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'] as const

const HOUR_OPTIONS = Array.from({ length: 15 }, (_, index) => String(index + 7).padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, '0'))

export default function PersonalSearch() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { prefill?: PrefillState; searchPrefill?: SearchPrefillState } | null
  const prefill = state?.prefill
  const searchPrefill = state?.searchPrefill

  const [step, setStep] = useState<1 | 2 | 3>(1)

  const lsKey = (name: string) => `personal_${user?.id ?? 'anon'}_last_${name}`
  const today = jstTodayStr()
  const fullName = typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : ''
  const defaultPhone = typeof user?.user_metadata?.phone === 'string' ? user.user_metadata.phone : ''

  const [date, setDate] = useState(searchPrefill?.date ?? today)
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const d = new Date(date)
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [startTime, setStartTime] = useState(
    searchPrefill?.startTime ?? sessionStorage.getItem(lsKey('start_time')) ?? defaultStartTime(),
  )
  const [endTime, setEndTime] = useState(
    searchPrefill?.endTime ?? sessionStorage.getItem(lsKey('end_time')) ?? addHour(defaultStartTime()),
  )
  const [initStartHour, initStartMinute] = startTime.split(':')
  const [initEndHour, initEndMinute] = endTime.split(':')
  const [startHour, setStartHour] = useState(initStartHour)
  const [startMinute, setStartMinute] = useState(initStartMinute)
  const [endHour, setEndHour] = useState(initEndHour)
  const [endMinute, setEndMinute] = useState(initEndMinute)
  const [areas, setAreas] = useState<string[]>(() => {
    if (searchPrefill?.areas) return searchPrefill.areas
    try { return JSON.parse(sessionStorage.getItem(lsKey('areas')) ?? '[]') } catch { return [] }
  })
  const [searchEquipment, setSearchEquipment] = useState<'wheelchair' | 'reclining_wheelchair' | 'stretcher'>(
    (prefill?.equipment) ??
    (sessionStorage.getItem(lsKey('equipment')) as 'wheelchair' | 'reclining_wheelchair' | 'stretcher' | null) ??
    'wheelchair'
  )
  const [needFemale, setNeedFemale] = useState(false)
  const [needLongDistance, setNeedLongDistance] = useState(false)
  const [needSameDay, setNeedSameDay] = useState(false)

  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedBusiness, setSelectedBusiness] = useState<SearchResult | null>(null)
  const [previewBusiness, setPreviewBusiness] = useState<SearchResult | null>(null)

  const [form, setForm] = useState<BookingForm>({
    patientName: prefill?.patientName ?? '',
    patientAddress: prefill?.patientAddress ?? '',
    destination: prefill?.destination ?? '',
    equipment:
      prefill?.equipment ??
      (sessionStorage.getItem(lsKey('equipment')) as BookingForm['equipment'] | null) ??
      'wheelchair',
    equipmentRental: prefill?.equipmentRental ?? false,
    notes: prefill?.notes ?? '',
    companionCount: 0,
    callerPhone: defaultPhone,
  })
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const [confirmed, setConfirmed] = useState<{
    cancelPhone: string | null
    businessName: string
    date: string
    startTime: string
    endTime: string
    patientName: string
    equipment: string
  } | null>(null)
  const hasEndTimeError = endTime <= startTime

  const syncEndTime = (hour: string, minute: string) => {
    setEndHour(hour)
    setEndMinute(minute)
    setEndTime(`${hour}:${minute}`)
  }

  const syncStartTime = (hour: string, minute: string) => {
    const newStartTime = `${hour}:${minute}`
    setStartHour(hour)
    setStartMinute(minute)
    setStartTime(newStartTime)

    if (endTime <= newStartTime) {
      const nextHour = String(Math.min(parseInt(hour, 10) + 1, 21)).padStart(2, '0')
      syncEndTime(nextHour, minute)
    }
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewBusiness(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const selected = parseISO(date)
    if (!Number.isNaN(selected.getTime())) {
      setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
    }
  }, [date])

  const handleSearch = async () => {
    if (startTime >= endTime) {
      setSearchError('終了時刻は開始時刻より後にしてください')
      return
    }

    setSearchError('')
    setSearching(true)
    sessionStorage.setItem(lsKey('areas'), JSON.stringify(areas))
    sessionStorage.setItem(lsKey('start_time'), startTime)
    sessionStorage.setItem(lsKey('end_time'), endTime)

    const { data: busySlots, error: busyError } = await supabase
      .from('occupied_slots')
      .select('vehicle_id, start_time, end_time')
      .eq('date', date)
      .lt('start_time', minutesToTime(toMinutes(endTime) + MAX_BUFFER_MINUTES))
      .gt('end_time', minutesToTime(toMinutes(startTime) - MAX_BUFFER_MINUTES))

    if (busyError) {
      setSearchError('検索に失敗しました。しばらくしてから再度お試しください。')
      setSearching(false)
      return
    }

    const busySlotsByVehicle = new Map<string, Array<{ start_time: string; end_time: string }>>()
    for (const slot of (busySlots ?? []) as Array<{ vehicle_id: string | null; start_time: string; end_time: string }>) {
      if (!slot.vehicle_id) continue
      const list = busySlotsByVehicle.get(slot.vehicle_id) ?? []
      list.push({ start_time: slot.start_time, end_time: slot.end_time })
      busySlotsByVehicle.set(slot.vehicle_id, list)
    }

    const { data: rawVehicles, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*, businesses(*)')
      .eq('active', true)
      .order('sort_order', { ascending: true })

    if (vehicleError) {
      setSearchError('検索に失敗しました。しばらくしてから再度お試しください。')
      setSearching(false)
      return
    }

    const grouped = new Map<string, { business: Business; availableVehicles: Vehicle[] }>()
    for (const vehicle of ((rawVehicles as unknown as VehicleWithBusiness[] | null) ?? [])) {
      const business = vehicle.businesses
      if (!business || !business.approved) continue
      // 個人（一般の方）は「個人予約を受け付ける」がオンの事業所のみ対象（RLS側にも同条件あり）
      if (!business.accepts_personal_requests) continue
      const subStatus = business.subscription_status ?? 'none'
      const isWithinPastDueGrace = subStatus === 'past_due' && (() => {
        if (!business.past_due_since) return true
        const daysSince = (Date.now() - new Date(business.past_due_since).getTime()) / (1000 * 60 * 60 * 24)
        return daysSince <= 14
      })()
      if (subStatus !== 'active' && subStatus !== 'trialing' && !isWithinPastDueGrace) continue
      if (areas.length > 0 && !areas.some(a => business.service_areas?.includes(a))) continue
      const equipField = searchEquipment === 'wheelchair' ? 'has_wheelchair'
        : searchEquipment === 'reclining_wheelchair' ? 'has_reclining_wheelchair'
        : 'has_stretcher'
      if (!vehicle[equipField]) continue
      if (needFemale && !business.has_female_caregiver) continue
      if (needLongDistance && !business.long_distance) continue
      if (needSameDay && !business.same_day) continue
      const bufferMinutes = business.buffer_minutes ?? 0
      const isBusy = (busySlotsByVehicle.get(vehicle.id) ?? []).some((slot) =>
        overlapsWithBuffer(slot.start_time, slot.end_time, startTime, endTime, bufferMinutes),
      )
      if (isBusy) continue

      const existing = grouped.get(business.id)
      if (existing) {
        existing.availableVehicles.push(vehicle)
      } else {
        grouped.set(business.id, { business, availableVehicles: [vehicle] })
      }
    }

    const matched = Array.from(grouped.values()).map<SearchResult>(({ business, availableVehicles }) => ({
      ...business,
      availableVehicles,
      matchedSlot: {
        id: `vehicle-${availableVehicles[0].id}`,
        business_id: business.id,
        date,
        start_time: startTime,
        end_time: endTime,
        is_available: true,
        capacity: availableVehicles.length,
        confirmed_count: 0,
        created_at: '',
      },
    }))

    matched.sort((a, b) => a.name.localeCompare(b.name, 'ja'))

    setResults(matched)
    setSearching(false)
    setStep(2)
  }

  const handleSelectBusiness = (business: SearchResult) => {
    setSelectedBusiness(business)
    setForm((prev) => ({ ...prev, equipment: searchEquipment }))
    setStep(3)
  }

  const handleShowConfirm = () => {
    if (!user || !selectedBusiness) return
    if (!form.patientName.trim()) { setSubmitError('ご利用される方のお名前を入力してください'); return }
    if (!form.patientAddress.trim()) { setSubmitError('乗車地（ご住所）を入力してください'); return }
    if (!form.destination.trim()) { setSubmitError('行き先を入力してください'); return }
    if (!form.callerPhone.trim()) { setSubmitError('電話番号を入力してください'); return }
    setSubmitError('')
    setShowConfirm(true)
  }

  const handleSubmitRequest = async () => {
    if (!user || !selectedBusiness) return
    setShowConfirm(false)

    setSubmitting(true)
    setSubmitError('')
    sessionStorage.setItem(lsKey('equipment'), form.equipment)

    const finalEquipField = form.equipment === 'wheelchair' ? 'has_wheelchair'
      : form.equipment === 'reclining_wheelchair' ? 'has_reclining_wheelchair'
      : 'has_stretcher'
    const vehicleId = selectedBusiness.availableVehicles
      .find((v) => v.business_id === selectedBusiness.id && v[finalEquipField])?.id ?? null

    if (!vehicleId) {
      setSubmitError('選択した機材に対応する空き車両が見つかりませんでした。お手数ですが再度検索してください。')
      setSubmitting(false)
      return
    }

    // ── 申込直前に最新の空き状況を再確認（検索後に別の予約が入った場合のダブルブッキング防止）──
    if (vehicleId) {
      const { count: slotConflicts } = await supabase
        .from('occupied_slots')
        .select('*', { count: 'exact', head: true })
        .eq('vehicle_id', vehicleId)
        .eq('date', date)
        .lt('start_time', endTime)
        .gt('end_time', startTime)
      if ((slotConflicts ?? 0) > 0) {
        setSubmitError('この時間帯はすでに予約が入っています。お手数ですが再度検索してください。')
        setSubmitting(false)
        return
      }
    }
    const { count: resConflicts } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', selectedBusiness.id)
      .in('status', ['pending', 'confirmed'])
      .eq('reservation_date', date)
      .lt('start_time', endTime)
      .gt('end_time', startTime)
    if ((resConflicts ?? 0) > 0) {
      setSubmitError('この時間帯はすでに予約申請が入っています。お手数ですが再度検索してください。')
      setSubmitting(false)
      return
    }
    // ────────────────────────────────────────────────────────────────────────────

    const { data: newReservation, error: reservationError } = await supabase
      .from('reservations')
      .insert({
        business_id: selectedBusiness.id,
        hospital_id: null,
        requester_user_id: user.id,
        source: 'personal',
        slot_id: null,
        vehicle_id: vehicleId,
        contact_name: fullName || 'ご本人・ご家族',
        caller_name: fullName || null,
        caller_phone: form.callerPhone.trim(),
        patient_name: form.patientName.trim(),
        patient_address: form.patientAddress.trim(),
        destination: form.destination.trim(),
        equipment: form.equipment,
        equipment_rental: form.equipmentRental,
        notes: form.notes.trim() || null,
        has_companion: form.companionCount > 0,
        companion_count: form.companionCount,
        reservation_date: date,
        start_time: startTime,
        end_time: endTime,
        status: 'pending',
      })
      .select('id')
      .single()

    if (reservationError) {
      setSubmitError('申請に失敗しました。しばらくしてから再度お試しください。')
      setSubmitting(false)
      return
    }

    if (newReservation?.id) {
      invokeNotifyWithRetry('send-request-received', { reservation_id: newReservation.id })
        .then((ok) => { if (!ok) showToast('申請は完了しましたが、事業所への通知メール送信に失敗しました。念のため事業所へ直接ご確認ください。', 'error') })
    }

    setConfirmed({
      cancelPhone: selectedBusiness.cancel_phone,
      businessName: selectedBusiness.name,
      date,
      startTime,
      endTime,
      patientName: form.patientName.trim(),
      equipment: form.equipment,
    })
    setSubmitting(false)
  }

  const equipmentLabel = EQUIPMENT_OPTIONS.find((option) => option.value === form.equipment)?.label ?? form.equipment

  const todayDate = useMemo(() => startOfDay(parseISO(today)), [today])
  const calendarDays = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfMonth(calendarMonth),
        end: endOfMonth(calendarMonth),
      }),
    [calendarMonth],
  )
  const calendarPadding = useMemo(() => Array.from({ length: getDay(startOfMonth(calendarMonth)) }), [calendarMonth])

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card py-8">
          <div className="text-5xl mb-4 text-center">✓</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">予約申請を送信しました</h2>
          <p className="text-sm text-slate-500 mb-4 text-center">事業所からの確認連絡をお待ちください</p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-1.5 text-sm">
            <div className="flex gap-3">
              <span className="text-slate-500 w-20 flex-shrink-0">事業所</span>
              <span className="font-semibold text-slate-800">{confirmed.businessName}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-20 flex-shrink-0">日時</span>
              <span className="font-semibold text-slate-800">
                {fmtDate(confirmed.date)} {confirmed.startTime.slice(0, 5)}〜{confirmed.endTime.slice(0, 5)}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-20 flex-shrink-0">ご利用者</span>
              <span className="font-semibold text-slate-800">{confirmed.patientName}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-20 flex-shrink-0">機材</span>
              <span className="font-semibold text-slate-800">
                {EQUIPMENT_OPTIONS.find((option) => option.value === confirmed.equipment)?.label ?? confirmed.equipment}
              </span>
            </div>
          </div>

          {confirmed.cancelPhone && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-left text-sm mb-5">
              <p className="font-medium text-teal-800 mb-1">急ぎの変更は事業所へご連絡ください</p>
              <a href={`tel:${confirmed.cancelPhone}`} className="text-lg font-bold text-teal-900 block mt-1">
                TEL {confirmed.cancelPhone}
              </a>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => navigate('/my/reservations')} className="btn-secondary flex-1">
              予約一覧を見る
            </button>
            <button
              onClick={() => {
                setStep(1)
                setConfirmed(null)
                setSelectedBusiness(null)
                const lastEquipment =
                  (sessionStorage.getItem(lsKey('equipment')) as BookingForm['equipment'] | null) ?? 'wheelchair'
                setSearchEquipment(lastEquipment)
                setForm({
                  patientName: '',
                  patientAddress: '',
                  destination: '',
                  equipment: lastEquipment,
                  equipmentRental: false,
                  notes: '',
                  companionCount: 0,
                  callerPhone: form.callerPhone,
                })
              }}
              className="btn-primary flex-1"
            >
              続けて申請する
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">介護タクシー事業所を探す</h1>
            <p className="text-sm text-slate-500 mt-1">日時と条件に合う介護タクシー事業所を探します</p>
          </div>

          <div className="card space-y-3">
            {/* カレンダー */}
            <div className="rounded-xl border border-slate-200 bg-white p-2">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => subMonths(current, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-700"
                  aria-label="前の月"
                >
                  ◀
                </button>
                <div className="text-3xl font-semibold text-slate-700">
                  {format(calendarMonth, 'yyyy年M月', { locale: ja })}
                </div>
                <button
                  type="button"
                  onClick={() => setCalendarMonth((current) => addMonths(current, 1))}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 text-xs text-slate-500 transition-colors hover:border-teal-300 hover:text-teal-700"
                  aria-label="次の月"
                >
                  ▶
                </button>
              </div>

              <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium">
                {WEEKDAY_LABELS.map((weekday, index) => (
                  <div
                    key={weekday}
                    className={
                      index === 0
                        ? 'py-1 text-red-400'
                        : index === 6
                          ? 'py-1 text-blue-400'
                          : 'py-1 text-slate-400'
                    }
                  >
                    {weekday}
                  </div>
                ))}

                {calendarPadding.map((_, index) => (
                  <div key={`pad-${index}`} className="h-16" />
                ))}

                {calendarDays.map((day) => {
                  const dayKey = format(day, 'yyyy-MM-dd')
                  const isPastDate = isBefore(day, todayDate)
                  const isToday = dayKey === today
                  const isSelected = dayKey === date
                  const weekday = getDay(day)

                  return (
                    <button
                      key={dayKey}
                      type="button"
                      onClick={() => setDate(dayKey)}
                      disabled={isPastDate}
                      className={`h-16 w-full rounded-lg text-3xl font-medium transition-colors ${
                        isSelected
                          ? 'bg-teal-600 text-white'
                          : isPastDate
                            ? 'pointer-events-none text-slate-300'
                            : isToday
                              ? 'border border-teal-400 text-slate-800 font-bold'
                              : weekday === 0
                                ? 'text-red-400 hover:bg-red-50'
                                : weekday === 6
                                  ? 'text-blue-400 hover:bg-blue-50'
                                  : 'text-slate-700 hover:bg-teal-50'
                      }`}
                    >
                      {format(day, 'd')}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 時刻 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="label">開始時刻</label>
                <div className="flex items-center gap-1.5">
                  <select
                    className="input-base w-20"
                    value={startHour}
                    onChange={(e) => syncStartTime(e.target.value, startMinute)}
                  >
                    {HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">時</span>
                  <select
                    className="input-base w-20"
                    value={startMinute}
                    onChange={(e) => syncStartTime(startHour, e.target.value)}
                  >
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>{minute}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">分</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="label">終了時刻</label>
                <div className="flex items-center gap-1.5">
                  <select
                    className="input-base w-20"
                    value={endHour}
                    onChange={(e) => syncEndTime(e.target.value, endMinute)}
                  >
                    {HOUR_OPTIONS.map((hour) => (
                      <option key={hour} value={hour}>{hour}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">時</span>
                  <select
                    className="input-base w-20"
                    value={endMinute}
                    onChange={(e) => syncEndTime(endHour, e.target.value)}
                  >
                    {MINUTE_OPTIONS.map((minute) => (
                      <option key={minute} value={minute}>{minute}</option>
                    ))}
                  </select>
                  <span className="text-sm text-slate-500">分</span>
                </div>
                {hasEndTimeError && <p className="text-xs text-red-500 mt-1">終了時刻は開始時刻より後にしてください</p>}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label">対応エリア</label>
                <div className="flex items-center gap-2">
                  {areas.length > 0 && (
                    <button type="button" onClick={() => setAreas([])}
                      className="text-xs text-slate-400 hover:text-slate-600">
                      クリア
                    </button>
                  )}
                  <span className="text-xs text-slate-400">
                    {areas.length === 0 ? '未選択（全エリア）' : `${areas.length}件選択中`}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {SERVICE_AREAS.map((serviceArea) => {
                  const selected = areas.includes(serviceArea)
                  return (
                    <button
                      key={serviceArea}
                      type="button"
                      onClick={() => setAreas(prev =>
                        selected ? prev.filter(a => a !== serviceArea) : [...prev, serviceArea]
                      )}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                      }`}
                    >
                      {serviceArea}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="label">使用機材 <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {EQUIPMENT_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setSearchEquipment(option.value)}
                    className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                      searchEquipment === option.value
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">選択した機材に対応している車両が空いている事業所のみ表示されます</p>
            </div>

            <div>
              <label className="label">その他のオプション</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-slate-700">
                {[
                  { label: '女性介助者', checked: needFemale, onChange: setNeedFemale },
                  { label: '長距離対応', checked: needLongDistance, onChange: setNeedLongDistance },
                  { label: '当日対応', checked: needSameDay, onChange: setNeedSameDay },
                ].map((item) => (
                  <label key={item.label} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(e) => item.onChange(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-teal-600"
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {searchError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{searchError}</p>}

            <button type="button" className="btn-primary w-full py-3" onClick={handleSearch} disabled={searching}>
              {searching ? '検索中...' : '空き事業所を検索する'}
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div>
            <button type="button" onClick={() => setStep(1)} className="text-teal-600 text-sm hover:underline">
              ← 条件入力に戻る
            </button>
            <h2 className="text-lg font-semibold text-slate-800 mt-1">検索結果</h2>
            <p className="text-sm text-slate-500">
              {fmtDate(date)} {startTime.slice(0, 5)}〜{endTime.slice(0, 5)} / {EQUIPMENT_OPTIONS.find(o => o.value === searchEquipment)?.label}
              {areas.length > 0 ? ` / ${areas.join('・')}` : ''}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-slate-700 font-medium">条件に合う事業所は見つかりませんでした</p>
              <p className="text-sm text-slate-500 mt-1">時間帯や条件を変更して再検索してください</p>
            </div>
          ) : (
            <div className="space-y-3">
              {results.map((business) => (
                <div key={business.id} className="card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setPreviewBusiness(business)}
                        className="text-2xl font-bold text-teal-700 hover:underline transition-colors leading-snug text-left"
                        title="詳細を見る"
                      >
                        {business.name} ›
                      </button>
                      {business.address && (
                        <a
                          href={mapsUrl(business.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-lg font-semibold text-teal-700 hover:underline mt-1 inline-block leading-relaxed"
                        >
                          地図 {business.address}
                        </a>
                      )}
                      {business.cancel_phone && (
                        <a href={`tel:${business.cancel_phone}`} className="text-xl font-bold text-teal-700 block mt-1 leading-snug">
                          TEL {business.cancel_phone}
                        </a>
                      )}
                      {formatHours(business.business_hours_start, business.business_hours_end) && (
                        <p className="text-sm text-slate-500 mt-1">
                          営業 {formatHours(business.business_hours_start, business.business_hours_end)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                        {EQUIPMENT_OPTIONS.find(o => o.value === searchEquipment)?.label}対応 {business.availableVehicles.length}台空き
                      </span>
                      {business.profile_image_url && (
                        <div className="w-14 h-14 rounded-xl border border-slate-100 shadow-sm bg-slate-50 overflow-hidden flex items-center justify-center flex-shrink-0">
                          <img
                            src={business.profile_image_url}
                            alt={business.name}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  {business.vehicle_image_urls && business.vehicle_image_urls.length > 0 && (
                    business.vehicle_image_urls.length === 1 ? (
                      <div className="bg-slate-50 rounded-lg border border-slate-100 overflow-hidden flex items-center justify-center h-20">
                        <img src={business.vehicle_image_urls[0]} alt="車両"
                          className="max-h-full max-w-full object-contain" />
                      </div>
                    ) : (
                      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {business.vehicle_image_urls.map((url, i) => (
                          <div key={i} className="flex-shrink-0 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden flex items-center justify-center" style={{ width: 80, height: 56 }}>
                            <img src={url} alt={`車両${i + 1}`} className="max-h-full max-w-full object-contain" />
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  <div className="flex flex-wrap gap-1">
                    {hasVehicleCapability(business.availableVehicles, 'has_wheelchair') && <span className="badge-blue">車椅子</span>}
                    {hasVehicleCapability(business.availableVehicles, 'has_reclining_wheelchair') && <span className="badge-blue">リクライニング</span>}
                    {hasVehicleCapability(business.availableVehicles, 'has_stretcher') && <span className="badge-blue">ストレッチャー</span>}
                    {hasVehicleCapability(business.availableVehicles, 'rental_wheelchair') && <span className="badge-green">車椅子貸出</span>}
                    {hasVehicleCapability(business.availableVehicles, 'rental_reclining_wheelchair') && <span className="badge-green">リクライニング貸出</span>}
                    {hasVehicleCapability(business.availableVehicles, 'rental_stretcher') && <span className="badge-green">ストレッチャー貸出</span>}
                    {business.has_female_caregiver && <span className="badge-green">女性介助者</span>}
                    {business.long_distance && <span className="badge-gray">長距離対応</span>}
                    {business.same_day && <span className="badge-gray">当日対応</span>}
                  </div>

                  {business.pricing && (
                    <p className="text-xs text-slate-600 whitespace-pre-wrap border-t pt-3">
                      <span className="font-medium">料金:</span> {business.pricing}
                    </p>
                  )}

                  {!business.pricing && business.pr_text && (
                    <p className="text-xs text-slate-500 border-t pt-3 line-clamp-2">{business.pr_text}</p>
                  )}

                  <div className="flex gap-2">
                    <button type="button" onClick={() => setPreviewBusiness(business)} className="btn-secondary flex-1">
                      詳細を見る
                    </button>
                    <button type="button" onClick={() => handleSelectBusiness(business)} className="btn-primary flex-1">
                      この事業所に申請
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {step === 3 && selectedBusiness && (
        <div className="space-y-4">
          <button type="button" onClick={() => setStep(2)} className="text-teal-600 text-sm hover:underline">
            ← 事業所一覧に戻る
          </button>

          <div className="card">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-semibold text-slate-800">{selectedBusiness.name} に申請</h2>
                <p className="text-xs text-slate-500 mt-1">
                  {fmtDate(date)} {startTime.slice(0, 5)}〜{endTime.slice(0, 5)}
                </p>
                <p className="text-xs text-slate-500 mt-1">{EQUIPMENT_OPTIONS.find(o => o.value === searchEquipment)?.label}対応車 {selectedBusiness.availableVehicles.length}台空き</p>
              </div>
              <button type="button" onClick={() => setPreviewBusiness(selectedBusiness)} className="btn-secondary text-sm">
                事業所詳細
              </button>
            </div>

            {prefill && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 font-medium">
                前回の内容を引き継いでいます。必要に応じて修正して送信してください。
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">ご利用される方のお名前 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="input-base"
                  value={form.patientName}
                  onChange={(e) => setForm((current) => ({ ...current, patientName: e.target.value }))}
                  maxLength={50}
                  placeholder="ご本人、またはご家族のお名前"
                />
              </div>

              <div>
                <label className="label">乗車地（ご住所） <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="input-base"
                  value={form.patientAddress}
                  onChange={(e) => setForm((current) => ({ ...current, patientAddress: e.target.value }))}
                  maxLength={300}
                  placeholder="ご自宅の住所など"
                />
                {form.patientAddress.trim() && (
                  <a href={mapsUrl(form.patientAddress)} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline mt-1 inline-block">
                    地図で確認する
                  </a>
                )}
              </div>

              <div>
                <label className="label">行き先 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="input-base"
                  value={form.destination}
                  onChange={(e) => setForm((current) => ({ ...current, destination: e.target.value }))}
                  maxLength={300}
                />
                {form.destination.trim() && (
                  <a href={mapsUrl(form.destination)} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-600 hover:underline mt-1 inline-block">
                    地図で確認する
                  </a>
                )}
              </div>

              <div>
                <label className="label">連絡先電話番号 <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  className="input-base"
                  value={form.callerPhone}
                  onChange={(e) => setForm((current) => ({ ...current, callerPhone: e.target.value }))}
                  maxLength={20}
                  placeholder="090-0000-0000"
                />
                <p className="text-xs text-slate-400 mt-1">事業所から確認のご連絡がつながる番号をご入力ください</p>
              </div>

              <div>
                <label className="label">使用機材 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <div
                      key={option.value}
                      aria-current={form.equipment === option.value}
                      className={`py-2 px-2 rounded-lg border text-sm font-medium text-center ${
                        form.equipment === option.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-slate-50 text-slate-400 border-slate-200'
                      }`}
                    >
                      {option.label}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  検索条件から自動入力されています。この事業所の空き車両（{selectedBusiness.availableVehicles.length}台）に基づく条件のため変更できません。他の機材で申請する場合は
                  <button type="button" onClick={() => setStep(1)} className="text-teal-600 hover:underline ml-0.5">条件を変えて再検索</button>
                  してください。
                </p>
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.equipmentRental}
                  onChange={(e) => setForm((current) => ({ ...current, equipmentRental: e.target.checked }))}
                  className="w-4 h-4 rounded"
                />
                <span className="text-sm text-slate-700">貸出が必要</span>
              </label>

              <div>
                <label className="label">同乗者</label>
                <div className="flex gap-2">
                  {[
                    { value: 0, label: 'なし' },
                    { value: 1, label: '1人' },
                    { value: 2, label: '2人' },
                    { value: 3, label: '3人' },
                    { value: 4, label: '4人' },
                  ].map(({ value, label }) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({ ...current, companionCount: value as BookingForm['companionCount'] }))
                      }
                      className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                        form.companionCount === value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">備考</label>
                <textarea
                  className="input-base resize-none"
                  rows={3}
                  maxLength={1000}
                  value={form.notes}
                  onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                  placeholder="伝えておきたいことがあればご記入ください"
                />
              </div>

              {submitError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>}

              <button type="button" onClick={handleShowConfirm} className="btn-primary w-full text-base py-3" disabled={submitting}>
                {submitting ? '申請中...' : '内容を確認して申請する →'}
              </button>
              <p className="text-xs text-slate-500 text-center">事業所が内容を確認後、対応可否を連絡します</p>

              {showConfirm && (
                <div
                  className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center"
                  onClick={() => setShowConfirm(false)}
                >
                  <div
                    className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <h3 className="text-lg font-bold text-slate-800">送信内容の確認</h3>
                    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                      <div className="divide-y divide-slate-200 text-sm">
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">事業所</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{selectedBusiness.name}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">日時</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{fmtDate(date) + ' ' + startTime + '〜' + endTime}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">ご利用者</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.patientName}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">乗車地</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.patientAddress}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">目的地</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.destination}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">電話番号</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.callerPhone}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">使用機材</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{equipmentLabel}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">機材貸出</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.equipmentRental ? 'あり' : 'なし'}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">同乗者</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.companionCount === 0 ? 'なし' : form.companionCount + '人'}</span>
                        </div>
                        <div className="flex gap-3 px-4 py-3">
                          <span className="w-24 flex-shrink-0 text-slate-500">備考</span>
                          <span className="min-w-0 flex-1 font-medium text-slate-800">{form.notes.trim() || 'なし'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        type="button"
                        className="btn-primary flex-1"
                        disabled={submitting}
                        onClick={() => {
                          setShowConfirm(false)
                          handleSubmitRequest()
                        }}
                      >
                        確定して送信する
                      </button>
                      <button type="button" className="btn-secondary flex-1" onClick={() => setShowConfirm(false)}>
                        戻って修正する
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {previewBusiness && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setPreviewBusiness(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">事業所詳細</h3>
              <button type="button" onClick={() => setPreviewBusiness(null)} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">
                ×
              </button>
            </div>

            <div className="space-y-3">
              {previewBusiness.profile_image_url && (
                <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden flex items-center justify-center">
                  <img
                    src={previewBusiness.profile_image_url}
                    alt={previewBusiness.name}
                    className="max-h-56 w-full object-contain"
                  />
                </div>
              )}
              {previewBusiness.vehicle_image_urls && previewBusiness.vehicle_image_urls.length > 0 && (
                previewBusiness.vehicle_image_urls.length === 1 ? (
                  <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden flex items-center justify-center">
                    <img src={previewBusiness.vehicle_image_urls[0]} alt="車両"
                      className="max-h-48 w-full object-contain" />
                  </div>
                ) : (
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                    {previewBusiness.vehicle_image_urls.map((url, i) => (
                      <div key={i} className="flex-shrink-0 bg-slate-50 rounded-lg border border-slate-100 overflow-hidden flex items-center justify-center" style={{ width: 140, height: 96 }}>
                        <img src={url} alt={`車両${i + 1}`} className="max-h-full max-w-full object-contain" />
                      </div>
                    ))}
                  </div>
                )
              )}
              <div>
                <p className="text-2xl font-bold text-slate-800 leading-snug">{previewBusiness.name}</p>
                {previewBusiness.address && (
                  <a href={mapsUrl(previewBusiness.address)} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-teal-700 hover:underline block mt-1 leading-relaxed">
                    地図 {previewBusiness.address}
                  </a>
                )}
                {previewBusiness.cancel_phone && (
                  <a href={`tel:${previewBusiness.cancel_phone}`} className="text-xl font-bold text-teal-700 block mt-1 leading-snug">
                    TEL {previewBusiness.cancel_phone}
                  </a>
                )}
                {previewBusiness.website_url && (
                  <a href={previewBusiness.website_url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 underline block mt-1">
                    ホームページ
                  </a>
                )}
              </div>

              <div className="flex flex-wrap gap-1">
                {hasVehicleCapability(previewBusiness.availableVehicles, 'has_wheelchair') && <span className="badge-blue">車椅子</span>}
                {hasVehicleCapability(previewBusiness.availableVehicles, 'has_reclining_wheelchair') && <span className="badge-blue">リクライニング</span>}
                {hasVehicleCapability(previewBusiness.availableVehicles, 'has_stretcher') && <span className="badge-blue">ストレッチャー</span>}
                {hasVehicleCapability(previewBusiness.availableVehicles, 'rental_wheelchair') && <span className="badge-green">車椅子貸出</span>}
                {hasVehicleCapability(previewBusiness.availableVehicles, 'rental_reclining_wheelchair') && <span className="badge-green">リクライニング貸出</span>}
                {hasVehicleCapability(previewBusiness.availableVehicles, 'rental_stretcher') && <span className="badge-green">ストレッチャー貸出</span>}
                {previewBusiness.has_female_caregiver && <span className="badge-green">女性介助者</span>}
                {previewBusiness.long_distance && <span className="badge-gray">長距離対応</span>}
                {previewBusiness.same_day && <span className="badge-gray">当日対応</span>}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700">
                空き車両: {previewBusiness.availableVehicles.length} 台
              </div>

              {previewBusiness.pr_text && <p className="text-sm text-slate-700 whitespace-pre-line">{previewBusiness.pr_text}</p>}
              {previewBusiness.pricing && <p className="text-sm text-slate-700 whitespace-pre-wrap"><span className="text-slate-500 text-xs">料金: </span>{previewBusiness.pricing}</p>}
              {previewBusiness.qualifications && (
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  <span className="text-slate-500 text-xs">資格・特徴: </span>
                  {previewBusiness.qualifications}
                </p>
              )}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setPreviewBusiness(null)} className="btn-secondary flex-1">
                  閉じる
                </button>
                <button type="button" onClick={() => { handleSelectBusiness(previewBusiness); setPreviewBusiness(null) }} className="btn-primary flex-1">
                  この事業所に申請
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        <Link to="/manual" target="_blank" className="hover:text-teal-600 hover:underline">使い方ガイド</Link>
      </p>
    </div>
  )
}

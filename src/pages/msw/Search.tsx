import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { jstDateOffsetStr, jstHour, jstTodayStr } from '../../lib/jst'
import type { AvailabilitySlot, Business, MswContact, Vehicle } from '../../types/database'
import { SERVICE_AREAS } from '../../lib/constants'

function fmtDate(dateStr: string) {
  return format(parseISO(dateStr), 'M月d日（E）', { locale: ja })
}

type FavoriteEntry = { business_id: string }

type SearchResult = Business & {
  matchedSlot: AvailabilitySlot
  availableVehicles: Vehicle[]
}

type BookingForm = {
  contactName: string
  patientName: string
  patientAddress: string
  destination: string
  equipment: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental: boolean
  notes: string
  ward: string
  roomNumber: string
  companionCount: 0 | 1 | 2 | 3 | 4
}

type PrefillState = {
  patientName?: string
  patientAddress?: string
  destination?: string
  equipment?: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental?: boolean
  notes?: string
  contactName?: string
}

type SearchPrefillState = {
  date?: string
  startTime?: string
  endTime?: string
  area?: string
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

export default function MswSearch() {
  const { hospitalId } = useAuth()
  const { showToast } = useToast()
  const location = useLocation()
  const navigate = useNavigate()
  const state = location.state as { prefill?: PrefillState; searchPrefill?: SearchPrefillState } | null
  const prefill = state?.prefill
  const searchPrefill = state?.searchPrefill

  const [step, setStep] = useState<1 | 2 | 3>(1)

  const lsKey = (name: string) => `msw_${hospitalId ?? 'anon'}_last_${name}`
  const today = jstTodayStr()

  const [date, setDate] = useState(searchPrefill?.date ?? today)
  const [startTime, setStartTime] = useState(
    searchPrefill?.startTime ?? sessionStorage.getItem(lsKey('start_time')) ?? defaultStartTime(),
  )
  const [endTime, setEndTime] = useState(
    searchPrefill?.endTime ?? sessionStorage.getItem(lsKey('end_time')) ?? addHour(defaultStartTime()),
  )
  const [area, setArea] = useState(searchPrefill?.area ?? sessionStorage.getItem(lsKey('area')) ?? '')
  const [needWheelchair, setNeedWheelchair] = useState(false)
  const [needReclining, setNeedReclining] = useState(false)
  const [needStretcher, setNeedStretcher] = useState(false)
  const [needFemale, setNeedFemale] = useState(false)
  const [needLongDistance, setNeedLongDistance] = useState(false)
  const [needSameDay, setNeedSameDay] = useState(false)

  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedBusiness, setSelectedBusiness] = useState<SearchResult | null>(null)
  const [previewBusiness, setPreviewBusiness] = useState<SearchResult | null>(null)
  const [favOnlyResults, setFavOnlyResults] = useState(false)

  const [contacts, setContacts] = useState<MswContact[]>([])
  const [form, setForm] = useState<BookingForm>({
    contactName: prefill?.contactName ?? '',
    patientName: prefill?.patientName ?? '',
    patientAddress: prefill?.patientAddress ?? '',
    destination: prefill?.destination ?? '',
    equipment:
      prefill?.equipment ??
      (sessionStorage.getItem(lsKey('equipment')) as BookingForm['equipment'] | null) ??
      'wheelchair',
    equipmentRental: prefill?.equipmentRental ?? false,
    notes: prefill?.notes ?? '',
    ward: '',
    roomNumber: '',
    companionCount: 0,
  })
  const [isNewContact, setIsNewContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
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
    contactName: string
  } | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewBusiness(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (!hospitalId) return

    supabase
      .from('msw_contacts')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('created_at')
      .then(({ data }) => {
        setContacts(data ?? [])
        if (data?.length && !prefill?.contactName) {
          setForm((current) => (current.contactName ? current : { ...current, contactName: data[0].name }))
        }
      })

    supabase
      .from('favorites')
      .select('business_id')
      .eq('hospital_id', hospitalId)
      .then(({ data }) => {
        setFavorites(new Set(((data as FavoriteEntry[] | null) ?? []).map((entry) => entry.business_id)))
      })
  }, [hospitalId, prefill?.contactName])

  const toggleFavorite = async (businessId: string) => {
    if (!hospitalId) return

    if (favorites.has(businessId)) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('hospital_id', hospitalId)
        .eq('business_id', businessId)
      if (error) {
        showToast('お気に入り解除に失敗しました', 'error')
        return
      }
      setFavorites((prev) => {
        const next = new Set(prev)
        next.delete(businessId)
        return next
      })
      return
    }

    const { error } = await supabase.from('favorites').insert({ hospital_id: hospitalId, business_id: businessId })
    if (error) {
      showToast('お気に入り登録に失敗しました', 'error')
      return
    }
    setFavorites((prev) => new Set([...prev, businessId]))
  }

  const handleSearch = async () => {
    if (!area) {
      setSearchError('対応エリアを選択してください')
      return
    }
    if (startTime >= endTime) {
      setSearchError('終了時刻は開始時刻より後にしてください')
      return
    }

    setSearchError('')
    setSearching(true)
    sessionStorage.setItem(lsKey('area'), area)
    sessionStorage.setItem(lsKey('start_time'), startTime)
    sessionStorage.setItem(lsKey('end_time'), endTime)

    const { data: busySlots, error: busyError } = await supabase
      .from('occupied_slots')
      .select('vehicle_id')
      .eq('date', date)
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (busyError) {
      setSearchError('検索に失敗しました。しばらくしてから再度お試しください。')
      setSearching(false)
      return
    }

    const busyVehicleIds = Array.from(
      new Set(((busySlots ?? []) as Array<{ vehicle_id: string | null }>).map((slot) => slot.vehicle_id).filter(Boolean)),
    ) as string[]

    let vehicleQuery = supabase.from('vehicles').select('*, businesses(*)').eq('active', true)
    if (busyVehicleIds.length > 0) {
      vehicleQuery = vehicleQuery.not('id', 'in', `(${busyVehicleIds.join(',')})`)
    }

    const { data: rawVehicles, error: vehicleError } = await vehicleQuery.order('sort_order', { ascending: true })

    if (vehicleError) {
      setSearchError('検索に失敗しました。しばらくしてから再度お試しください。')
      setSearching(false)
      return
    }

    const grouped = new Map<string, { business: Business; availableVehicles: Vehicle[] }>()
    for (const vehicle of ((rawVehicles as unknown as VehicleWithBusiness[] | null) ?? [])) {
      const business = vehicle.businesses
      if (!business || !business.approved) continue
      if (!business.service_areas?.includes(area)) continue
      if (needWheelchair && !vehicle.has_wheelchair) continue
      if (needReclining && !vehicle.has_reclining_wheelchair) continue
      if (needStretcher && !vehicle.has_stretcher) continue
      if (needFemale && !business.has_female_caregiver) continue
      if (needLongDistance && !business.long_distance) continue
      if (needSameDay && !business.same_day) continue

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

    matched.sort((a, b) => {
      const aFav = favorites.has(a.id) ? 0 : 1
      const bFav = favorites.has(b.id) ? 0 : 1
      if (aFav !== bFav) return aFav - bFav
      return a.name.localeCompare(b.name, 'ja')
    })

    setResults(matched)
    setFavOnlyResults(false)
    setSearching(false)
    setStep(2)
  }

  const handleSelectBusiness = (business: SearchResult) => {
    setSelectedBusiness(business)
    setStep(3)
  }

  const handleSubmitRequest = async () => {
    if (!hospitalId || !selectedBusiness) return

    const contactName = isNewContact ? newContactName.trim() : form.contactName.trim()
    if (!contactName) {
      setSubmitError('連絡担当者を入力してください')
      return
    }
    if (!form.patientName.trim()) {
      setSubmitError('患者名を入力してください')
      return
    }
    if (!form.patientAddress.trim()) {
      setSubmitError('患者住所を入力してください')
      return
    }
    if (!form.destination.trim()) {
      setSubmitError('行き先を入力してください')
      return
    }

    setSubmitting(true)
    setSubmitError('')
    sessionStorage.setItem(lsKey('equipment'), form.equipment)

    const vehicleId = selectedBusiness.availableVehicles.find((vehicle) => vehicle.business_id === selectedBusiness.id)?.id ?? null

    const { data: newReservation, error: reservationError } = await supabase
      .from('reservations')
      .insert({
        business_id: selectedBusiness.id,
        hospital_id: hospitalId,
        slot_id: null,
        vehicle_id: vehicleId,
        contact_name: contactName,
        patient_name: form.patientName.trim(),
        patient_address: form.patientAddress.trim(),
        destination: form.destination.trim(),
        equipment: form.equipment,
        equipment_rental: form.equipmentRental,
        notes: form.notes.trim() || null,
        ward: form.ward.trim() || null,
        room_number: form.roomNumber.trim() || null,
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

    if (isNewContact && newContactName.trim()) {
      const { data: newContact } = await supabase
        .from('msw_contacts')
        .insert({ hospital_id: hospitalId, name: newContactName.trim() })
        .select()
        .single()
      if (newContact) setContacts((prev) => [...prev, newContact])
    }

    if (newReservation?.id) {
      supabase.functions.invoke('send-request-received', {
        body: { reservation_id: newReservation.id },
      }).catch(() => {})
    }

    setConfirmed({
      cancelPhone: selectedBusiness.cancel_phone,
      businessName: selectedBusiness.name,
      date,
      startTime,
      endTime,
      patientName: form.patientName.trim(),
      equipment: form.equipment,
      contactName,
    })
    setSubmitting(false)
  }

  const filteredResults = useMemo(
    () => (favOnlyResults ? results.filter((result) => favorites.has(result.id)) : results),
    [favOnlyResults, favorites, results],
  )

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card py-8">
          <div className="text-5xl mb-4 text-center">✓</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2 text-center">予約申請を送信しました</h2>
          <p className="text-sm text-slate-500 mb-4 text-center">事業所からの確認連絡をお待ちください</p>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 space-y-1.5 text-sm">
            <div className="flex gap-3">
              <span className="text-slate-500 w-16 flex-shrink-0">事業所</span>
              <span className="font-semibold text-slate-800">{confirmed.businessName}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-16 flex-shrink-0">日時</span>
              <span className="font-semibold text-slate-800">
                {fmtDate(confirmed.date)} {confirmed.startTime.slice(0, 5)}〜{confirmed.endTime.slice(0, 5)}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-16 flex-shrink-0">患者名</span>
              <span className="font-semibold text-slate-800">{confirmed.patientName}</span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-16 flex-shrink-0">機材</span>
              <span className="font-semibold text-slate-800">
                {EQUIPMENT_OPTIONS.find((option) => option.value === confirmed.equipment)?.label ?? confirmed.equipment}
              </span>
            </div>
            <div className="flex gap-3">
              <span className="text-slate-500 w-16 flex-shrink-0">担当者</span>
              <span className="font-semibold text-slate-800">{confirmed.contactName}</span>
            </div>
          </div>

          {selectedBusiness && hospitalId && (
            <button
              onClick={() => toggleFavorite(selectedBusiness.id)}
              className={`w-full mb-4 flex items-center justify-center gap-2 py-2 px-4 rounded-xl border text-sm font-medium transition-colors ${
                favorites.has(selectedBusiness.id)
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700'
              }`}
            >
              <span>{favorites.has(selectedBusiness.id) ? '★' : '☆'}</span>
              {favorites.has(selectedBusiness.id) ? 'お気に入り登録済み' : 'お気に入りに追加する'}
            </button>
          )}

          {confirmed.cancelPhone && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-left text-sm mb-5">
              <p className="font-medium text-teal-800 mb-1">急ぎの変更は事業所へご連絡ください</p>
              <a href={`tel:${confirmed.cancelPhone}`} className="text-lg font-bold text-teal-900 block mt-1">
                TEL {confirmed.cancelPhone}
              </a>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => navigate('/msw/reservations')} className="btn-secondary flex-1">
              申請一覧を見る
            </button>
            <button
              onClick={() => {
                setStep(1)
                setConfirmed(null)
                setSelectedBusiness(null)
                const lastEquipment =
                  (sessionStorage.getItem(lsKey('equipment')) as BookingForm['equipment'] | null) ?? 'wheelchair'
                setForm({
                  contactName: form.contactName,
                  patientName: '',
                  patientAddress: '',
                  destination: '',
                  equipment: lastEquipment,
                  equipmentRental: false,
                  notes: '',
                  ward: '',
                  roomNumber: '',
                  companionCount: 0,
                })
                setNewContactName('')
                setIsNewContact(false)
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
            <h1 className="text-xl font-bold text-slate-800">空き事業所検索</h1>
            <p className="text-sm text-slate-500 mt-1">日時と条件に合う介護タクシー事業所を探します</p>
          </div>

          <div className="card space-y-4">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" className="btn-secondary text-sm" onClick={() => setDate(today)}>
                今日
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setDate(jstDateOffsetStr(1))}>
                明日
              </button>
              <button type="button" className="btn-secondary text-sm" onClick={() => setDate(jstDateOffsetStr(2))}>
                明後日
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="label">日付</label>
                <input type="date" className="input-base" value={date} min={today} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label className="label">開始時刻</label>
                <input type="time" className="input-base" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="label">終了時刻</label>
                <input type="time" className="input-base" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="label">対応エリア</label>
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {SERVICE_AREAS.map((serviceArea) => (
                  <button
                    key={serviceArea}
                    type="button"
                    onClick={() => setArea(a => a === serviceArea ? '' : serviceArea)}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      area === serviceArea
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                    }`}
                  >
                    {serviceArea}
                  </button>
                ))}
              </div>
              {!area && (
                <p className="text-xs text-slate-400 mt-1">エリアをタップして選択（もう一度タップで解除）</p>
              )}
            </div>

            <div>
              <label className="label">条件</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm text-slate-700">
                {[
                  { label: '車椅子', checked: needWheelchair, onChange: setNeedWheelchair },
                  { label: 'リクライニング', checked: needReclining, onChange: setNeedReclining },
                  { label: 'ストレッチャー', checked: needStretcher, onChange: setNeedStretcher },
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <button type="button" onClick={() => setStep(1)} className="text-teal-600 text-sm hover:underline">
                ← 条件入力に戻る
              </button>
              <h2 className="text-lg font-semibold text-slate-800 mt-1">検索結果</h2>
              <p className="text-sm text-slate-500">
                {fmtDate(date)} {startTime.slice(0, 5)}〜{endTime.slice(0, 5)} / {area}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFavOnlyResults((prev) => !prev)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                favOnlyResults
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {favOnlyResults ? 'お気に入りのみ表示中' : 'お気に入りのみ'}
            </button>
          </div>

          {filteredResults.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-3">🔍</div>
              <p className="text-slate-700 font-medium">条件に合う事業所は見つかりませんでした</p>
              <p className="text-sm text-slate-500 mt-1">時間帯や条件を変更して再検索してください</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredResults.map((business) => (
                <div key={business.id} className="card space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleFavorite(business.id)}
                          className="text-lg leading-none"
                          title={favorites.has(business.id) ? 'お気に入り解除' : 'お気に入り登録'}
                        >
                          {favorites.has(business.id) ? '★' : '☆'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPreviewBusiness(business)}
                          className="font-bold text-teal-700 hover:underline transition-colors"
                          title="詳細を見る"
                        >
                          {business.name} ›
                        </button>
                      </div>
                      {business.address && (
                        <a
                          href={mapsUrl(business.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-700 hover:underline mt-0.5 inline-block"
                        >
                          地図 {business.address}
                        </a>
                      )}
                      {formatHours(business.business_hours_start, business.business_hours_end) && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          営業 {formatHours(business.business_hours_start, business.business_hours_end)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                        空き車両 {business.availableVehicles.length} 台
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
                <p className="text-xs text-slate-500 mt-1">空き車両 {selectedBusiness.availableVehicles.length} 台</p>
              </div>
              <button type="button" onClick={() => setPreviewBusiness(selectedBusiness)} className="btn-secondary text-sm">
                事業所詳細
              </button>
            </div>

            {prefill && (
              <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-xs text-blue-700 font-medium">
                依頼内容を引き継いでいます。必要に応じて修正して送信してください。
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="label">連絡担当者 <span className="text-red-500">*</span></label>
                {contacts.length > 0 && !isNewContact ? (
                  <div className="flex gap-2">
                    <select
                      className="input-base flex-1"
                      value={form.contactName}
                      onChange={(e) => setForm((current) => ({ ...current, contactName: e.target.value }))}
                    >
                      {form.contactName === '' && <option value="">選択してください</option>}
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.name}>
                          {contact.name}
                        </option>
                      ))}
                    </select>
                    <button type="button" onClick={() => setIsNewContact(true)} className="btn-secondary text-sm px-3 whitespace-nowrap">
                      新規入力
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      className="input-base flex-1"
                      value={newContactName}
                      onChange={(e) => setNewContactName(e.target.value)}
                      maxLength={50}
                      placeholder="連絡担当者名を入力"
                    />
                    {contacts.length > 0 && (
                      <button type="button" onClick={() => setIsNewContact(false)} className="btn-secondary text-sm px-3 whitespace-nowrap">
                        一覧から選ぶ
                      </button>
                    )}
                  </div>
                )}
                {contacts.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">
                    <Link to="/msw/contacts" className="text-teal-600 hover:underline">
                      連絡先管理
                    </Link>
                    でよく使う担当者を登録できます
                  </p>
                )}
              </div>

              <div>
                <label className="label">患者名 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="input-base"
                  value={form.patientName}
                  onChange={(e) => setForm((current) => ({ ...current, patientName: e.target.value }))}
                  maxLength={50}
                />
              </div>

              <div>
                <label className="label">患者住所 <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  className="input-base"
                  value={form.patientAddress}
                  onChange={(e) => setForm((current) => ({ ...current, patientAddress: e.target.value }))}
                  maxLength={300}
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
                <label className="label">使用機材 <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {EQUIPMENT_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, equipment: option.value }))}
                      className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                        form.equipment === option.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">病棟</label>
                  <input
                    type="text"
                    className="input-base"
                    value={form.ward}
                    onChange={(e) => setForm((current) => ({ ...current, ward: e.target.value }))}
                    maxLength={50}
                    placeholder="例：3病棟"
                  />
                </div>
                <div>
                  <label className="label">病室</label>
                  <input
                    type="text"
                    className="input-base"
                    value={form.roomNumber}
                    onChange={(e) => setForm((current) => ({ ...current, roomNumber: e.target.value }))}
                    maxLength={20}
                    placeholder="例：305号室"
                  />
                </div>
              </div>

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
                />
              </div>

              {submitError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>}

              <button type="button" onClick={handleSubmitRequest} className="btn-primary w-full text-base py-3" disabled={submitting}>
                {submitting ? '申請中...' : '予約申請を送信する'}
              </button>
              <p className="text-xs text-slate-500 text-center">事業所が内容を確認後、対応可否を連絡します</p>
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
                <p className="font-bold text-slate-800">{previewBusiness.name}</p>
                {previewBusiness.address && (
                  <a href={mapsUrl(previewBusiness.address)} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 hover:underline block mt-1">
                    地図 {previewBusiness.address}
                  </a>
                )}
                {previewBusiness.cancel_phone && (
                  <a href={`tel:${previewBusiness.cancel_phone}`} className="text-xs text-teal-700 block mt-1">
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
    </div>
  )
}

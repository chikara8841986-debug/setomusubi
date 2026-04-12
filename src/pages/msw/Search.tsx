import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Business, AvailabilitySlot, MswContact } from '../../types/database'

type FavoriteEntry = { business_id: string }

type SearchResult = Business & {
  matchedSlot: AvailabilitySlot
}

type BookingForm = {
  contactName: string
  patientName: string
  patientAddress: string
  destination: string
  equipment: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental: boolean
  notes: string
}

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

function formatHours(start: string | null, end: string | null) {
  if (!start || !end) return null
  return `${start.slice(0, 5)}〜${end.slice(0, 5)}`
}

const SERVICE_AREAS = [
  '善通寺市', '丸亀市', '坂出市', '宇多津町',
  '多度津町', '琴平町', 'まんのう町', '綾川町'
]

const EQUIPMENT_OPTIONS = [
  { value: 'wheelchair', label: '車椅子' },
  { value: 'reclining_wheelchair', label: 'リクライニング車椅子' },
  { value: 'stretcher', label: 'ストレッチャー' },
] as const

type PrefillState = {
  patientName?: string
  patientAddress?: string
  destination?: string
  equipment?: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipmentRental?: boolean
  notes?: string
  contactName?: string
}

export default function MswSearch() {
  const { hospitalId } = useAuth()
  const location = useLocation()
  const prefill = (location.state as { prefill?: PrefillState } | null)?.prefill
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const today = format(new Date(), 'yyyy-MM-dd')

  function defaultStartTime() {
    const now = new Date()
    const h = now.getHours()
    const next = h < 9 ? 9 : h >= 17 ? 10 : h + 1
    return `${String(next).padStart(2, '0')}:00`
  }
  function addHour(time: string, hours = 1): string {
    const [h, m] = time.split(':').map(Number)
    const total = h + hours
    return `${String(Math.min(total, 23)).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  // Step 1
  const [date, setDate] = useState(today)
  const [startTime, setStartTime] = useState(() => defaultStartTime())
  const [endTime, setEndTime] = useState(() => addHour(defaultStartTime()))
  const [area, setArea] = useState(() => localStorage.getItem('msw_last_area') ?? '')
  const [needWheelchair, setNeedWheelchair] = useState(false)
  const [needReclining, setNeedReclining] = useState(false)
  const [needStretcher, setNeedStretcher] = useState(false)
  const [needFemale, setNeedFemale] = useState(false)
  const [needLongDistance, setNeedLongDistance] = useState(false)
  const [needSameDay, setNeedSameDay] = useState(false)

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(new Set())

  // Step 2
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [selectedBusiness, setSelectedBusiness] = useState<SearchResult | null>(null)
  const [previewBusiness, setPreviewBusiness] = useState<SearchResult | null>(null)

  // Step 3
  const [contacts, setContacts] = useState<MswContact[]>([])
  const [form, setForm] = useState<BookingForm>({
    contactName: prefill?.contactName ?? '',
    patientName: prefill?.patientName ?? '',
    patientAddress: prefill?.patientAddress ?? '',
    destination: prefill?.destination ?? '',
    equipment: prefill?.equipment ?? 'wheelchair',
    equipmentRental: prefill?.equipmentRental ?? false,
    notes: prefill?.notes ?? '',
  })
  const [isNewContact, setIsNewContact] = useState(false)
  const [newContactName, setNewContactName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  // Confirmed state
  const [confirmed, setConfirmed] = useState<{ cancelPhone: string | null } | null>(null)

  // ESCキーでプレビューモーダルを閉じる
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
        if (data?.length === 1 && !prefill?.contactName) {
          setForm(f => ({ ...f, contactName: data[0].name }))
        }
      })
    supabase
      .from('favorites')
      .select('business_id')
      .eq('hospital_id', hospitalId)
      .then(({ data }) => {
        setFavorites(new Set((data as FavoriteEntry[] ?? []).map(f => f.business_id)))
      })
  }, [hospitalId])

  const toggleFavorite = async (businessId: string) => {
    if (!hospitalId) return
    if (favorites.has(businessId)) {
      await supabase.from('favorites').delete()
        .eq('hospital_id', hospitalId).eq('business_id', businessId)
      setFavorites(prev => { const s = new Set(prev); s.delete(businessId); return s })
    } else {
      await supabase.from('favorites').insert({ hospital_id: hospitalId, business_id: businessId })
      setFavorites(prev => new Set([...prev, businessId]))
    }
  }

  const handleSearch = async () => {
    if (!area) { setSearchError('対応エリアを選択してください'); return }
    if (startTime >= endTime) { setSearchError('終了時間は開始時間より後にしてください'); return }
    setSearchError('')
    setSearching(true)
    localStorage.setItem('msw_last_area', area)

    type SlotWithBusiness = AvailabilitySlot & { businesses: Business }
    const { data: rawSlots } = await supabase
      .from('availability_slots')
      .select('*, businesses(*)')
      .eq('date', date)
      .eq('is_available', true)
      .lte('start_time', startTime)
      .gte('end_time', endTime)

    const slots = rawSlots as unknown as SlotWithBusiness[] | null

    if (!slots || slots.length === 0) {
      setResults([])
      setSearching(false)
      setStep(2)
      return
    }

    const matched: SearchResult[] = []
    for (const slot of slots) {
      const biz = slot.businesses as Business
      if (!biz || !biz.approved) continue
      if (!biz.service_areas?.includes(area)) continue
      if (needWheelchair && !biz.has_wheelchair) continue
      if (needReclining && !biz.has_reclining_wheelchair) continue
      if (needStretcher && !biz.has_stretcher) continue
      if (needFemale && !biz.has_female_caregiver) continue
      if (needLongDistance && !biz.long_distance) continue
      if (needSameDay && !biz.same_day) continue
      matched.push({ ...biz, matchedSlot: slot as AvailabilitySlot })
    }

    // お気に入りを上位表示
    matched.sort((a, b) => {
      const aFav = favorites.has(a.id) ? 0 : 1
      const bFav = favorites.has(b.id) ? 0 : 1
      return aFav - bFav
    })

    setResults(matched)
    setSearching(false)
    setStep(2)
  }

  const handleSelectBusiness = (biz: SearchResult) => {
    setSelectedBusiness(biz)
    setStep(3)
  }

  const handleSubmitRequest = async () => {
    if (!hospitalId || !selectedBusiness) return
    const contactName = isNewContact ? newContactName.trim() : form.contactName
    if (!contactName) { setSubmitError('担当者名を入力してください'); return }
    if (!form.patientName.trim()) { setSubmitError('患者氏名を入力してください'); return }
    if (!form.patientAddress.trim()) { setSubmitError('乗車地を入力してください'); return }
    if (!form.destination.trim()) { setSubmitError('目的地を入力してください'); return }

    setSubmitting(true)
    setSubmitError('')

    const slot = selectedBusiness.matchedSlot

    // Insert reservation as 'pending' — no slot locking yet (business decides)
    const { data: newReservation, error: resError } = await supabase
      .from('reservations')
      .insert({
        business_id: selectedBusiness.id,
        hospital_id: hospitalId,
        slot_id: slot.id,
        contact_name: contactName,
        patient_name: form.patientName.trim(),
        patient_address: form.patientAddress.trim(),
        destination: form.destination.trim(),
        equipment: form.equipment,
        equipment_rental: form.equipmentRental,
        notes: form.notes.trim() || null,
        reservation_date: date,
        start_time: startTime,
        end_time: endTime,
        status: 'pending' as const,
      })
      .select('id')
      .single()

    if (resError) {
      setSubmitError('申請に失敗しました: ' + resError.message)
      setSubmitting(false)
      return
    }

    // Save new contact if entered
    if (isNewContact && newContactName.trim()) {
      const { data: newContact } = await supabase
        .from('msw_contacts')
        .insert({ hospital_id: hospitalId, name: newContactName.trim() })
        .select()
        .single()
      if (newContact) setContacts(prev => [...prev, newContact])
    }

    // Notify business of new request (non-blocking)
    if (newReservation?.id) {
      supabase.functions.invoke('send-request-received', {
        body: { reservation_id: newReservation.id },
      }).catch(() => {})
    }

    setConfirmed({ cancelPhone: selectedBusiness.cancel_phone })
    setSubmitting(false)
  }

  if (confirmed) {
    return (
      <div className="max-w-md mx-auto">
        <div className="card text-center py-8">
          <div className="text-5xl mb-4">📋</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">仮予約の申請が完了しました</h2>
          <p className="text-sm text-gray-500 mb-1">事業所からの確定連絡をお待ちください</p>
          <p className="text-xs text-gray-400 mb-5">予約の確定・却下は「予約履歴」で確認できます</p>

          {confirmed.cancelPhone && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-left text-sm mb-5">
              <p className="font-medium text-teal-800 mb-1">急ぎの場合は直接お電話ください</p>
              <a href={`tel:${confirmed.cancelPhone}`} className="text-lg font-bold text-teal-900 block mt-1">
                📞 {confirmed.cancelPhone}
              </a>
            </div>
          )}

          <button
            onClick={() => {
              setStep(1)
              setConfirmed(null)
              setSelectedBusiness(null)
              setForm({ contactName: '', patientName: '', patientAddress: '', destination: '', equipment: 'wheelchair', equipmentRental: false, notes: '' })
              setNewContactName('')
              setIsNewContact(false)
            }}
            className="btn-primary"
          >
            続けて申請する
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[
          { n: 1, label: '検索' },
          { n: 2, label: '事業所選択' },
          { n: 3, label: '申請内容' },
        ].map(({ n, label }, i) => (
          <div key={n} className="flex items-center gap-2 flex-1">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              step >= n ? 'bg-teal-600 text-white' : 'bg-gray-200 text-gray-500'
            }`}>{n}</div>
            <span className={`text-xs hidden sm:block ${step === n ? 'text-teal-600 font-medium' : 'text-gray-400'}`}>{label}</span>
            {i < 2 && <div className={`flex-1 h-0.5 ${step > n ? 'bg-teal-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Search */}
      {step === 1 && (
        <div className="card">
          <h2 className="text-base font-semibold text-gray-800 mb-4">空き事業所を検索</h2>
          <div className="space-y-4">
            <div>
              <label className="label">希望日 <span className="text-red-500">*</span></label>
              <div className="flex gap-2">
                <input type="date" className="input-base flex-1" value={date} onChange={e => setDate(e.target.value)} min={today} />
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors flex-shrink-0 ${
                    date === today ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300'
                  }`}
                >今日</button>
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date()
                    tomorrow.setDate(tomorrow.getDate() + 1)
                    setDate(format(tomorrow, 'yyyy-MM-dd'))
                  }}
                  className="px-3 py-2 rounded-xl text-xs font-medium border border-gray-300 bg-white text-gray-600 hover:border-teal-300 transition-colors flex-shrink-0"
                >明日</button>
              </div>
            </div>
            <div>
              <label className="label">希望時間帯</label>
              <div className="flex gap-2 mb-2 flex-wrap">
                {[
                  { label: '午前中', start: '09:00', end: '12:00' },
                  { label: '午後', start: '13:00', end: '17:00' },
                  { label: '終日', start: '09:00', end: '18:00' },
                ].map(({ label, start, end }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => { setStartTime(start); setEndTime(end) }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      startTime === start && endTime === end
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">開始時間</label>
                  <input type="time" className="input-base" value={startTime} onChange={e => {
                    const t = e.target.value
                    setStartTime(t)
                    if (t >= endTime) setEndTime(addHour(t))
                  }} />
                </div>
                <div>
                  <label className="label">終了時間</label>
                  <input type="time" className="input-base" value={endTime} onChange={e => setEndTime(e.target.value)} min={addHour(startTime, 0)} />
                </div>
              </div>
            </div>
            <div>
              <label className="label">対応エリア <span className="text-red-500">*</span></label>
              <select className="input-base" value={area} onChange={e => setArea(e.target.value)}>
                <option value="">選択してください</option>
                {SERVICE_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="label">必要条件（任意）</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: '車椅子対応', state: needWheelchair, set: setNeedWheelchair },
                  { label: 'リクライニング対応', state: needReclining, set: setNeedReclining },
                  { label: 'ストレッチャー対応', state: needStretcher, set: setNeedStretcher },
                  { label: '女性介護者在籍', state: needFemale, set: setNeedFemale },
                  { label: '長距離対応', state: needLongDistance, set: setNeedLongDistance },
                  { label: '当日対応', state: needSameDay, set: setNeedSameDay },
                ].map(({ label, state, set }) => (
                  <label key={label} className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={state} onChange={e => set(e.target.checked)} className="w-4 h-4 rounded" />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            {searchError && <p className="text-sm text-red-600">{searchError}</p>}
            <button onClick={handleSearch} className="btn-primary w-full" disabled={searching}>
              {searching ? '検索中...' : '空きを検索する'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Results */}
      {step === 2 && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep(1)} className="text-teal-600 text-sm hover:underline">← 検索に戻る</button>
            <span className="text-sm text-gray-500">
              {date} {startTime}〜{endTime} / {area}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="card text-center py-8">
              <p className="text-gray-500 text-sm">条件に合う空き事業所が見つかりませんでした</p>
              <p className="text-gray-400 text-xs mt-1">条件を変更して再度検索してください</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <p className="text-sm text-gray-600">{results.length}件の事業所が見つかりました</p>
                {results.filter(r => favorites.has(r.id)).length > 0 && (
                  <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    ⭐ {results.filter(r => favorites.has(r.id)).length}件はお気に入り
                  </span>
                )}
              </div>
              {results.map(biz => (
                <div key={biz.id} className="card hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-3 mb-2">
                    {biz.profile_image_url ? (
                      <img src={biz.profile_image_url} alt={biz.name}
                        className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100 mt-0.5" />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-lg mt-0.5">
                        🚐
                      </div>
                    )}
                  <div className="flex-1 min-w-0 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{biz.name}</h3>
                        <button
                          onClick={() => toggleFavorite(biz.id)}
                          className="text-lg flex-shrink-0 leading-none"
                          title={favorites.has(biz.id) ? 'お気に入り解除' : 'お気に入り登録'}
                        >
                          {favorites.has(biz.id) ? '⭐' : '☆'}
                        </button>
                      </div>
                      {biz.address ? (
                        <a
                          href={mapsUrl(biz.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-700 hover:underline mt-0.5 inline-block"
                          onClick={e => e.stopPropagation()}
                        >
                          📍 {biz.address}
                        </a>
                      ) : null}
                      {formatHours(biz.business_hours_start, biz.business_hours_end) && (
                        <p className="text-xs text-gray-400 mt-0.5">
                          🕐 {formatHours(biz.business_hours_start, biz.business_hours_end)}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleSelectBusiness(biz)}
                      className="btn-primary text-sm px-4 py-1.5 flex-shrink-0"
                    >
                      申請する
                    </button>
                  </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                    {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                    {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                    {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                    {biz.long_distance && <span className="badge-gray">長距離対応</span>}
                    {biz.same_day && <span className="badge-gray">当日対応</span>}
                  </div>
                  {biz.pricing && (
                    <p className="text-xs text-gray-600 border-t pt-2 mt-2">
                      <span className="font-medium">料金: </span>{biz.pricing}
                    </p>
                  )}
                  {biz.qualifications && (
                    <p className="text-xs text-gray-600 mt-1">
                      <span className="font-medium">特徴: </span>{biz.qualifications}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setPreviewBusiness(biz)}
                        className="text-xs text-teal-700 hover:underline"
                      >
                        詳細を見る →
                      </button>
                      {(biz.matchedSlot.capacity ?? 1) > 1 && (
                        <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                          空き{(biz.matchedSlot.capacity ?? 1) - (biz.matchedSlot.confirmed_count ?? 0)}台
                        </span>
                      )}
                    </div>
                    {biz.cancel_phone && (
                      <a href={`tel:${biz.cancel_phone}`} className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
                        📞 電話する
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Request form */}
      {step === 3 && selectedBusiness && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setStep(2)} className="text-teal-600 text-sm hover:underline">← 事業所選択に戻る</button>
          </div>

          {/* Summary + phone option */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4">
            <p className="font-semibold text-teal-800 text-sm">{selectedBusiness.name}</p>
            <p className="text-teal-600 text-xs">{date} {startTime}〜{endTime}</p>
            {selectedBusiness.cancel_phone && (
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-teal-200">
                <p className="text-xs text-teal-700">急ぎの場合は直接電話でご確認ください</p>
                <a href={`tel:${selectedBusiness.cancel_phone}`} className="text-xs font-bold text-teal-800 bg-white border border-teal-300 px-3 py-1 rounded-lg flex-shrink-0">
                  📞 電話する
                </a>
              </div>
            )}
          </div>

          <div className="card space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-800">仮予約の申請内容</h2>
              <p className="text-xs text-gray-500 mt-1">事業所が確認後、承認・却下の通知が来ます</p>
            </div>

            {/* Contact name */}
            <div>
              <label className="label">担当者名 <span className="text-red-500">*</span></label>
              {contacts.length > 0 && !isNewContact ? (
                <div className="flex gap-2">
                  <select className="input-base flex-1" value={form.contactName}
                    onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))}>
                    <option value="">選択してください</option>
                    {contacts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <button type="button" onClick={() => setIsNewContact(true)}
                    className="btn-secondary text-sm px-3 whitespace-nowrap">新規入力</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input type="text" className="input-base flex-1" value={newContactName}
                    onChange={e => setNewContactName(e.target.value)} placeholder="担当者名を入力" />
                  {contacts.length > 0 && (
                    <button type="button" onClick={() => setIsNewContact(false)}
                      className="btn-secondary text-sm px-3 whitespace-nowrap">一覧から選択</button>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="label">患者氏名 <span className="text-red-500">*</span></label>
              <input type="text" className="input-base" value={form.patientName}
                onChange={e => setForm(f => ({ ...f, patientName: e.target.value }))} placeholder="山田 太郎" />
            </div>
            <div>
              <label className="label">乗車地（患者住所） <span className="text-red-500">*</span></label>
              <input type="text" className="input-base" value={form.patientAddress}
                onChange={e => setForm(f => ({ ...f, patientAddress: e.target.value }))}
                placeholder="香川県丸亀市〇〇町1-2-3" />
            </div>
            <div>
              <label className="label">目的地 <span className="text-red-500">*</span></label>
              <input type="text" className="input-base" value={form.destination}
                onChange={e => setForm(f => ({ ...f, destination: e.target.value }))}
                placeholder="〇〇病院・〇〇クリニック など" />
            </div>
            <div>
              <label className="label">使用機材 <span className="text-red-500">*</span></label>
              <div className="grid grid-cols-3 gap-2">
                {EQUIPMENT_OPTIONS.map(opt => (
                  <button key={opt.value} type="button"
                    onClick={() => setForm(f => ({ ...f, equipment: opt.value }))}
                    className={`py-2 px-2 rounded-lg border text-sm font-medium transition-colors ${
                      form.equipment === opt.value
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300'
                    }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.equipmentRental}
                onChange={e => setForm(f => ({ ...f, equipmentRental: e.target.checked }))}
                className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">機材の貸出が必要</span>
            </label>
            <div>
              <label className="label">備考（任意）</label>
              <textarea className="input-base resize-none" rows={3} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="酸素吸入が必要 / エレベーターなし など" />
              {form.notes.length > 0 && (
                <p className="text-xs text-gray-400 mt-1 text-right">{form.notes.length} 文字</p>
              )}
            </div>

            {submitError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>}

            <button onClick={handleSubmitRequest} className="btn-primary w-full text-base py-3" disabled={submitting}>
              {submitting ? '申請中...' : '仮予約を申請する'}
            </button>
            <p className="text-xs text-gray-500 text-center">事業所が承認すると予約が確定されます</p>
          </div>
        </div>
      )}

      {/* Business detail preview modal */}
      {previewBusiness && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">事業所詳細</h3>
              <button onClick={() => setPreviewBusiness(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex items-start gap-3 mb-3">
              {previewBusiness.profile_image_url ? (
                <img src={previewBusiness.profile_image_url} alt="事業所" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-2xl">🚐</div>
              )}
              <div>
                <p className="font-bold text-gray-900">{previewBusiness.name}</p>
                {previewBusiness.address && (
                  <a
                    href={mapsUrl(previewBusiness.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-teal-700 hover:underline block mt-0.5"
                  >
                    📍 {previewBusiness.address}
                  </a>
                )}
                {previewBusiness.cancel_phone && (
                  <a href={`tel:${previewBusiness.cancel_phone}`} className="text-xs text-teal-700 block mt-0.5">
                    📞 {previewBusiness.cancel_phone}
                  </a>
                )}
                {previewBusiness.website_url && (
                  <a href={previewBusiness.website_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-teal-700 underline block mt-0.5">🔗 ホームページ</a>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-3">
              {previewBusiness.has_wheelchair && <span className="badge-blue">車椅子</span>}
              {previewBusiness.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
              {previewBusiness.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
              {previewBusiness.has_female_caregiver && <span className="badge-green">女性介護者</span>}
              {previewBusiness.long_distance && <span className="badge-gray">長距離対応</span>}
              {previewBusiness.same_day && <span className="badge-gray">当日対応</span>}
            </div>

            {previewBusiness.pr_text && (
              <p className="text-sm text-gray-700 whitespace-pre-line mb-3 border-t pt-3">{previewBusiness.pr_text}</p>
            )}

            {previewBusiness.vehicle_image_urls?.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3 border-t pt-3">
                {previewBusiness.vehicle_image_urls.map(url => (
                  <img key={url} src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-gray-100" />
                ))}
              </div>
            )}

            {previewBusiness.pricing && (
              <div className="border-t pt-3 text-sm">
                <span className="text-gray-500 text-xs">料金: </span>{previewBusiness.pricing}
              </div>
            )}
            {previewBusiness.qualifications && (
              <div className="border-t mt-2 pt-2 text-sm">
                <span className="text-gray-500 text-xs">資格・特徴: </span>{previewBusiness.qualifications}
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button onClick={() => setPreviewBusiness(null)} className="btn-secondary flex-1">閉じる</button>
              <button
                onClick={() => { handleSelectBusiness(previewBusiness); setPreviewBusiness(null) }}
                className="btn-primary flex-1"
              >
                この事業所に申請
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

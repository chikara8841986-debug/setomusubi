import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import {
  DEMO_BUSINESSES,
  DEMO_SLOTS,
  DEMO_CONTACTS,
  DEMO_HOSPITAL,
  EQUIPMENT_LABELS,
  type DemoReservation,
} from './demoData'

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

type SearchResult = {
  business: typeof DEMO_BUSINESSES[number]
  slots: typeof DEMO_SLOTS
}

type Stage = 'form' | 'results' | 'request' | 'done'

const EQUIPMENT_OPTIONS = [
  { value: 'wheelchair', label: '車椅子' },
  { value: 'reclining_wheelchair', label: 'リクライニング車椅子' },
  { value: 'stretcher', label: 'ストレッチャー' },
]

export default function DemoMswSearch() {
  const navigate = useNavigate()

  // Stage management
  const [stage, setStage] = useState<Stage>('form')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedBizId, setSelectedBizId] = useState<string | null>(null)

  // Search form
  const [searchDate, setSearchDate] = useState(addDays(1))
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [equipment, setEquipment] = useState('wheelchair')
  const [searching, setSearching] = useState(false)

  // Request form
  const [patientName, setPatientName] = useState('')
  const [patientAddress, setPatientAddress] = useState('')
  const [destination, setDestination] = useState('')
  const [contactName, setContactName] = useState(DEMO_CONTACTS[0].name)
  const [equipmentRental, setEquipmentRental] = useState(false)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const handleSearch = () => {
    if (!searchDate || !startTime || !endTime) return
    setSearching(true)
    // Simulate delay
    setTimeout(() => {
      // Find matching slots
      const matchingSlots = DEMO_SLOTS.filter(
        s => s.date === searchDate && s.start_time <= startTime && s.end_time >= endTime && s.is_available
      )
      const bizIds = new Set(matchingSlots.map(s => s.business_id))

      // Filter businesses by equipment
      const bizResults: SearchResult[] = DEMO_BUSINESSES.filter(b => {
        if (!bizIds.has(b.id)) return false
        if (equipment === 'wheelchair' && !b.has_wheelchair) return false
        if (equipment === 'reclining_wheelchair' && !b.has_reclining_wheelchair) return false
        if (equipment === 'stretcher' && !b.has_stretcher) return false
        return true
      }).map(b => ({
        business: b,
        slots: matchingSlots.filter(s => s.business_id === b.id),
      }))

      setResults(bizResults)
      setStage('results')
      setSearching(false)
    }, 800)
  }

  const handleSelectSlot = (bizId: string, _slotId: string) => {
    setSelectedBizId(bizId)
    setStage('request')
    setFormError('')
  }

  const handleSubmitRequest = () => {
    if (!patientName.trim()) { setFormError('患者氏名を入力してください'); return }
    if (!patientAddress.trim()) { setFormError('乗車地を入力してください'); return }
    if (!destination.trim()) { setFormError('目的地を入力してください'); return }
    setSubmitting(true)
    setTimeout(() => {
      // Simulate creating reservation
      const newRes: DemoReservation = {
        id: `demo-res-new-${Date.now()}`,
        status: 'pending',
        hospital_name: DEMO_HOSPITAL.name,
        contact_name: contactName,
        patient_name: patientName.trim(),
        patient_address: patientAddress.trim(),
        destination: destination.trim(),
        equipment: equipment as DemoReservation['equipment'],
        equipment_rental: equipmentRental,
        reservation_date: searchDate,
        start_time: startTime,
        end_time: endTime,
        notes: notes.trim(),
        created_at: new Date().toISOString(),
        business_id: selectedBizId!,
        business_name: DEMO_BUSINESSES.find(b => b.id === selectedBizId)?.name ?? '',
      }
      // Store in sessionStorage so Reservations page can show it
      try {
        const existing = JSON.parse(sessionStorage.getItem('demo_reservations') ?? '[]')
        sessionStorage.setItem('demo_reservations', JSON.stringify([newRes, ...existing]))
      } catch {}
      setSubmitting(false)
      setStage('done')
    }, 1000)
  }

  const selectedBiz = DEMO_BUSINESSES.find(b => b.id === selectedBizId)

  return (
    <DemoLayout role="msw">
      {stage === 'form' && (
        <div>
          <h1 className="text-xl font-bold text-slate-800 mb-1">空き枠を検索する</h1>
          <p className="text-xs text-slate-400 mb-4">希望日時・使用機材を選んで検索すると、空きのある事業所が表示されます。</p>

          <div className="card space-y-4">
            <div>
              <label className="label">希望日 <span className="text-red-500">*</span></label>
              <input
                type="date"
                className="input-base"
                value={searchDate}
                min={addDays(0)}
                onChange={e => setSearchDate(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">開始時間</label>
                <input type="time" className="input-base" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div>
                <label className="label">終了時間</label>
                <input type="time" className="input-base" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">使用機材</label>
              <select className="input-base" value={equipment} onChange={e => setEquipment(e.target.value)}>
                {EQUIPMENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <button
              onClick={handleSearch}
              disabled={searching}
              className="btn-primary w-full"
            >
              {searching ? '検索中...' : '🔍 空き枠を検索する'}
            </button>
          </div>

          <div className="mt-4 card bg-sky-50 border-sky-200 text-xs text-sky-800 space-y-1">
            <p className="font-semibold">💡 デモのヒント</p>
            <p>明日の日付・車椅子で検索するとサンプル事業所が表示されます。</p>
          </div>
        </div>
      )}

      {stage === 'results' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <button onClick={() => setStage('form')} className="text-xs text-slate-400 hover:text-slate-600">← 検索に戻る</button>
            <span className="text-slate-300">|</span>
            <p className="text-sm text-slate-600 font-medium">
              {searchDate} {startTime}〜{endTime}・{EQUIPMENT_LABELS[equipment]}
            </p>
          </div>

          {results.length === 0 ? (
            <div className="card text-center py-10">
              <div className="text-4xl mb-2">🚫</div>
              <p className="text-slate-500 text-sm">条件に合う空き枠が見つかりませんでした</p>
              <button onClick={() => setStage('form')} className="mt-3 text-xs text-teal-600 hover:underline">検索条件を変更する</button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">{results.length}件の事業所に空きがあります</p>
              {results.map(({ business: biz, slots }) => (
                <div key={biz.id} className="card">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center text-teal-400 text-xl flex-shrink-0">
                      🚐
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-800">{biz.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">📍 {biz.address}</p>
                      <p className="text-xs text-teal-700 mt-0.5">📞 {biz.cancel_phone}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                    {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                    {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                    {biz.rental_wheelchair && <span className="badge-green">車椅子貸出</span>}
                    {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                    {biz.long_distance && <span className="badge-gray">長距離対応</span>}
                    {biz.same_day && <span className="badge-gray">当日対応</span>}
                  </div>
                  <div className="space-y-2">
                    {slots.map(slot => (
                      <button
                        key={slot.id}
                        onClick={() => handleSelectSlot(biz.id, slot.id)}
                        className="w-full flex items-center justify-between bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 hover:bg-teal-100 transition-colors"
                      >
                        <div className="text-left">
                          <p className="text-sm font-semibold text-teal-800">
                            {slot.start_time.slice(0,5)}〜{slot.end_time.slice(0,5)}
                          </p>
                          <p className="text-xs text-teal-600">空き1枠あり</p>
                        </div>
                        <span className="text-sm font-bold text-teal-700">この枠で申請 →</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {stage === 'request' && selectedBiz && (
        <div>
          <button onClick={() => setStage('results')} className="text-xs text-slate-400 hover:text-slate-600 mb-4 block">← 検索結果に戻る</button>
          <h1 className="text-xl font-bold text-slate-800 mb-1">仮予約を申請する</h1>
          <p className="text-xs text-slate-400 mb-4">患者情報を入力して送信してください。事業所が確認後に承認・却下を行います。</p>

          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 mb-4 text-sm">
            <p className="font-semibold text-teal-800">{selectedBiz.name}</p>
            <p className="text-xs text-teal-600 mt-0.5">
              {searchDate} {startTime}〜{endTime} ／ {EQUIPMENT_LABELS[equipment]}
            </p>
          </div>

          <div className="card space-y-4">
            <div>
              <label className="label">担当者 <span className="text-red-500">*</span></label>
              <select className="input-base" value={contactName} onChange={e => setContactName(e.target.value)}>
                {DEMO_CONTACTS.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">患者氏名 <span className="text-red-500">*</span></label>
              <input
                className="input-base"
                placeholder="山田 太郎"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
              />
            </div>
            <div>
              <label className="label">乗車地（患者住所） <span className="text-red-500">*</span></label>
              <input
                className="input-base"
                placeholder="香川県丸亀市〇〇町1-1"
                value={patientAddress}
                onChange={e => setPatientAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="label">目的地 <span className="text-red-500">*</span></label>
              <input
                className="input-base"
                placeholder="香川県高松市〇〇病院"
                value={destination}
                onChange={e => setDestination(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="rental"
                checked={equipmentRental}
                onChange={e => setEquipmentRental(e.target.checked)}
                className="w-4 h-4 accent-teal-600"
              />
              <label htmlFor="rental" className="text-sm text-slate-700">
                {equipment === 'wheelchair' ? '普通型車椅子' : equipment === 'reclining_wheelchair' ? 'リクライニング車椅子' : 'ストレッチャー'}の貸出を希望する
              </label>
            </div>
            <div>
              <label className="label">備考</label>
              <textarea
                className="input-base resize-none"
                rows={2}
                placeholder="乗り換え介助・荷物の量など"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />
            </div>
            {formError && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{formError}</p>}
            <button
              onClick={handleSubmitRequest}
              disabled={submitting}
              className="btn-primary w-full"
            >
              {submitting ? '申請中...' : '📨 仮予約を申請する'}
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="card text-center py-12">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">仮予約を申請しました</h2>
          <p className="text-sm text-slate-500 mb-1">事業所が確認次第、承認・却下の通知が届きます。</p>
          <p className="text-xs text-slate-400 mb-6">（デモモードのため実際には送信されていません）</p>
          <div className="flex flex-col gap-2 max-w-xs mx-auto">
            <button
              onClick={() => navigate('/demo/msw/reservations')}
              className="btn-primary"
            >
              予約履歴を確認する
            </button>
            <button
              onClick={() => { setStage('form'); setPatientName(''); setPatientAddress(''); setDestination(''); setNotes('') }}
              className="btn-secondary"
            >
              もう一件申請する
            </button>
          </div>
        </div>
      )}
    </DemoLayout>
  )
}

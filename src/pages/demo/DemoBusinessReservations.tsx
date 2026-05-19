import { useState, useRef } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { MonthFilter } from '../../components/MonthFilter'
import { jstMonthStr } from '../../lib/jst'
import { filterReservationsByMonth, sortReservationsNewestFirst } from '../../lib/reservationView'
import DemoLayout from './DemoLayout'
import {
  INITIAL_DEMO_RESERVATIONS,
  EQUIPMENT_LABELS,
  STATUS_MAP,
  addDemoApprovedSlot,
  type DemoReservation,
} from './demoData'

type Tab = 'pending' | 'upcoming' | 'past'
type ConfirmAction = 'reject' | 'complete' | null

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

function todayStr() {
  return new Date().toISOString().split('T')[0]
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

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function DemoBusinessReservations() {
  const [reservations, setReservations] = useState<DemoReservation[]>(INITIAL_DEMO_RESERVATIONS)
  const [tab, setTab] = useState<Tab>('pending')
  const [selected, setSelected] = useState<DemoReservation | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type?: 'error' | 'info' } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [monthFilter, setMonthFilter] = useState(() => jstMonthStr(0))

  // 電話予約フォーム
  const [showPhoneModal, setShowPhoneModal] = useState(false)
  const [phoneForm, setPhoneForm] = useState<PhoneForm>({ ...EMPTY_PHONE_FORM, date: todayStr() })
  const [phoneSaving, setPhoneSaving] = useState(false)
  const [phoneError, setPhoneError] = useState('')

  const showToast = (msg: string, type?: 'error' | 'info') => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ msg, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }

  const visibleReservations = filterReservationsByMonth(reservations, monthFilter)
  const pending  = visibleReservations.filter(r => r.status === 'pending')
  const upcoming = visibleReservations.filter(r => r.status === 'confirmed')
  const past     = visibleReservations.filter(r => ['completed', 'cancelled', 'rejected'].includes(r.status))

  const list = sortReservationsNewestFirst(tab === 'pending' ? pending : tab === 'upcoming' ? upcoming : past)

  const handleApprove = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'confirmed' as const } : x))
      // カレンダー共有ストアに追加（カレンダー画面で反映される）
      addDemoApprovedSlot({
        id: `approved-${r.id}`,
        date: r.reservation_date,
        startTime: r.start_time,
        endTime: r.end_time,
        confirmed: true,
        source: 'msw',
        hospitalName: r.hospital_name,
        patientName: r.patient_name,
        patientAddress: r.patient_address,
        destination: r.destination,
        equipment: r.equipment,
        equipmentRental: r.equipment_rental,
        notes: r.notes,
      })
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      setTab('upcoming')
      showToast('承認しました。カレンダーに枠が追加されました', 'info')
    }, 700)
  }

  const handleReject = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'rejected' as const } : x))
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      showToast('申請を却下しました', 'error')
    }, 700)
  }

  const handleComplete = (r: DemoReservation) => {
    setProcessing(true)
    setTimeout(() => {
      setReservations(prev => prev.map(x => x.id === r.id ? { ...x, status: 'completed' as const } : x))
      setSelected(null)
      setConfirmAction(null)
      setProcessing(false)
      showToast('完了にしました')
    }, 700)
  }

  const handlePhoneSubmit = () => {
    const f = phoneForm
    if (!f.date || !f.startTime || !f.endTime) { setPhoneError('日付と時間を入力してください'); return }
    if (f.startTime >= f.endTime) { setPhoneError('終了時間は開始時間より後にしてください'); return }
    if (!f.patientName.trim()) { setPhoneError('患者氏名を入力してください'); return }
    if (!f.patientAddress.trim()) { setPhoneError('乗車地を入力してください'); return }
    if (!f.destination.trim()) { setPhoneError('目的地を入力してください'); return }

    setPhoneSaving(true)
    setTimeout(() => {
      const newId = `phone-${Date.now()}`
      const newRes: DemoReservation = {
        id: newId,
        status: 'confirmed',
        source: 'phone',
        hospital_name: '',
        caller_name: f.callerName.trim(),
        caller_phone: f.callerPhone.trim(),
        contact_name: f.callerName.trim() || '電話予約',
        patient_name: f.patientName.trim(),
        patient_address: f.patientAddress.trim(),
        destination: f.destination.trim(),
        equipment: f.equipment as 'wheelchair' | 'reclining_wheelchair' | 'stretcher',
        equipment_rental: f.equipmentRental,
        reservation_date: f.date,
        start_time: f.startTime,
        end_time: f.endTime,
        notes: f.notes.trim(),
        created_at: new Date().toISOString(),
        business_id: 'demo-biz-1',
        business_name: 'せとうち介護タクシー',
      }
      setReservations(prev => [...prev, newRes])
      // カレンダー共有ストアにも追加
      addDemoApprovedSlot({
        id: `phone-cal-${newId}`,
        date: f.date,
        startTime: f.startTime,
        endTime: f.endTime,
        confirmed: true,
        source: 'phone',
        callerName: f.callerName.trim(),
        callerPhone: f.callerPhone.trim(),
        patientName: f.patientName.trim(),
        patientAddress: f.patientAddress.trim(),
        destination: f.destination.trim(),
        equipment: f.equipment,
        equipmentRental: f.equipmentRental,
        notes: f.notes.trim(),
      })
      setPhoneSaving(false)
      setShowPhoneModal(false)
      setPhoneForm({ ...EMPTY_PHONE_FORM, date: todayStr() })
      setTab('upcoming')
      showToast('電話予約を記録しました。カレンダーに枠が追加されました', 'info')
    }, 700)
  }

  return (
    <DemoLayout role="business">
      <div>
        {/* Toast */}
        {toast && (
          <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg ${
            toast.type === 'error' ? 'bg-red-500 text-white' : toast.type === 'info' ? 'bg-sky-600 text-white' : 'bg-teal-600 text-white'
          }`}>
            {toast.msg}
          </div>
        )}

        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-slate-800">予約管理</h1>
          <button
            onClick={() => { setShowPhoneModal(true); setPhoneError('') }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-teal-600 text-white hover:bg-teal-700 transition-colors"
          >
            📞 電話予約を記録
          </button>
        </div>
        <p className="text-sm text-slate-600 mb-4 leading-relaxed">「申請中」タブにMSWからの仮予約が届きます。承認すると予約が確定しMSWへ通知されます。</p>

        <MonthFilter value={monthFilter} onChange={setMonthFilter} className="mb-4" />

        {/* Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {([
            { key: 'pending' as Tab, label: '申請中', count: pending.length, alert: pending.length > 0 },
            { key: 'upcoming' as Tab, label: '確定済み', count: upcoming.length, alert: false },
            { key: 'past' as Tab, label: '過去', count: past.length, alert: false },
          ] as const).map(({ key, label, count, alert }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                tab === key ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold ${
                  tab === key ? 'bg-white text-teal-600' : alert ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-500'
                }`}>{count}</span>
              )}
            </button>
          ))}
        </div>

        {/* Pending notice */}
        {tab === 'pending' && pending.length > 0 && (
          <div className="mb-3 rounded-xl px-4 py-3 text-sm border bg-amber-50 border-amber-200 text-amber-800">
            <p className="font-medium">仮予約申請が{pending.length}件届いています</p>
            <p className="text-sm mt-0.5 text-amber-700">申請から約2時間経過 — お早めにご対応ください</p>
          </div>
        )}

        {list.length === 0 ? (
          <div className="card text-center py-12">
            {tab === 'pending' ? (
              <>
                <div className="text-4xl mb-3">📭</div>
                <p className="text-slate-500 text-sm font-medium mb-1">新しい申請はありません</p>
                <p className="text-xs text-slate-400 mb-4">カレンダーに空き枠を追加するとMSWから申請が届きます</p>
                <Link to="/demo/business/calendar" className="btn-primary text-sm inline-flex">
                  📅 カレンダーで空き枠を追加
                </Link>
              </>
            ) : tab === 'upcoming' ? (
              <>
                <div className="text-4xl mb-2">📆</div>
                <p className="text-slate-500 text-sm font-medium">確定済みの予約はありません</p>
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
              const hoursElapsed = r.status === 'pending'
                ? Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60))
                : null
              return (
                <div key={r.id} className={`card hover:shadow-md transition-shadow ${
                  hoursElapsed !== null && hoursElapsed >= 6 ? 'border-red-200' : ''
                }`}>
                  <div className="flex items-start justify-between gap-2">
                    <button className="flex-1 text-left min-w-0" onClick={() => { setSelected(r); setConfirmAction(null) }}>
                      <p className="text-lg font-bold text-slate-800 flex items-center gap-1.5 flex-wrap leading-snug">
                        {format(parseISO(r.reservation_date), 'M月d日（E）', { locale: ja })} {r.start_time}〜{r.end_time}
                        {r.source === 'phone' && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full font-medium">📞 電話</span>
                        )}
                      </p>
                      <p className="text-base font-medium text-slate-600 mt-1">
                        {r.source === 'phone' ? (r.caller_name || '電話予約') : r.hospital_name} ／ {r.contact_name}
                      </p>
                      <p className="text-base text-slate-700 mt-1">患者: {r.patient_name} ／ {EQUIPMENT_LABELS[r.equipment]}</p>
                    </button>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className={STATUS_MAP[r.status]?.cls ?? 'badge-gray'}>{STATUS_MAP[r.status]?.label}</span>
                      {r.status === 'pending' && (
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
                  <span className={STATUS_MAP[selected.status]?.cls}>{STATUS_MAP[selected.status]?.label}</span>
                </div>
                <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>

              {selected.source === 'phone' && (
                <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <span className="text-blue-500">📞</span>
                <span className="text-sm text-blue-700 font-medium">電話予約（手動記録）</span>
                </div>
              )}

              {selected.status === 'pending' && (
                <div className="mb-3 rounded-lg px-3 py-2 border text-sm font-medium text-amber-600 bg-amber-50 border-amber-200">
                  申請から約2時間経過 — 早めにご対応ください
                </div>
              )}

              <dl className="space-y-3 text-base">
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0">日時</dt>
                  <dd className="text-slate-800 font-medium">
                    {format(parseISO(selected.reservation_date), 'yyyy年M月d日（E）', { locale: ja })} {selected.start_time}〜{selected.end_time}
                  </dd>
                </div>

                {selected.source === 'phone' ? (
                  <>
                    {selected.caller_name && (
                      <div className="flex gap-3">
                        <dt className="text-slate-500 w-20 flex-shrink-0">連絡者</dt>
                        <dd className="text-slate-800 font-medium">{selected.caller_name}</dd>
                      </div>
                    )}
                    {selected.caller_phone && (
                      <div className="flex gap-3">
                        <dt className="text-slate-500 w-20 flex-shrink-0">連絡先</dt>
                        <dd className="font-medium">
                          <a href={`tel:${selected.caller_phone}`} className="text-lg font-bold text-teal-700 hover:underline">
                            📞 {selected.caller_phone}
                          </a>
                        </dd>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-20 flex-shrink-0">病院</dt>
                      <dd className="text-slate-800 font-medium">{selected.hospital_name}</dd>
                    </div>
                    <div className="flex gap-3">
                      <dt className="text-slate-500 w-20 flex-shrink-0">担当者</dt>
                      <dd className="text-slate-800 font-medium">{selected.contact_name}</dd>
                    </div>
                  </>
                )}

                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0">患者氏名</dt>
                  <dd className="text-slate-800 font-medium">{selected.patient_name}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0">使用機材</dt>
                  <dd className="text-slate-800 font-medium">{EQUIPMENT_LABELS[selected.equipment]}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0">機材貸出</dt>
                  <dd className="text-slate-800 font-medium">{selected.equipment_rental ? 'あり' : 'なし'}</dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0 text-base">乗車地</dt>
                  <dd className="font-medium text-base flex-1 min-w-0">
                    <a href={mapsUrl(selected.patient_address)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline break-all">
                      📍 {selected.patient_address}
                    </a>
                  </dd>
                </div>
                <div className="flex gap-3">
                  <dt className="text-slate-500 w-20 flex-shrink-0 text-base">目的地</dt>
                  <dd className="font-medium text-base flex-1 min-w-0">
                    <a href={mapsUrl(selected.destination)} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline break-all">
                      📍 {selected.destination}
                    </a>
                  </dd>
                </div>
                {selected.notes && (
                  <div className="flex gap-3">
                    <dt className="text-slate-500 w-20 flex-shrink-0">備考</dt>
                    <dd className="text-slate-800 font-medium">{selected.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 space-y-2">
                {selected.status === 'pending' && (
                  <>
                    {confirmAction !== 'reject' && (
                      <button onClick={() => handleApprove(selected)} disabled={processing} className="btn-primary w-full">
                        {processing ? '処理中...' : '✓ 承認する（予約を確定）'}
                      </button>
                    )}
                    {confirmAction === 'reject' ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                        <p className="text-sm text-red-700 font-medium text-center">この申請を却下しますか？</p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1 text-sm">戻る</button>
                          <button onClick={() => handleReject(selected)} disabled={processing} className="flex-1 text-sm bg-red-600 text-white px-4 py-2 rounded-xl font-semibold hover:bg-red-700 disabled:opacity-50">
                            {processing ? '処理中...' : '却下する'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmAction('reject')} disabled={processing} className="btn-danger w-full">却下する</button>
                    )}
                  </>
                )}
                {selected.status === 'confirmed' && (
                  confirmAction === 'complete' ? (
                    <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                      <p className="text-sm text-orange-700 font-medium text-center">予約を完了にしますか？</p>
                      <div className="flex gap-2">
                        <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1 text-sm">戻る</button>
                        <button onClick={() => handleComplete(selected)} disabled={processing} className="flex-1 text-sm bg-orange-500 text-white px-4 py-2 rounded-xl font-semibold hover:bg-orange-600 disabled:opacity-50">
                          {processing ? '処理中...' : '完了にする'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmAction('complete')} disabled={processing} className="w-full text-sm bg-orange-500 text-white px-4 py-2.5 rounded-xl hover:bg-orange-600 disabled:opacity-50 font-semibold transition-colors">
                      ✓ 完了にする
                    </button>
                  )
                )}
                <button onClick={() => setSelected(null)} className="btn-secondary w-full">閉じる</button>
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
                  className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
              </div>

              <div className="space-y-3">
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
                <div>
                  <label className="label">患者氏名<span className="text-red-500 ml-0.5">*</span></label>
                  <input type="text" className="input-base" placeholder="例: 山田 太郎"
                    value={phoneForm.patientName}
                    onChange={e => setPhoneForm(f => ({ ...f, patientName: e.target.value }))} />
                </div>
                <div>
                  <label className="label">乗車地<span className="text-red-500 ml-0.5">*</span></label>
                  <input type="text" className="input-base" placeholder="例: 香川県丸亀市〇〇町1-2-3"
                    value={phoneForm.patientAddress}
                    onChange={e => setPhoneForm(f => ({ ...f, patientAddress: e.target.value }))} />
                </div>
                <div>
                  <label className="label">目的地<span className="text-red-500 ml-0.5">*</span></label>
                  <input type="text" className="input-base" placeholder="例: 丸亀市民病院"
                    value={phoneForm.destination}
                    onChange={e => setPhoneForm(f => ({ ...f, destination: e.target.value }))} />
                </div>
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
    </DemoLayout>
  )
}

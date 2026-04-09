import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format, addDays, startOfWeek, isSameDay, parseISO, isToday, isBefore, startOfDay, addWeeks } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AvailabilitySlot, Reservation, Business } from '../../types/database'

type SlotWithReservation = AvailabilitySlot & {
  reservation?: Array<Reservation & { hospitals: { name: string } | null }>
}

const QUICK_TIMES = [
  { label: '午前', start: '09:00', end: '12:00' },
  { label: '午後', start: '13:00', end: '17:00' },
  { label: '終日', start: '09:00', end: '18:00' },
]

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日']

export default function BusinessCalendar() {
  const { businessId, user } = useAuth()
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [slots, setSlots] = useState<SlotWithReservation[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [addStart, setAddStart] = useState('09:00')
  const [addEnd, setAddEnd] = useState('18:00')
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [profileIncomplete, setProfileIncomplete] = useState(false)

  // Recurring modal state
  const [showRecurModal, setShowRecurModal] = useState(false)
  const [recurDays, setRecurDays] = useState<boolean[]>([true, true, true, true, true, false, false]) // Mon-Fri default
  const [recurStart, setRecurStart] = useState('09:00')
  const [recurEnd, setRecurEnd] = useState('18:00')
  const [recurWeeks, setRecurWeeks] = useState(4)
  const [recurSaving, setRecurSaving] = useState(false)
  const [recurResult, setRecurResult] = useState<{ added: number; skipped: number } | null>(null)
  const [recurError, setRecurError] = useState('')

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  useEffect(() => {
    if (!user) return
    supabase
      .from('businesses')
      .select('service_areas, cancel_phone')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        const biz = data as Pick<Business, 'service_areas' | 'cancel_phone'> | null
        if (biz && (biz.service_areas.length === 0 || !biz.cancel_phone)) {
          setProfileIncomplete(true)
        }
      })
  }, [user])

  const fetchSlots = useCallback(async () => {
    if (!businessId) return
    setLoading(true)
    const from = format(weekStart, 'yyyy-MM-dd')
    const to = format(addDays(weekStart, 6), 'yyyy-MM-dd')

    const { data } = await supabase
      .from('availability_slots')
      .select(`
        *,
        reservation:reservations(
          *,
          hospitals(name)
        )
      `)
      .eq('business_id', businessId)
      .gte('date', from)
      .lte('date', to)
      .order('start_time')

    setSlots((data as unknown as SlotWithReservation[]) ?? [])
    setLoading(false)
  }, [businessId, weekStart])

  useEffect(() => {
    fetchSlots()
    if (!businessId) return
    const channel = supabase
      .channel('calendar-' + businessId)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'availability_slots',
        filter: `business_id=eq.${businessId}`,
      }, fetchSlots)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'reservations',
        filter: `business_id=eq.${businessId}`,
      }, fetchSlots)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fetchSlots, businessId])

  const openAddModal = (date: Date) => {
    setSelectedDate(date)
    setAddStart('09:00')
    setAddEnd('18:00')
    setAddError('')
    setShowAddModal(true)
  }

  const applyQuickTime = (start: string, end: string) => {
    setAddStart(start)
    setAddEnd(end)
  }

  const handleAddSlot = async () => {
    if (!businessId || !selectedDate) return
    if (addStart >= addEnd) {
      setAddError('終了時間は開始時間より後にしてください')
      return
    }
    setAddSaving(true)
    setAddError('')

    const { error } = await supabase
      .from('availability_slots')
      .insert({
        business_id: businessId,
        date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: addStart,
        end_time: addEnd,
        is_available: true,
      })

    setAddSaving(false)
    if (error) {
      setAddError('追加に失敗しました: ' + error.message)
    } else {
      setShowAddModal(false)
      fetchSlots()
    }
  }

  const handleDeleteSlot = async (slotId: string) => {
    if (!confirm('この枠を削除しますか？')) return
    await supabase.from('availability_slots').delete().eq('id', slotId)
    fetchSlots()
  }

  const handleComplete = async (reservation: Reservation, slotId: string) => {
    if (!confirm('予約を完了にしますか？\n枠が即時解放されます。')) return
    setCompletingId(reservation.id)
    await supabase.from('reservations').update({ status: 'completed' }).eq('id', reservation.id)
    await supabase.from('availability_slots').update({ is_available: true }).eq('id', slotId)
    setCompletingId(null)
    fetchSlots()
  }

  // Recurring slot bulk-add
  const handleRecurAdd = async () => {
    if (!businessId) return
    if (recurStart >= recurEnd) { setRecurError('終了時間は開始時間より後にしてください'); return }
    if (!recurDays.some(Boolean)) { setRecurError('曜日を1つ以上選択してください'); return }

    setRecurSaving(true)
    setRecurError('')
    setRecurResult(null)

    const today = startOfDay(new Date())
    // Build list of dates to add (from today for recurWeeks weeks)
    const datesToAdd: string[] = []
    for (let w = 0; w < recurWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        // d=0 is Monday (weekStartsOn:1)
        const dayIndex = d // 0=Mon, 1=Tue, ..., 6=Sun
        if (!recurDays[dayIndex]) continue
        // Find the Monday of the current week offset
        const weekMonday = startOfWeek(addWeeks(today, w), { weekStartsOn: 1 })
        const date = addDays(weekMonday, d)
        if (isBefore(date, today)) continue
        datesToAdd.push(format(date, 'yyyy-MM-dd'))
      }
    }

    if (datesToAdd.length === 0) {
      setRecurError('追加対象の日付がありません（過去の日付は除外されます）')
      setRecurSaving(false)
      return
    }

    // Check which dates already have a slot with same time to avoid duplicates
    const { data: existing } = await supabase
      .from('availability_slots')
      .select('date, start_time, end_time')
      .eq('business_id', businessId)
      .in('date', datesToAdd)
      .eq('start_time', recurStart)
      .eq('end_time', recurEnd)

    const existingKeys = new Set((existing ?? []).map(s => s.date))
    const newDates = datesToAdd.filter(d => !existingKeys.has(d))
    const skipped = datesToAdd.length - newDates.length

    if (newDates.length > 0) {
      const rows = newDates.map(date => ({
        business_id: businessId,
        date,
        start_time: recurStart,
        end_time: recurEnd,
        is_available: true,
      }))
      const { error } = await supabase.from('availability_slots').insert(rows)
      if (error) {
        setRecurError('追加に失敗しました: ' + error.message)
        setRecurSaving(false)
        return
      }
    }

    setRecurResult({ added: newDates.length, skipped })
    setRecurSaving(false)
    fetchSlots()
  }

  const slotsForDay = (date: Date) =>
    slots.filter(s => isSameDay(parseISO(s.date), date))

  const today = new Date()
  const isPastDay = (date: Date) => isBefore(startOfDay(date), startOfDay(today))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">稼働カレンダー</h1>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setShowRecurModal(true); setRecurResult(null); setRecurError('') }}
            className="px-3 h-8 rounded-lg border border-blue-200 bg-blue-50 text-xs text-blue-600 hover:bg-blue-100 font-medium"
          >
            週次設定
          </button>
          <button
            onClick={() => setWeekStart(d => addDays(d, -7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm"
          >
            ◀
          </button>
          <button
            onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
            className="px-3 h-8 rounded-lg border border-gray-200 bg-white text-xs text-gray-600 hover:bg-gray-50 font-medium"
          >
            今週
          </button>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 text-sm"
          >
            ▶
          </button>
        </div>
      </div>

      {profileIncomplete && (
        <div className="mb-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm">
          <span className="text-amber-500 mt-0.5 flex-shrink-0">⚠️</span>
          <div>
            <p className="text-amber-800 font-medium">プロフィールが未設定です</p>
            <p className="text-amber-700 text-xs mt-0.5">対応エリアやキャンセル連絡先を設定するとMSWの検索に表示されます。</p>
            <Link to="/business/profile" className="text-amber-700 underline text-xs font-medium mt-1 inline-block">
              プロフィールを設定する →
            </Link>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 mb-3 text-center">
        {format(weekStart, 'yyyy年M月d日', { locale: ja })} 〜 {format(addDays(weekStart, 6), 'M月d日', { locale: ja })}
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-400 text-sm">読み込み中...</div>
      ) : (
        <div className="space-y-2">
          {weekDays.map(date => {
            const daySlots = slotsForDay(date)
            const past = isPastDay(date)
            const todayFlag = isToday(date)
            const dayOfWeek = date.getDay()
            const isSun = dayOfWeek === 0
            const isSat = dayOfWeek === 6

            return (
              <div
                key={date.toISOString()}
                className={`rounded-xl border p-3 ${
                  todayFlag ? 'border-blue-300 bg-blue-50/50' :
                  past ? 'border-gray-100 bg-gray-50/50 opacity-60' :
                  'border-gray-100 bg-white'
                }`}
              >
                {/* Day header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className={`w-9 h-9 rounded-full flex flex-col items-center justify-center text-xs font-bold leading-tight ${
                      todayFlag ? 'bg-blue-600 text-white' :
                      isSun ? 'text-red-500' :
                      isSat ? 'text-blue-500' :
                      'text-gray-700'
                    }`}>
                      <span className="text-[10px] font-normal">{format(date, 'M/d')}</span>
                      <span>{format(date, 'E', { locale: ja })}</span>
                    </div>
                    {todayFlag && <span className="badge-blue text-[10px]">今日</span>}
                    {daySlots.length > 0 && (
                      <span className="text-xs text-gray-400">{daySlots.length}枠</span>
                    )}
                  </div>
                  {!past && (
                    <button
                      onClick={() => openAddModal(date)}
                      className="flex items-center gap-1 text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 font-medium transition-colors"
                    >
                      <span>＋</span> 枠追加
                    </button>
                  )}
                </div>

                {/* Slots */}
                {daySlots.length === 0 ? (
                  <p className="text-xs text-gray-300 pl-1">稼働枠なし</p>
                ) : (
                  <div className="space-y-1.5 pl-1">
                    {daySlots.map(slot => {
                      const resArr = Array.isArray(slot.reservation) ? slot.reservation : []
                      // Find confirmed reservation first, then any pending
                      const confirmedRes = resArr.find(r => r.status === 'confirmed')
                      const pendingRes = resArr.find(r => r.status === 'pending')
                      const hasConfirmed = !slot.is_available && !!confirmedRes
                      const hasPending = !hasConfirmed && !!pendingRes

                      return (
                        <div
                          key={slot.id}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            hasConfirmed
                              ? 'bg-orange-50 border border-orange-200'
                              : hasPending
                              ? 'bg-amber-50 border border-amber-300'
                              : 'bg-green-50 border border-green-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-gray-800 whitespace-nowrap">
                                {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
                              </span>
                              {hasConfirmed
                                ? <span className="badge-red flex-shrink-0">予約確定</span>
                                : hasPending
                                ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 flex-shrink-0">申請中</span>
                                : <span className="badge-green flex-shrink-0">空き</span>
                              }
                            </div>
                            {!hasConfirmed && !hasPending && !past && (
                              <button
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="text-xs text-red-300 hover:text-red-500 flex-shrink-0"
                              >
                                削除
                              </button>
                            )}
                          </div>

                          {/* Confirmed reservation detail */}
                          {hasConfirmed && confirmedRes && (
                            <div className="mt-2 text-xs text-gray-600 space-y-0.5 border-t border-orange-200 pt-2">
                              <p className="font-medium text-gray-700">
                                {confirmedRes.hospitals?.name ?? '—'} ／ {confirmedRes.contact_name}
                              </p>
                              <p>患者：{confirmedRes.patient_name}</p>
                              <p className="truncate">乗車地：{confirmedRes.patient_address}</p>
                              <p className="truncate">目的地：{confirmedRes.destination}</p>
                              <button
                                onClick={() => handleComplete(confirmedRes, slot.id)}
                                disabled={completingId === confirmedRes.id}
                                className="mt-2 w-full text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
                              >
                                {completingId === confirmedRes.id ? '処理中...' : '✓ 完了にする（枠を解放）'}
                              </button>
                            </div>
                          )}

                          {/* Pending request detail */}
                          {hasPending && pendingRes && (
                            <div className="mt-2 text-xs text-amber-700 space-y-0.5 border-t border-amber-200 pt-2">
                              <p className="font-medium">
                                {pendingRes.hospitals?.name ?? '—'} ／ {pendingRes.contact_name}
                              </p>
                              <p>患者：{pendingRes.patient_name}</p>
                              <p className="text-[10px] text-amber-600 mt-1">
                                ※ 申請中 — 予約管理から承認または却下してください
                              </p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add slot modal */}
      {showAddModal && selectedDate && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xs p-5 pb-8 sm:pb-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">
                {format(selectedDate, 'M月d日（E）', { locale: ja })} 枠追加
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>

            {/* Quick time buttons */}
            <div className="mb-3">
              <p className="text-xs text-gray-500 mb-1.5">クイック選択</p>
              <div className="flex gap-2">
                {QUICK_TIMES.map(qt => (
                  <button
                    key={qt.label}
                    type="button"
                    onClick={() => applyQuickTime(qt.start, qt.end)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      addStart === qt.start && addEnd === qt.end
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {qt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="label">開始時間</label>
                <input type="time" className="input-base" value={addStart} onChange={e => setAddStart(e.target.value)} />
              </div>
              <div>
                <label className="label">終了時間</label>
                <input type="time" className="input-base" value={addEnd} onChange={e => setAddEnd(e.target.value)} />
              </div>
            </div>

            {addError && <p className="text-xs text-red-600 mb-2">{addError}</p>}

            <div className="flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setShowAddModal(false)}>キャンセル</button>
              <button className="btn-primary flex-1" onClick={handleAddSlot} disabled={addSaving}>
                {addSaving ? '追加中...' : '追加する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recurring slot modal */}
      {showRecurModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">週次スケジュール設定</h3>
              <button onClick={() => setShowRecurModal(false)} className="text-gray-400 hover:text-gray-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <p className="text-xs text-gray-500 mb-4">指定した曜日・時間帯のスロットを複数週まとめて追加します。既存のスロットは重複追加されません。</p>

            {/* Day picker */}
            <div className="mb-4">
              <p className="label mb-2">稼働曜日</p>
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, i) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setRecurDays(prev => prev.map((v, idx) => idx === i ? !v : v))}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-colors ${
                      recurDays[i]
                        ? i >= 5 ? 'bg-blue-500 text-white border-blue-500' : 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-400 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div className="mb-3">
              <p className="label mb-1.5">クイック選択</p>
              <div className="flex gap-2 mb-3">
                {QUICK_TIMES.map(qt => (
                  <button
                    key={qt.label}
                    type="button"
                    onClick={() => { setRecurStart(qt.start); setRecurEnd(qt.end) }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      recurStart === qt.start && recurEnd === qt.end
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
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

            {/* Weeks ahead */}
            <div className="mb-4">
              <label className="label">追加する週数</label>
              <div className="flex gap-2">
                {[2, 4, 8, 12].map(w => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setRecurWeeks(w)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      recurWeeks === w
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                  >
                    {w}週
                  </button>
                ))}
              </div>
            </div>

            {recurError && <p className="text-xs text-red-600 mb-2">{recurError}</p>}

            {recurResult && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3 text-xs text-green-800">
                ✓ {recurResult.added}枠を追加しました
                {recurResult.skipped > 0 && ` （重複${recurResult.skipped}枠はスキップ）`}
              </div>
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

import { useState, useEffect, useCallback } from 'react'
import { format, addDays, startOfWeek, isSameDay, parseISO, isToday, isBefore, startOfDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AvailabilitySlot, Reservation } from '../../types/database'

type SlotWithReservation = AvailabilitySlot & {
  reservation?: Array<Reservation & { hospitals: { name: string } | null }>
}

const QUICK_TIMES = [
  { label: '午前', start: '09:00', end: '12:00' },
  { label: '午後', start: '13:00', end: '17:00' },
  { label: '終日', start: '09:00', end: '18:00' },
]

export default function BusinessCalendar() {
  const { businessId } = useAuth()
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

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

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
                      const res = resArr[0]
                      const hasReservation = !slot.is_available && !!res

                      return (
                        <div
                          key={slot.id}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            hasReservation
                              ? 'bg-orange-50 border border-orange-200'
                              : 'bg-green-50 border border-green-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium text-gray-800 whitespace-nowrap">
                                {slot.start_time.slice(0, 5)}〜{slot.end_time.slice(0, 5)}
                              </span>
                              {hasReservation
                                ? <span className="badge-red flex-shrink-0">予約あり</span>
                                : <span className="badge-green flex-shrink-0">空き</span>
                              }
                            </div>
                            {!hasReservation && !past && (
                              <button
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="text-xs text-red-300 hover:text-red-500 flex-shrink-0"
                              >
                                削除
                              </button>
                            )}
                          </div>

                          {hasReservation && res && (
                            <div className="mt-2 text-xs text-gray-600 space-y-0.5 border-t border-orange-200 pt-2">
                              <p className="font-medium text-gray-700">
                                {res.hospitals?.name ?? '—'} ／ {res.contact_name}
                              </p>
                              <p>患者：{res.patient_name}</p>
                              <p className="truncate">乗車地：{res.patient_address}</p>
                              <p className="truncate">目的地：{res.destination}</p>
                              <button
                                onClick={() => handleComplete(res, slot.id)}
                                disabled={completingId === res.id}
                                className="mt-2 w-full text-xs bg-orange-500 text-white px-3 py-1.5 rounded-lg hover:bg-orange-600 disabled:opacity-50 font-medium transition-colors"
                              >
                                {completingId === res.id ? '処理中...' : '✓ 完了にする（枠を解放）'}
                              </button>
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
    </div>
  )
}

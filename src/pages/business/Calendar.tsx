import { useState, useEffect } from 'react'
import { format, addDays, startOfWeek, isSameDay, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { AvailabilitySlot, Reservation } from '../../types/database'

type SlotWithReservation = AvailabilitySlot & {
  reservation?: Reservation & { hospitals: { name: string } | null }
}

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

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const fetchSlots = async () => {
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
  }

  useEffect(() => {
    fetchSlots()
    // Real-time subscription
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
  }, [businessId, weekStart])

  const openAddModal = (date: Date) => {
    setSelectedDate(date)
    setAddStart('09:00')
    setAddEnd('18:00')
    setAddError('')
    setShowAddModal(true)
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

  const handleComplete = async (reservation: Reservation) => {
    if (!confirm('予約を完了にしますか？枠が即時解放されます。')) return

    // Mark reservation as completed
    await supabase
      .from('reservations')
      .update({ status: 'completed' })
      .eq('id', reservation.id)

    // Release the slot immediately
    if (reservation.slot_id) {
      await supabase
        .from('availability_slots')
        .update({ is_available: true })
        .eq('id', reservation.slot_id)
    }
    fetchSlots()
  }

  const slotsForDay = (date: Date) =>
    slots.filter(s => isSameDay(parseISO(s.date), date))

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-900">稼働カレンダー</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setWeekStart(d => addDays(d, -7))}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            ◀
          </button>
          <span className="text-sm text-gray-600 min-w-[110px] text-center">
            {format(weekStart, 'M/d', { locale: ja })} 〜 {format(addDays(weekStart, 6), 'M/d', { locale: ja })}
          </span>
          <button
            onClick={() => setWeekStart(d => addDays(d, 7))}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            ▶
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">読み込み中...</div>
      ) : (
        <div className="space-y-3">
          {weekDays.map(date => {
            const daySlots = slotsForDay(date)
            const isToday = isSameDay(date, new Date())
            return (
              <div key={date.toISOString()} className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isToday ? 'text-blue-600' : 'text-gray-800'}`}>
                      {format(date, 'M/d（E）', { locale: ja })}
                    </span>
                    {isToday && <span className="badge-blue">今日</span>}
                  </div>
                  <button
                    onClick={() => openAddModal(date)}
                    className="text-xs bg-blue-50 text-blue-600 px-3 py-1 rounded-lg hover:bg-blue-100 font-medium"
                  >
                    ＋ 枠追加
                  </button>
                </div>

                {daySlots.length === 0 ? (
                  <p className="text-xs text-gray-400 py-2">稼働枠なし</p>
                ) : (
                  <div className="space-y-2">
                    {daySlots.map(slot => {
                      const res = Array.isArray(slot.reservation)
                        ? slot.reservation[0]
                        : slot.reservation
                      const hasReservation = !slot.is_available && res
                      return (
                        <div
                          key={slot.id}
                          className={`rounded-lg px-3 py-2 text-sm ${
                            hasReservation
                              ? 'bg-orange-50 border border-orange-200'
                              : 'bg-green-50 border border-green-200'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">
                                {slot.start_time.slice(0, 5)} 〜 {slot.end_time.slice(0, 5)}
                              </span>
                              {hasReservation ? (
                                <span className="ml-2 badge-red">予約あり</span>
                              ) : (
                                <span className="ml-2 badge-green">空き</span>
                              )}
                            </div>
                            {!hasReservation && (
                              <button
                                onClick={() => handleDeleteSlot(slot.id)}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                削除
                              </button>
                            )}
                          </div>
                          {hasReservation && res && (
                            <div className="mt-1.5 text-xs text-gray-600 space-y-0.5">
                              <p>病院: {res.hospitals?.name ?? '—'} ／ 担当: {res.contact_name}</p>
                              <p>患者: {res.patient_name} ／ 乗車地: {res.patient_address}</p>
                              <p>目的地: {res.destination}</p>
                              <button
                                onClick={() => handleComplete(res)}
                                className="mt-1.5 text-xs bg-orange-500 text-white px-3 py-1 rounded-md hover:bg-orange-600"
                              >
                                完了にする（枠を解放）
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
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-xs p-5">
            <h3 className="font-semibold text-gray-900 mb-4">
              {format(selectedDate, 'M月d日（E）', { locale: ja })} 稼働枠を追加
            </h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">開始時間</label>
                  <input type="time" className="input-base" value={addStart} onChange={e => setAddStart(e.target.value)} />
                </div>
                <div>
                  <label className="label">終了時間</label>
                  <input type="time" className="input-base" value={addEnd} onChange={e => setAddEnd(e.target.value)} />
                </div>
              </div>
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <div className="flex gap-2 mt-2">
                <button className="btn-secondary flex-1" onClick={() => setShowAddModal(false)}>キャンセル</button>
                <button className="btn-primary flex-1" onClick={handleAddSlot} disabled={addSaving}>
                  {addSaving ? '追加中...' : '追加する'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

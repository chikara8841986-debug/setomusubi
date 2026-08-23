import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfWeek } from 'date-fns'
import { ja } from 'date-fns/locale'
import DemoLayout from './DemoLayout'
import {
  DEMO_BUSINESS_VEHICLES,
  DEMO_OWN_BUSINESS_ID,
  INITIAL_DEMO_OCCUPIED_SLOTS,
  rangesOverlap,
  type DemoOccupiedSlot,
} from './demoData'

// 営業時間: デモ用に 8:00〜18:00 を 30分刻みで表示
const GRID_START_MIN = 8 * 60
const GRID_END_MIN = 18 * 60
const SLOT_MIN = 30
const TOTAL_SLOTS = (GRID_END_MIN - GRID_START_MIN) / SLOT_MIN
const CELL_H = 30

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return Math.max(0, Math.min(TOTAL_SLOTS, Math.round((h * 60 + m - GRID_START_MIN) / SLOT_MIN)))
}

function slotToTime(slot: number): string {
  const totalMin = GRID_START_MIN + slot * SLOT_MIN
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（${w}）`
}

type DragState = {
  dayIdx: number
  dateStr: string
  startSlot: number
  endSlot: number
}

export default function DemoBusinessCalendar() {
  const vehicles = DEMO_BUSINESS_VEHICLES[DEMO_OWN_BUSINESS_ID] ?? []
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(vehicles[0]?.id ?? '')
  const [slots, setSlots] = useState<DemoOccupiedSlot[]>(INITIAL_DEMO_OCCUPIED_SLOTS)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const [toast, setToast] = useState('')
  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const [selectedSlot, setSelectedSlot] = useState<DemoOccupiedSlot | null>(null)
  const [reasonDraft, setReasonDraft] = useState('')

  const dragRef = useRef<DragState | null>(null)
  const isDraggingRef = useRef(false)
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const [drag, setDrag] = useState<DragState | null>(null)

  const selectedVehicle = useMemo(
    () => vehicles.find(v => v.id === selectedVehicleId) ?? null,
    [vehicles, selectedVehicleId],
  )

  const vehicleSlots = useMemo(
    () => slots.filter(s => s.vehicle_id === selectedVehicleId),
    [slots, selectedVehicleId],
  )

  const slotsByDate = useMemo(() => {
    const map = new Map<string, DemoOccupiedSlot[]>()
    for (const s of vehicleSlots) {
      const arr = map.get(s.date)
      if (arr) arr.push(s)
      else map.set(s.date, [s])
    }
    return map
  }, [vehicleSlots])

  const slotsForDay = useCallback((d: Date) => slotsByDate.get(format(d, 'yyyy-MM-dd')) ?? [], [slotsByDate])

  const today = useMemo(() => {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d
  }, [])
  const isPastDay = useCallback((d: Date) => d < today, [today])

  // 今週表示中の一覧（キーボード操作やタップが難しい環境向けの代替導線）
  const weekSlotsSorted = useMemo(
    () => [...vehicleSlots].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time)),
    [vehicleSlots],
  )

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
    const finishDrag = () => {
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

      const conflict = slotsRef.current.find(s =>
        s.vehicle_id === selectedVehicleId &&
        s.date === current.dateStr &&
        rangesOverlap(s.start_time, s.end_time, startTime, endTime),
      )
      if (conflict) {
        showToast(`既に登録済みの時間と重なっています（${conflict.start_time}〜${conflict.end_time}）`)
        return
      }

      const newSlot: DemoOccupiedSlot = {
        id: `occ-new-${Date.now()}`,
        vehicle_id: selectedVehicleId,
        date: current.dateStr,
        start_time: startTime,
        end_time: endTime,
        reason: '予約済み',
      }
      setSlots(prev => [...prev, newSlot])
      showToast(`${dayLabel(current.dateStr)} ${startTime}〜${endTime} を予約不可にしました`)
    }

    window.addEventListener('mouseup', finishDrag)
    window.addEventListener('touchend', finishDrag)
    return () => {
      window.removeEventListener('mouseup', finishDrag)
      window.removeEventListener('touchend', finishDrag)
    }
  }, [selectedVehicleId])

  const handleDelete = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id))
    setSelectedSlot(null)
    showToast('占有時間を解除しました（MSWから予約可能になります）')
  }

  const handleSaveReason = () => {
    if (!selectedSlot) return
    setSlots(prev => prev.map(s => (s.id === selectedSlot.id ? { ...s, reason: reasonDraft.trim() || '予約済み' } : s)))
    setSelectedSlot(null)
    showToast('理由を更新しました')
  }

  const openSlot = (s: DemoOccupiedSlot) => {
    setSelectedSlot(s)
    setReasonDraft(s.reason)
  }

  return (
    <DemoLayout role="business">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-1">予約カレンダー</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        <span className="font-bold text-teal-700">グリッドを左クリックのままドラッグすると、その時間帯が「予約不可」になります。</span>
        MSWからは塗られていない時間帯のみ予約申請ができます。
      </p>

      {/* 車両タブ */}
      {vehicles.length > 0 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {vehicles.map(v => (
            <button
              key={v.id}
              type="button"
              onClick={() => setSelectedVehicleId(v.id)}
              className={`px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${
                selectedVehicleId === v.id
                  ? 'bg-teal-600 border-teal-600 text-white'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              🚐 {v.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="card text-center py-10">
          <div className="text-4xl mb-3">🚗</div>
          <p className="text-slate-700 font-medium">車両が登録されていません</p>
        </div>
      )}

      {selectedVehicle && (
        <>
          {/* 週ナビゲーション */}
          <div className="flex items-center justify-between mb-2 px-1">
            <button
              type="button"
              onClick={() => setWeekStart(d => addDays(d, -7))}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm"
            >
              ◀
            </button>
            <p className="text-xs text-slate-500 text-center">
              {selectedVehicle.name} / {format(weekStart, 'M月d日', { locale: ja })}〜{format(addDays(weekStart, 6), 'M月d日', { locale: ja })}
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}
                className="px-2.5 h-8 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                今週
              </button>
              <button
                type="button"
                onClick={() => setWeekStart(d => addDays(d, 7))}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-sm"
              >
                ▶
              </button>
            </div>
          </div>

          {/* 凡例 */}
          <div className="flex items-center gap-3 mb-2 px-1 flex-wrap">
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-400" />
              <span className="text-[10px] text-slate-400">予約不可</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-white border border-slate-300" />
              <span className="text-[10px] text-slate-400">空き（MSWから予約可）</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span className="text-[10px] text-slate-400">過去日</span>
            </div>
          </div>

          {/* グリッド */}
          <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden select-none">
            <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: '42px repeat(7, 1fr)' }}>
              <div className="h-10 border-r border-slate-100" />
              {weekDays.map(date => {
                const dateStr = format(date, 'yyyy-MM-dd')
                const todayFlag = dateStr === format(new Date(), 'yyyy-MM-dd')
                const dow = date.getDay()
                const isSun = dow === 0
                const isSat = dow === 6
                return (
                  <div key={dateStr} className={`py-1.5 px-0.5 text-center border-l border-slate-100 ${todayFlag ? 'bg-teal-50' : ''}`}>
                    <p className={`text-[10px] font-medium ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                      {format(date, 'E', { locale: ja })}
                    </p>
                    <p className={`text-sm font-bold leading-tight ${todayFlag ? 'text-teal-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                      {format(date, 'd')}
                    </p>
                  </div>
                )
              })}
            </div>

            <div className="overflow-x-auto">
              <div className="grid" style={{ gridTemplateColumns: '42px repeat(7, 1fr)', minWidth: 560 }}>
                <div className="border-r border-slate-100">
                  {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                    <div key={i} style={{ height: CELL_H }} className="relative border-t border-slate-50">
                      {i % 2 === 0 && (
                        <span className="absolute -top-2 right-1 text-[9px] text-slate-300 leading-none pointer-events-none">
                          {slotToTime(i)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {weekDays.map((date, dayIdx) => {
                  const dateStr = format(date, 'yyyy-MM-dd')
                  const past = isPastDay(date)
                  const daySlots = slotsForDay(date)
                  return (
                    <div
                      key={dateStr}
                      className="relative border-l border-slate-100"
                      style={{ height: TOTAL_SLOTS * CELL_H }}
                      onTouchMove={handleGridTouchMove}
                    >
                      {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                        const isDragCell =
                          drag?.dayIdx === dayIdx &&
                          slotIdx >= Math.min(drag.startSlot, drag.endSlot) &&
                          slotIdx <= Math.max(drag.startSlot, drag.endSlot)
                        return (
                          <div
                            key={slotIdx}
                            data-day={dayIdx}
                            data-slot={slotIdx}
                            style={{ height: CELL_H, top: slotIdx * CELL_H }}
                            className={[
                              'absolute left-0 right-0 z-0 border-t border-slate-50',
                              past ? 'bg-slate-50 cursor-default' : 'cursor-crosshair hover:bg-rose-50/60',
                              isDragCell ? '!bg-rose-100' : '',
                            ].join(' ')}
                            onMouseDown={!past ? () => handleCellMouseDown(dayIdx, slotIdx) : undefined}
                            onMouseEnter={!past ? () => handleCellMouseEnter(dayIdx, slotIdx) : undefined}
                            onTouchStart={!past ? handleCellTouchStart(dayIdx, slotIdx) : undefined}
                          />
                        )
                      })}

                      {daySlots.map(s => {
                        const startSlot = timeToSlot(s.start_time)
                        const endSlot = timeToSlot(s.end_time)
                        const top = startSlot * CELL_H + 1
                        const height = Math.max((endSlot - startSlot) * CELL_H - 2, 6)
                        return (
                          <div
                            key={s.id}
                            style={{ top, height, left: 3, right: 3 }}
                            className="absolute bg-rose-400 border border-rose-600 rounded text-white overflow-hidden cursor-pointer z-20 hover:brightness-95 transition-all"
                            onMouseDown={e => { e.stopPropagation(); openSlot(s) }}
                            onTouchStart={e => { e.stopPropagation(); openSlot(s) }}
                            title={`${s.start_time}〜${s.end_time}: ${s.reason}`}
                          >
                            <div className="px-1 py-0.5 text-[9px] font-medium leading-tight whitespace-nowrap overflow-hidden">
                              {s.start_time}〜{s.end_time}
                            </div>
                          </div>
                        )
                      })}

                      {drag?.dayIdx === dayIdx && (() => {
                        const startSlot = Math.min(drag.startSlot, drag.endSlot)
                        const endSlot = Math.max(drag.startSlot, drag.endSlot) + 1
                        return (
                          <div
                            style={{ top: startSlot * CELL_H + 1, height: (endSlot - startSlot) * CELL_H - 2, left: 3, right: 3 }}
                            className="absolute bg-rose-200/80 border-2 border-rose-400 rounded pointer-events-none z-30 flex items-center justify-center"
                          >
                            <span className="text-[10px] text-rose-800 font-semibold">
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

          {/* 一覧（タップ操作が難しい場合の代替導線） */}
          <div className="card mt-4">
            <h2 className="text-sm font-bold text-slate-700 mb-2">{selectedVehicle.name}の予約不可時間（今週）</h2>
            {weekSlotsSorted.filter(s => weekDays.some(d => format(d, 'yyyy-MM-dd') === s.date)).length === 0 ? (
              <p className="text-xs text-slate-400">この週は登録なし → 全て MSW から予約可能です</p>
            ) : (
              <div className="space-y-1">
                {weekSlotsSorted
                  .filter(s => weekDays.some(d => format(d, 'yyyy-MM-dd') === s.date))
                  .map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 text-sm py-1.5 px-2 bg-rose-50 rounded-lg">
                      <span className="text-rose-800">
                        <span className="font-bold">{dayLabel(s.date)} {s.start_time}〜{s.end_time}</span>
                        {' '}<span className="text-rose-600">{s.reason}</span>
                      </span>
                      <button
                        onClick={() => handleDelete(s.id)}
                        className="text-xs text-rose-600 hover:bg-rose-100 px-2 py-0.5 rounded shrink-0"
                      >
                        解除
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="card bg-sky-50 border-sky-200 text-sm text-sky-800 space-y-1 mt-4">
        <p className="font-semibold">💡 デモのヒント</p>
        <p>
          ここで塗った時間は <b>MSWの検索結果から自動で除外</b> されます。
          MSW視点で見るには上部の「⇄ 切替」→「MSW」→「予約する」で同じ日時を検索してみてください。
        </p>
      </div>

      {/* 選択中スロットの編集モーダル */}
      {selectedSlot && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setSelectedSlot(null)}
        >
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-800">予約不可時間の編集</h3>
            <p className="text-sm text-slate-500">
              {dayLabel(selectedSlot.date)} {selectedSlot.start_time}〜{selectedSlot.end_time}
            </p>
            <div>
              <label className="label">理由</label>
              <input
                className="input-base"
                value={reasonDraft}
                onChange={e => setReasonDraft(e.target.value)}
                placeholder="例: 予約済み（佐藤様）/ 休憩 / メンテナンス"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleSaveReason} className="btn-primary flex-1">保存</button>
              <button
                onClick={() => handleDelete(selectedSlot.id)}
                className="btn-secondary flex-1 !text-rose-600 !border-rose-300"
              >
                解除する
              </button>
            </div>
            <button onClick={() => setSelectedSlot(null)} className="text-xs text-slate-400 w-full text-center">
              閉じる
            </button>
          </div>
        </div>
      )}
    </DemoLayout>
  )
}

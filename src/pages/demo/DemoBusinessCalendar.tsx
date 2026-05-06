import { useState, useEffect, useRef, useCallback } from 'react'
import { format, addDays, startOfWeek } from 'date-fns'
import { ja } from 'date-fns/locale'
import DemoLayout from './DemoLayout'
import {
  INITIAL_OPEN_CAL_SLOTS,
  INITIAL_CONFIRMED_CAL_SLOTS,
  demoApprovedSlots,
  EQUIPMENT_LABELS,
  type DemoCalSlot,
} from './demoData'

// ── Grid constants ──
const GRID_START  = 6
const GRID_END    = 22
const TOTAL_SLOTS = (GRID_END - GRID_START) * 2
const CELL_H      = 28

function timeToSlot(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return Math.max(0, Math.min(TOTAL_SLOTS, (h - GRID_START) * 2 + (m >= 30 ? 1 : 0)))
}
function slotToTime(n: number): string {
  const totalMins = n * 30 + GRID_START * 60
  const h  = Math.floor(totalMins / 60)
  const mm = totalMins % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
function dateStr(d: Date) { return d.toISOString().split('T')[0] }

type DragState = { dayIdx: number; dateStr: string; startSlot: number; endSlot: number }

// Demo business hours
const BIZ_START = '09:00'
const BIZ_END   = '18:00'
const bizStartSlot = timeToSlot(BIZ_START)
const bizEndSlot   = timeToSlot(BIZ_END)

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function DemoBusinessCalendar() {
  const today = new Date()
  const [weekOffset, setWeekOffset] = useState(0)

  // スロット: 初期オープン + 初期確定 + 承認後追加分
  const [slots, setSlots] = useState<DemoCalSlot[]>([
    ...INITIAL_OPEN_CAL_SLOTS,
    ...INITIAL_CONFIRMED_CAL_SLOTS,
    ...demoApprovedSlots,
  ])

  const [toast, setToast] = useState('')
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedSlot, setSelectedSlot] = useState<DemoCalSlot | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editMode,  setEditMode]  = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd,   setEditEnd]   = useState('')
  const [editError, setEditError] = useState('')

  // Drag state
  const isDraggingRef = useRef(false)
  const dragRef       = useRef<DragState | null>(null)
  const [drag, setDragState] = useState<DragState | null>(null)

  const weekStart = startOfWeek(addDays(today, weekOffset * 7), { weekStartsOn: 1 })
  const weekDays  = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  // 予約管理で承認追加されたスロットをカレンダーに反映（ページ遷移後に同期）
  useEffect(() => {
    if (demoApprovedSlots.length === 0) return
    setSlots(prev => {
      const existingIds = new Set(prev.map(s => s.id))
      const newSlots = demoApprovedSlots.filter(s => !existingIds.has(s.id))
      return newSlots.length > 0 ? [...prev, ...newSlots] : prev
    })
  }, [])

  // ── Drag handlers ──
  const handleCellMouseDown = useCallback((dayIdx: number, slotIdx: number) => {
    const ds = dateStr(weekDays[dayIdx])
    const d: DragState = { dayIdx, dateStr: ds, startSlot: slotIdx, endSlot: slotIdx }
    isDraggingRef.current = true
    dragRef.current = d
    setDragState(d)
    window.getSelection()?.removeAllRanges()
  }, [weekDays])

  const handleCellMouseEnter = useCallback((dayIdx: number, slotIdx: number) => {
    if (!isDraggingRef.current || dragRef.current?.dayIdx !== dayIdx) return
    const d: DragState = { ...dragRef.current, endSlot: slotIdx }
    dragRef.current = d
    setDragState({ ...d })
  }, [])

  const handleCellTouchStart = useCallback((dayIdx: number, slotIdx: number) => (e: React.TouchEvent) => {
    e.preventDefault()
    const ds = dateStr(weekDays[dayIdx])
    const d: DragState = { dayIdx, dateStr: ds, startSlot: slotIdx, endSlot: slotIdx }
    isDraggingRef.current = true
    dragRef.current = d
    setDragState(d)
  }, [weekDays])

  const handleGridTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingRef.current || !dragRef.current) return
    e.preventDefault()
    const touch = e.touches[0]
    const el = document.elementFromPoint(touch.clientX, touch.clientY)
    if (!el) return
    const dayAttr  = el.getAttribute('data-day')
    const slotAttr = el.getAttribute('data-slot')
    if (dayAttr === null || slotAttr === null) return
    const dIdx = parseInt(dayAttr); const sIdx = parseInt(slotAttr)
    if (dIdx !== dragRef.current.dayIdx) return
    const d: DragState = { ...dragRef.current, endSlot: sIdx }
    dragRef.current = d; setDragState({ ...d })
  }, [])

  // mouseup / touchend → 空き枠を追加
  useEffect(() => {
    const handler = () => {
      if (!isDraggingRef.current) return
      isDraggingRef.current = false
      const d = dragRef.current
      dragRef.current = null
      setDragState(null)
      if (!d) return

      const startS = Math.min(d.startSlot, d.endSlot)
      const endS   = Math.max(d.startSlot, d.endSlot) + 1
      if (startS >= TOTAL_SLOTS) return

      const startTime = slotToTime(startS)
      const endTime   = slotToTime(Math.min(endS, TOTAL_SLOTS))

      setSlots(prev => [...prev, {
        id: `demo-${Date.now()}`,
        date: d.dateStr,
        startTime,
        endTime,
        confirmed: false,
      }])
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      setToast(`${d.dateStr.slice(5).replace('-', '/')} ${startTime}〜${endTime} を追加しました`)
      toastTimerRef.current = setTimeout(() => setToast(''), 2500)
    }

    window.addEventListener('mouseup', handler)
    window.addEventListener('touchend', handler)
    return () => {
      window.removeEventListener('mouseup', handler)
      window.removeEventListener('touchend', handler)
    }
  }, [])

  // 別スロットを開いたら編集モードをリセット
  useEffect(() => {
    setEditMode(false)
    setEditError('')
  }, [selectedSlot?.id])

  const showDemoToast = (msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(''), 2500)
  }

  const handleEdit = (id: string) => {
    if (!editStart || !editEnd) { setEditError('時間を入力してください'); return }
    if (editStart >= editEnd) { setEditError('終了は開始より後にしてください'); return }
    setSlots(prev => prev.map(s => s.id === id ? { ...s, startTime: editStart, endTime: editEnd } : s))
    setSelectedSlot(prev => prev && prev.id === id ? { ...prev, startTime: editStart, endTime: editEnd } : prev)
    setEditMode(false)
    setEditError('')
    showDemoToast(`${editStart}〜${editEnd} に変更しました`)
  }

  const handleDelete = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id))
    setDeleteConfirmId(null)
    setSelectedSlot(null)
    showDemoToast('削除しました')
  }

  const isPastDay = (d: Date) => {
    const t = new Date(); t.setHours(0, 0, 0, 0)
    const dd = new Date(d); dd.setHours(0, 0, 0, 0)
    return dd < t
  }

  return (
    <DemoLayout role="business">
      <div>
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg whitespace-nowrap">
            {toast}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-800 mb-0.5">カレンダー（空き枠管理）</h1>
        <p className="text-xs text-slate-400 mb-3">グリッドをドラッグして空き枠を追加 / ブロックをタップで詳細・削除</p>

        {/* Week navigation */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setWeekOffset(w => w - 1)} className="btn-secondary text-sm px-3 py-1.5" disabled={weekOffset <= 0}>← 前週</button>
          <span className="text-xs font-semibold text-slate-700">
            {format(weekDays[0], 'M/d', { locale: ja })} 〜 {format(weekDays[6], 'M/d（E）', { locale: ja })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} className="btn-secondary text-sm px-3 py-1.5">次週 →</button>
        </div>

        {/* Time grid */}
        <div
          className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden select-none"
          onTouchMove={handleGridTouchMove}
        >
          {/* Day headers */}
          <div className="grid border-b border-slate-200" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>
            <div className="h-9 border-r border-slate-100" />
            {weekDays.map((date, _dayIdx) => {
              const ds      = dateStr(date)
              const isToday = ds === dateStr(today)
              const dow     = date.getDay()
              const isSun   = dow === 0; const isSat = dow === 6
              return (
                <div key={ds} className={`py-1 px-0.5 text-center border-l border-slate-100 ${isToday ? 'bg-teal-50' : ''}`}>
                  <p className={`text-[10px] ${isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-400'}`}>
                    {format(date, 'E', { locale: ja })}
                  </p>
                  <p className={`text-sm font-bold ${isToday ? 'text-teal-600' : isSun ? 'text-red-400' : isSat ? 'text-blue-400' : 'text-slate-700'}`}>
                    {format(date, 'd')}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Scrollable grid */}
          <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 340px)', minHeight: '320px' }}>
            <div className="grid" style={{ gridTemplateColumns: '38px repeat(7, 1fr)' }}>

              {/* Time labels */}
              <div className="border-r border-slate-100">
                {Array.from({ length: TOTAL_SLOTS }).map((_, i) => (
                  <div key={i} style={{ height: CELL_H }}
                    className={`relative ${i % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50'}`}>
                    {i % 2 === 0 && (
                      <span className="absolute -top-2 right-1 text-[9px] text-slate-300 leading-none pointer-events-none">
                        {slotToTime(i).slice(0, 5)}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((date, dayIdx) => {
                const ds       = dateStr(date)
                const past     = isPastDay(date)
                const isToday  = ds === dateStr(today)
                const daySlots = slots.filter(s => s.date === ds)

                return (
                  <div key={ds}
                    className={`relative border-l border-slate-100 ${isToday ? 'bg-teal-50/20' : ''}`}
                    style={{ height: TOTAL_SLOTS * CELL_H }}>

                    {/* Hit targets */}
                    {Array.from({ length: TOTAL_SLOTS }).map((_, slotIdx) => {
                      const inBiz = slotIdx >= bizStartSlot && slotIdx < bizEndSlot
                      const isDragCell = drag?.dayIdx === dayIdx &&
                        slotIdx >= Math.min(drag.startSlot, drag.endSlot) &&
                        slotIdx <= Math.max(drag.startSlot, drag.endSlot)
                      return (
                        <div
                          key={slotIdx}
                          data-day={dayIdx}
                          data-slot={slotIdx}
                          style={{ height: CELL_H, top: slotIdx * CELL_H }}
                          className={[
                            'absolute left-0 right-0 z-0',
                            slotIdx % 2 === 0 ? 'border-t border-slate-100' : 'border-t border-slate-50',
                            inBiz ? '' : 'bg-slate-50/60',
                            isDragCell ? '!bg-teal-100' : '',
                            past ? 'cursor-default' : 'cursor-crosshair hover:bg-teal-50/50',
                          ].join(' ')}
                          onMouseDown={!past ? () => handleCellMouseDown(dayIdx, slotIdx) : undefined}
                          onMouseEnter={!past ? () => handleCellMouseEnter(dayIdx, slotIdx) : undefined}
                          onTouchStart={!past ? handleCellTouchStart(dayIdx, slotIdx) : undefined}
                        />
                      )
                    })}

                    {/* Business hours indicator */}
                    <div className="absolute left-0 w-0.5 bg-teal-200/80 pointer-events-none z-10"
                      style={{ top: bizStartSlot * CELL_H, height: (bizEndSlot - bizStartSlot) * CELL_H }} />

                    {/* Slot blocks */}
                    {daySlots.map(slot => {
                      const startS = timeToSlot(slot.startTime)
                      const endS   = timeToSlot(slot.endTime)
                      const top    = startS * CELL_H + 1
                      const height = Math.max((endS - startS) * CELL_H - 2, 6)
                      const bgClass = slot.confirmed
                        ? slot.source === 'phone'
                          ? 'bg-blue-400 border-blue-500'
                          : 'bg-teal-400 border-teal-500'
                        : 'bg-green-400 border-green-500'
                      return (
                        <div key={slot.id}
                          style={{ top, height, left: 3, right: 3 }}
                          className={`absolute ${bgClass} border rounded text-white overflow-hidden cursor-pointer z-20 hover:brightness-95 transition-all`}
                          onMouseDown={e => { e.stopPropagation(); setSelectedSlot(slot); setDeleteConfirmId(null) }}
                          onTouchStart={e => { e.stopPropagation(); setSelectedSlot(slot); setDeleteConfirmId(null) }}
                        >
                          <div className="px-1 py-0.5 text-[9px] font-medium leading-tight whitespace-nowrap overflow-hidden">
                            {slot.startTime}〜{slot.endTime}
                            {slot.confirmed && slot.source === 'phone' && <span className="ml-0.5">📞</span>}
                            {slot.confirmed && slot.source === 'msw' && <span className="ml-0.5">✓</span>}
                          </div>
                        </div>
                      )
                    })}

                    {/* Drag preview */}
                    {drag?.dayIdx === dayIdx && (() => {
                      const startS = Math.min(drag.startSlot, drag.endSlot)
                      const endS   = Math.max(drag.startSlot, drag.endSlot) + 1
                      return (
                        <div style={{ top: startS * CELL_H + 1, height: (endS - startS) * CELL_H - 2, left: 3, right: 3 }}
                          className="absolute bg-teal-200/80 border-2 border-teal-400 rounded pointer-events-none z-30 flex items-center justify-center">
                          <span className="text-[10px] text-teal-800 font-semibold">
                            {slotToTime(startS)}〜{slotToTime(endS)}
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

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 px-1 flex-wrap">
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
            <span className="text-[10px] text-slate-400">空き</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-teal-400" />
            <span className="text-[10px] text-slate-400">予約確定（MSW）</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
            <span className="text-[10px] text-slate-400">電話予約</span>
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <div className="w-0.5 h-3 bg-teal-200 rounded" />
            <span className="text-[10px] text-slate-400">営業時間（9〜18時）</span>
          </div>
        </div>

        <div className="mt-3 card bg-sky-50 border-sky-200 text-xs text-sky-800 space-y-1">
          <p className="font-semibold">💡 デモのヒント</p>
          <p>グリッドをドラッグして空き枠を追加。予約管理で承認すると水色のブロックが追加されます。ブロックをタップすると詳細を確認できます。</p>
        </div>

        {/* Slot detail modal */}
        {selectedSlot && (
          <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
            onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setEditMode(false); setEditError('') }}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5 pb-8 sm:pb-5 max-h-[80vh] overflow-y-auto"
              onClick={e => e.stopPropagation()}>

              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-bold text-slate-800 text-base">{selectedSlot.startTime}〜{selectedSlot.endTime}</p>
                  <p className="text-xs text-slate-400">{selectedSlot.date}</p>
                </div>
                <div className="flex items-center gap-2">
                  {selectedSlot.confirmed ? (
                    selectedSlot.source === 'phone'
                      ? <span className="text-[10px] bg-blue-100 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">📞 電話予約</span>
                      : <span className="badge-blue">確定</span>
                  ) : (
                    <span className="badge-green">空き</span>
                  )}
                  <button
                    onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null); setEditMode(false); setEditError('') }}
                    className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center"
                  >×</button>
                </div>
              </div>

              {/* 確定予約の詳細 */}
              {selectedSlot.confirmed && (
                <div className="border-t border-slate-100 pt-3 mb-3 space-y-1 text-xs text-slate-600">
                  {selectedSlot.source === 'phone' ? (
                    <>
                      {selectedSlot.callerName && (
                        <p><span className="text-slate-400">連絡者：</span><span className="font-medium text-slate-700">{selectedSlot.callerName}</span></p>
                      )}
                      {selectedSlot.callerPhone && (
                        <p>
                          <span className="text-slate-400">連絡先：</span>
                          <a href={`tel:${selectedSlot.callerPhone}`} className="text-teal-700 hover:underline font-medium">
                            📞 {selectedSlot.callerPhone}
                          </a>
                        </p>
                      )}
                    </>
                  ) : (
                    selectedSlot.hospitalName && (
                      <p><span className="text-slate-400">病院：</span><span className="font-medium text-slate-700">{selectedSlot.hospitalName}</span></p>
                    )
                  )}
                  {selectedSlot.patientName && (
                    <p><span className="text-slate-400">患者：</span><span className="font-medium text-slate-700">{selectedSlot.patientName}</span>　<span className="text-slate-400">{EQUIPMENT_LABELS[selectedSlot.equipment ?? ''] ?? selectedSlot.equipment}{selectedSlot.equipmentRental ? '（貸出あり）' : ''}</span></p>
                  )}
                  {selectedSlot.patientAddress && (
                    <div className="flex items-center gap-1">
                      <a href={mapsUrl(selectedSlot.patientAddress)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 truncate text-teal-700 hover:underline">📍 乗車：{selectedSlot.patientAddress}</a>
                    </div>
                  )}
                  {selectedSlot.destination && (
                    <div className="flex items-center gap-1">
                      <a href={mapsUrl(selectedSlot.destination)} target="_blank" rel="noopener noreferrer"
                        className="flex-1 truncate text-teal-700 hover:underline">📍 目的：{selectedSlot.destination}</a>
                    </div>
                  )}
                  {selectedSlot.notes && (
                    <p className="text-slate-500 italic">📝 {selectedSlot.notes}</p>
                  )}
                  <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-50">※ デモモードのため完了処理は予約管理画面で行います</p>
                </div>
              )}

              {/* 空き枠の操作（確定済みには表示しない） */}
              {!selectedSlot.confirmed && (
                <>
                  <p className="text-xs text-slate-500 mb-3">※ デモモードのため予約は入りません</p>
                  <div className="space-y-2">
                    {editMode ? (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-slate-600">時間を変更（1分単位）</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">開始</label>
                            <input type="time" className="input-base text-sm" value={editStart} onChange={e => setEditStart(e.target.value)} />
                          </div>
                          <div>
                            <label className="text-[10px] text-slate-400 block mb-0.5">終了</label>
                            <input type="time" className="input-base text-sm" value={editEnd} onChange={e => setEditEnd(e.target.value)} />
                          </div>
                        </div>
                        {editError && <p className="text-xs text-red-500">{editError}</p>}
                        <div className="flex gap-2">
                          <button onClick={() => { setEditMode(false); setEditError('') }} className="flex-1 btn-secondary text-sm">キャンセル</button>
                          <button onClick={() => handleEdit(selectedSlot.id)} className="flex-1 btn-primary text-sm">保存する</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => { setEditMode(true); setDeleteConfirmId(null); setEditStart(selectedSlot.startTime); setEditEnd(selectedSlot.endTime) }}
                          className="w-full text-xs text-slate-500 hover:text-teal-600 text-center py-1.5 border border-slate-200 rounded-lg hover:border-teal-300 transition-colors"
                        >
                          ✏️ 時間を変更する
                        </button>
                        {deleteConfirmId === selectedSlot.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => setDeleteConfirmId(null)} className="flex-1 btn-secondary text-sm">戻る</button>
                            <button onClick={() => handleDelete(selectedSlot.id)}
                              className="flex-1 text-sm bg-red-500 text-white rounded-xl px-4 py-2 hover:bg-red-600 font-medium">削除確定</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(selectedSlot.id)}
                            className="w-full text-xs text-red-400 hover:text-red-600 text-center py-1">
                            この枠を削除する
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </>
              )}

              {selectedSlot.confirmed && (
                <button
                  onClick={() => { setSelectedSlot(null); setDeleteConfirmId(null) }}
                  className="btn-secondary w-full mt-2"
                >
                  閉じる
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </DemoLayout>
  )
}

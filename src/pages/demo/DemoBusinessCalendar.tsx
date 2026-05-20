import { useMemo, useState } from 'react'
import DemoLayout from './DemoLayout'
import {
  DEMO_BUSINESS_VEHICLES,
  DEMO_OWN_BUSINESS_ID,
  INITIAL_DEMO_OCCUPIED_SLOTS,
  rangesOverlap,
  type DemoOccupiedSlot,
} from './demoData'

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function todayPlus(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

function dayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}（${w}）`
}

// 営業時間: デモ用に 8:00 〜 18:00 を 30分刻みで表示
const BUSINESS_START_MIN = 8 * 60
const BUSINESS_END_MIN = 18 * 60
const SLOT_MIN = 30

function genTimeOptions(): string[] {
  const out: string[] = []
  for (let m = BUSINESS_START_MIN; m <= BUSINESS_END_MIN; m += SLOT_MIN) {
    const h = Math.floor(m / 60)
    const mm = m % 60
    out.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`)
  }
  return out
}

const TIME_OPTIONS = genTimeOptions()

export default function DemoBusinessCalendar() {
  const vehicles = DEMO_BUSINESS_VEHICLES[DEMO_OWN_BUSINESS_ID] ?? []
  const [slots, setSlots] = useState<DemoOccupiedSlot[]>(INITIAL_DEMO_OCCUPIED_SLOTS)
  const [date, setDate] = useState<string>(todayPlus(1))

  // 追加フォーム
  const [addVehicleId, setAddVehicleId] = useState<string>(vehicles[0]?.id ?? '')
  const [addStart, setAddStart] = useState('09:00')
  const [addEnd, setAddEnd] = useState('10:30')
  const [addReason, setAddReason] = useState('予約済み')
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  // 表示用: 自分の事業所車両だけ
  const ownSlots = useMemo(
    () => slots.filter(s => vehicles.some(v => v.id === s.vehicle_id) && s.date === date),
    [slots, vehicles, date],
  )

  const handleAdd = () => {
    setError('')
    if (!addVehicleId) {
      setError('車両を選択してください')
      return
    }
    if (addStart >= addEnd) {
      setError('終了時刻は開始時刻より後にしてください')
      return
    }
    const conflict = slots.find(s =>
      s.vehicle_id === addVehicleId &&
      s.date === date &&
      rangesOverlap(s.start_time, s.end_time, addStart, addEnd),
    )
    if (conflict) {
      setError(`既に登録された時間と重なっています: ${conflict.start_time}〜${conflict.end_time}（${conflict.reason}）`)
      return
    }
    setSlots(prev => [...prev, {
      id: `occ-new-${Date.now()}`,
      vehicle_id: addVehicleId,
      date,
      start_time: addStart,
      end_time: addEnd,
      reason: addReason.trim() || '予約済み',
    }])
    showToast('占有時間を登録しました（MSWからは予約不可になります）')
  }

  const handleDelete = (id: string) => {
    setSlots(prev => prev.filter(s => s.id !== id))
    showToast('占有時間を解除しました（MSWから予約可能になります）')
  }

  // 占有率（営業時間に対して何%埋まっているか）
  const occupancyByVehicle = useMemo(() => {
    const span = BUSINESS_END_MIN - BUSINESS_START_MIN
    return vehicles.map(v => {
      const total = ownSlots
        .filter(s => s.vehicle_id === v.id)
        .reduce((sum, s) => {
          const [sh, sm] = s.start_time.split(':').map(Number)
          const [eh, em] = s.end_time.split(':').map(Number)
          const clipStart = Math.max(BUSINESS_START_MIN, sh * 60 + sm)
          const clipEnd = Math.min(BUSINESS_END_MIN, eh * 60 + em)
          return sum + Math.max(0, clipEnd - clipStart)
        }, 0)
      const pct = Math.round((total / span) * 100)
      return { vehicle: v, occupiedMin: total, pct }
    })
  }, [vehicles, ownSlots])

  return (
    <DemoLayout role="business">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-1">予約カレンダー</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        <span className="font-bold text-teal-700">この画面では「埋まっている時間」を登録します。</span>
        MSWからは登録されていない時間帯のみ予約申請ができます。
      </p>

      {/* 日付セレクタ */}
      <div className="card mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <label className="label !mb-0 text-sm">表示する日:</label>
          <input
            type="date"
            className="input-base w-auto"
            value={date}
            min={todayPlus(0)}
            onChange={e => setDate(e.target.value)}
          />
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 7].map(n => (
              <button
                key={n}
                onClick={() => setDate(todayPlus(n))}
                className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                  date === todayPlus(n)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                }`}
              >
                {n === 0 ? '今日' : n === 1 ? '明日' : `${n}日後`}
              </button>
            ))}
          </div>
        </div>
        <p className="text-sm text-slate-500 mt-2">{dayLabel(date)} の占有時間</p>
      </div>

      {/* 車両ごとのタイムライン */}
      <div className="card mb-4">
        <h2 className="text-lg font-bold text-slate-700 mb-3">
          車両別タイムライン
          <span className="text-xs text-slate-400 ml-2 font-normal">（営業時間 {Math.floor(BUSINESS_START_MIN/60)}:00〜{Math.floor(BUSINESS_END_MIN/60)}:00）</span>
        </h2>

        <div className="space-y-3">
          {occupancyByVehicle.map(({ vehicle, pct }) => {
            const vehicleSlots = ownSlots.filter(s => s.vehicle_id === vehicle.id)
            return (
              <div key={vehicle.id} className="border border-slate-200 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-slate-800">🚐 {vehicle.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    pct >= 80 ? 'bg-red-100 text-red-700'
                    : pct >= 40 ? 'bg-amber-100 text-amber-700'
                    : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    占有 {pct}%
                  </span>
                </div>

                {/* 簡易タイムラインバー */}
                <div className="relative h-7 bg-emerald-50 rounded-lg overflow-hidden border border-emerald-200 mb-2">
                  {vehicleSlots.map(s => {
                    const [sh, sm] = s.start_time.split(':').map(Number)
                    const [eh, em] = s.end_time.split(':').map(Number)
                    const span = BUSINESS_END_MIN - BUSINESS_START_MIN
                    const left = ((sh * 60 + sm - BUSINESS_START_MIN) / span) * 100
                    const width = ((eh * 60 + em) - (sh * 60 + sm)) / span * 100
                    return (
                      <div
                        key={s.id}
                        className="absolute top-0 h-full bg-rose-400/80 border-l border-r border-rose-600 flex items-center justify-center text-[10px] font-bold text-white overflow-hidden"
                        style={{ left: `${Math.max(0, left)}%`, width: `${Math.max(2, width)}%` }}
                        title={`${s.start_time}〜${s.end_time}: ${s.reason}`}
                      >
                        {width > 8 && `${s.start_time}-${s.end_time}`}
                      </div>
                    )
                  })}
                </div>

                {/* 占有スロット一覧 */}
                {vehicleSlots.length === 0 ? (
                  <p className="text-xs text-slate-400">この日は占有なし → 終日 MSW から予約可能</p>
                ) : (
                  <div className="space-y-1">
                    {vehicleSlots.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2 text-sm py-1 px-2 bg-rose-50 rounded-lg">
                        <span className="text-rose-800">
                          <span className="font-bold">{s.start_time}〜{s.end_time}</span>
                          {' '}<span className="text-rose-600">{s.reason}</span>
                        </span>
                        <button
                          onClick={() => handleDelete(s.id)}
                          className="text-xs text-rose-600 hover:bg-rose-100 px-2 py-0.5 rounded"
                        >
                          解除
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 追加フォーム */}
      <div className="card space-y-3 border-2 border-teal-200">
        <h2 className="text-lg font-bold text-slate-700">＋ 占有時間を追加</h2>
        <p className="text-sm text-slate-600">
          電話で受けた予約・休憩・メンテナンスなど「この車両が使えない時間」を登録します。
        </p>

        <div>
          <label className="label">車両</label>
          <select className="input-base" value={addVehicleId} onChange={e => setAddVehicleId(e.target.value)}>
            {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">開始</label>
            <select className="input-base" value={addStart} onChange={e => setAddStart(e.target.value)}>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="label">終了</label>
            <select className="input-base" value={addEnd} onChange={e => setAddEnd(e.target.value)}>
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">理由（任意）</label>
          <input
            className="input-base"
            placeholder="例: 予約済み（佐藤様）/ 休憩 / メンテナンス"
            value={addReason}
            onChange={e => setAddReason(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        <button onClick={handleAdd} className="btn-primary w-full">
          占有時間を登録する
        </button>
      </div>

      <div className="card bg-sky-50 border-sky-200 text-sm text-sky-800 space-y-1 mt-4">
        <p className="font-semibold">💡 デモのヒント</p>
        <p>
          ここで登録した時間は <b>MSWの検索結果から自動で除外</b> されます。
          MSW視点で見るには上部の「⇄ 切替」→「MSW」→「予約する」で同じ日時を検索してみてください。
        </p>
      </div>
    </DemoLayout>
  )
}

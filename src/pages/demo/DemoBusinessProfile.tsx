import { useState } from 'react'
import { Link } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import {
  INITIAL_DEMO_VEHICLES,
  DEMO_PRICING,
  type DemoVehicle,
} from './demoData'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

const VEHICLE_EQUIP_FIELDS: { field: keyof DemoVehicle; label: string }[] = [
  { field: 'has_wheelchair',           label: '車椅子対応' },
  { field: 'has_reclining_wheelchair', label: 'リクライニング対応' },
  { field: 'has_stretcher',            label: 'ストレッチャー対応' },
  { field: 'rental_wheelchair',        label: '車椅子貸出' },
  { field: 'rental_reclining_wheelchair', label: 'リクライニング貸出' },
  { field: 'rental_stretcher',         label: 'ストレッチャー貸出' },
]

function fmtYen(n: number) {
  return `¥${n.toLocaleString()}`
}

export default function DemoBusinessProfile() {
  const [name, setName] = useState('せとうち介護タクシー')
  const [address, setAddress] = useState('香川県丸亀市土器町東7丁目1-1')
  const [phone, setPhone] = useState('0877-22-1234')
  const [startHour, setStartHour] = useState('08:00')
  const [endHour, setEndHour] = useState('18:00')
  const [closedDays, setClosedDays] = useState<number[]>([0])
  const [hasFemale, setHasFemale] = useState(true)
  const [longDist, setLongDist] = useState(true)
  const [sameDay, setSameDay] = useState(false)
  const [vehicles, setVehicles] = useState<DemoVehicle[]>(INITIAL_DEMO_VEHICLES)
  const [newVehicleName, setNewVehicleName] = useState('')
  const [saved, setSaved] = useState(true)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const handleSave = () => {
    setSaved(true)
    showToast('設定を保存しました（デモのため実際には保存されません）')
  }

  const toggleDay = (d: number) => {
    setSaved(false)
    setClosedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const handleAddVehicle = () => {
    const n = newVehicleName.trim()
    if (!n) {
      showToast('車両名を入力してください')
      return
    }
    setVehicles(prev => [...prev, {
      id: `demo-vehicle-${Date.now()}`,
      name: n,
      has_wheelchair: true,
      has_reclining_wheelchair: false,
      has_stretcher: false,
      rental_wheelchair: false,
      rental_reclining_wheelchair: false,
      rental_stretcher: false,
      active: true,
    }])
    setNewVehicleName('')
    showToast('車両を追加しました（料金が再計算されます）')
  }

  const handleDeleteVehicle = (id: string) => {
    setVehicles(prev => prev.filter(v => v.id !== id))
    showToast('車両を削除しました（料金が再計算されます）')
  }

  const toggleVehicleField = (id: string, field: keyof DemoVehicle) => {
    setVehicles(prev => prev.map(v => v.id === id ? { ...v, [field]: !v[field] } : v))
  }

  const vehicleCount = vehicles.filter(v => v.active).length
  const addonQty = Math.max(0, vehicleCount - DEMO_PRICING.freeVehicles)
  const monthlyFee = DEMO_PRICING.baseFee + addonQty * DEMO_PRICING.perVehicleFee

  return (
    <DemoLayout role="business">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-1">プロフィール設定</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">MSWの検索・紹介ページに表示される情報を設定します。</p>

      {!saved && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <span className="text-sm text-blue-700 font-medium">未保存の変更があります</span>
          <button onClick={handleSave} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700">
            保存する
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* 基本情報 */}
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-slate-700">基本情報</h2>
          <div>
            <label className="label">事業所名 <span className="text-red-500">*</span></label>
            <input className="input-base" value={name} onChange={e => { setName(e.target.value); setSaved(false) }} />
          </div>
          <div>
            <label className="label">住所</label>
            <input className="input-base" value={address} onChange={e => { setAddress(e.target.value); setSaved(false) }} />
            <p className="text-sm text-slate-500 mt-1">MSWがルート確認・距離計算に使用します</p>
          </div>
          <div>
            <label className="label">電話番号</label>
            <input className="input-base" value={phone} onChange={e => { setPhone(e.target.value); setSaved(false) }} />
            <p className="text-sm text-slate-500 mt-1">急ぎのキャンセル連絡用として表示されます</p>
          </div>
        </div>

        {/* 営業時間 */}
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-slate-700">営業時間</h2>
          <p className="text-sm text-slate-500 leading-relaxed">カレンダーで「＋ 追加」を押したとき、この時間帯で空き枠が自動作成されます</p>
          <div className="flex items-center gap-2">
            <input type="time" className="input-base w-auto" value={startHour} onChange={e => { setStartHour(e.target.value); setSaved(false) }} />
            <span className="text-sm text-slate-500">〜</span>
            <input type="time" className="input-base w-auto" value={endHour} onChange={e => { setEndHour(e.target.value); setSaved(false) }} />
          </div>
          <div>
            <label className="label">定休日</label>
            <p className="text-sm text-slate-500 mb-2">設定した曜日はカレンダー上でグレー表示になります</p>
            <div className="flex gap-1.5 flex-wrap">
              {DAY_LABELS.map((d, i) => (
                <button
                  key={i}
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-lg text-sm font-medium border transition-colors ${
                    closedDays.includes(i)
                      ? 'bg-slate-700 text-white border-slate-700'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300'
                  }`}
                >{d}</button>
              ))}
            </div>
          </div>
        </div>

        {/* 車両管理 */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-bold text-slate-700">車両管理</h2>
            <Link to="/demo/business/billing" className="text-xs text-teal-700 hover:underline">
              💴 料金画面で確認 →
            </Link>
          </div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 text-sm">
            <p className="text-teal-800">
              <span className="font-bold">稼働 {vehicleCount} 台</span>
              　／　無料枠 {DEMO_PRICING.freeVehicles} 台超過分 {addonQty} 台
            </p>
            <p className="text-xs text-teal-700 mt-1">
              現在の月額: <span className="font-bold">{fmtYen(monthlyFee)}</span>
              （基本 {fmtYen(DEMO_PRICING.baseFee)} ＋ 追加 {addonQty}台 × {fmtYen(DEMO_PRICING.perVehicleFee)}）
            </p>
          </div>

          <div className="space-y-2">
            {vehicles.map(v => (
              <div key={v.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <input
                    className="input-base text-sm font-medium flex-1"
                    value={v.name}
                    onChange={e => setVehicles(prev => prev.map(x => x.id === v.id ? { ...x, name: e.target.value } : x))}
                  />
                  <button
                    onClick={() => handleDeleteVehicle(v.id)}
                    className="text-xs text-red-600 hover:bg-red-50 px-2 py-1 rounded"
                  >
                    🗑️ 削除
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {VEHICLE_EQUIP_FIELDS.map(({ field, label }) => (
                    <label key={field} className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(v[field])}
                        onChange={() => toggleVehicleField(v.id, field)}
                        className="w-3.5 h-3.5 accent-teal-600"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              className="input-base flex-1 text-sm"
              placeholder="車両名（例: 4号車）"
              value={newVehicleName}
              onChange={e => setNewVehicleName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddVehicle() }}
            />
            <button onClick={handleAddVehicle} className="btn-primary text-sm whitespace-nowrap">
              ＋ 車両を追加
            </button>
          </div>
        </div>

        {/* 事業所全体の特徴 */}
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-slate-700">事業所の特徴</h2>
          <p className="text-sm text-slate-500 leading-relaxed">MSWが絞り込み条件で使います（車両ごとの設備とは別）</p>
          {[
            ['女性介護者在籍', hasFemale, setHasFemale],
            ['長距離対応', longDist, setLongDist],
            ['当日対応', sameDay, setSameDay],
          ].map(([label, val, setter]) => (
            <label key={label as string} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={val as boolean}
                onChange={e => { (setter as (v: boolean) => void)(e.target.checked); setSaved(false) }}
                className="w-4 h-4 accent-teal-600"
              />
              <span className="text-sm text-slate-700">{label as string}</span>
            </label>
          ))}
        </div>

        <button onClick={handleSave} disabled={saved} className={`w-full font-semibold px-4 py-2.5 rounded-xl transition-colors ${
          !saved ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
        }`}>
          {saved ? '保存済み' : '変更を保存する'}
        </button>
      </div>
    </DemoLayout>
  )
}

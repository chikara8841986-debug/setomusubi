import { useState } from 'react'
import DemoLayout from './DemoLayout'

export default function DemoBusinessProfile() {
  const [name, setName] = useState('せとうち介護タクシー')
  const [address, setAddress] = useState('香川県丸亀市土器町東7丁目1-1')
  const [phone, setPhone] = useState('0877-22-1234')
  const [startHour, setStartHour] = useState('08:00')
  const [endHour, setEndHour] = useState('18:00')
  const [closedDays, setClosedDays] = useState<number[]>([0])
  const [hasWheelchair, setHasWheelchair] = useState(true)
  const [hasReclining, setHasReclining] = useState(true)
  const [hasStretcher, setHasStretcher] = useState(false)
  const [hasFemale, setHasFemale] = useState(true)
  const [longDist, setLongDist] = useState(true)
  const [sameDay, setSameDay] = useState(false)
  const [saved, setSaved] = useState(true)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const handleSave = () => {
    setSaved(true)
    showToast('設定を保存しました（デモのため実際には保存されません）')
  }

  const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
  const toggleDay = (d: number) => {
    setSaved(false)
    setClosedDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  return (
    <DemoLayout role="business">
      <div>
        {toast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg">
            {toast}
          </div>
        )}

        <h1 className="text-xl font-bold text-slate-800 mb-1">プロフィール設定</h1>
        <p className="text-xs text-slate-400 mb-4">MSWの検索・紹介ページに表示される情報を設定します。</p>

        {!saved && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
            <span className="text-sm text-blue-700 font-medium">未保存の変更があります</span>
            <button onClick={handleSave} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 transition-colors">
              保存する
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">基本情報</h2>
            <div>
              <label className="label">事業所名 <span className="text-red-500">*</span></label>
              <input className="input-base" value={name} onChange={e => { setName(e.target.value); setSaved(false) }} />
            </div>
            <div>
              <label className="label">住所</label>
              <input className="input-base" value={address} onChange={e => { setAddress(e.target.value); setSaved(false) }} />
              <p className="text-xs text-slate-400 mt-0.5">MSWがルート確認・距離計算に使用します</p>
            </div>
            <div>
              <label className="label">電話番号</label>
              <input className="input-base" value={phone} onChange={e => { setPhone(e.target.value); setSaved(false) }} />
              <p className="text-xs text-slate-400 mt-0.5">急ぎのキャンセル連絡用として表示されます</p>
            </div>
          </div>

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">営業時間</h2>
            <p className="text-xs text-slate-400">カレンダーで「＋ 追加」を押したとき、この時間帯で空き枠が自動作成されます</p>
            <div className="flex items-center gap-2">
              <input type="time" className="input-base w-auto" value={startHour} onChange={e => { setStartHour(e.target.value); setSaved(false) }} />
              <span className="text-sm text-slate-500">〜</span>
              <input type="time" className="input-base w-auto" value={endHour} onChange={e => { setEndHour(e.target.value); setSaved(false) }} />
            </div>
            <div>
              <label className="label">定休日</label>
              <p className="text-xs text-slate-400 mb-2">設定した曜日はカレンダー上でグレー表示になります</p>
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

          <div className="card space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">車両・機材</h2>
            <p className="text-xs text-slate-400">MSWが「車椅子対応」などの条件で絞り込む際に使われます</p>
            {[
              ['車椅子対応', hasWheelchair, setHasWheelchair],
              ['リクライニング車椅子対応', hasReclining, setHasReclining],
              ['ストレッチャー対応', hasStretcher, setHasStretcher],
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
      </div>
    </DemoLayout>
  )
}

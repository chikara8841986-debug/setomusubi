import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DemoLayout from './DemoLayout'
import { DEMO_BUSINESSES } from './demoData'

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function DemoMswBusinesses() {
  const navigate = useNavigate()
  const [preview, setPreview] = useState<typeof DEMO_BUSINESSES[number] | null>(null)
  const [favorites, setFavorites] = useState<Set<string>>(new Set(['demo-biz-1']))

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <DemoLayout role="msw">
      <div>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-slate-800">事業所一覧</h1>
        </div>
        <p className="text-xs text-slate-400 mb-4">☆ でお気に入り登録できます。事業所名をタップすると詳細を確認できます。</p>

        <div className="space-y-3">
          {DEMO_BUSINESSES.map(biz => {
            const todayDow = new Date().getDay()
            const isClosed = biz.closed_days.includes(todayDow)
            const isFav = favorites.has(biz.id)
            return (
              <div key={biz.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="w-14 h-14 rounded-xl bg-teal-100 flex items-center justify-center text-teal-400 text-xl flex-shrink-0">
                    🚐
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-sm">{biz.name}</h3>
                          {isClosed && (
                            <span className="text-[10px] bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full font-medium">本日定休</span>
                          )}
                        </div>
                        <a href={mapsUrl(biz.address)} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 hover:underline mt-0.5 inline-block">
                          📍 {biz.address}
                        </a>
                        {biz.closed_days.length > 0 && (
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            定休: {biz.closed_days.sort((a,b)=>a-b).map(d=>DAY_LABELS[d]).join('・')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => toggleFav(biz.id)}
                        className={`text-lg flex-shrink-0 transition-colors ${isFav ? 'text-amber-400' : 'text-slate-300 hover:text-amber-300'}`}
                        title={isFav ? 'お気に入り解除' : 'お気に入り登録'}
                      >
                        {isFav ? '⭐' : '☆'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1 mt-2">
                      {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                      {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                      {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                      {biz.rental_wheelchair && <span className="badge-green">車椅子貸出</span>}
                      {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                      {biz.long_distance && <span className="badge-gray">長距離対応</span>}
                      {biz.same_day && <span className="badge-gray">当日対応</span>}
                    </div>

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {biz.cancel_phone && (
                        <a href={`tel:${biz.cancel_phone}`} className="btn-secondary text-xs px-3 py-1.5">
                          📞 {biz.cancel_phone}
                        </a>
                      )}
                      <button onClick={() => setPreview(biz)} className="text-xs text-teal-700 hover:underline">
                        詳細を見る →
                      </button>
                      <button
                        onClick={() => navigate('/demo/msw/search')}
                        className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 transition-colors"
                      >
                        空き枠を検索 →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-800">事業所詳細</h3>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-600 text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="flex items-start gap-3 mb-3">
              <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center text-teal-400 text-2xl flex-shrink-0">🚐</div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800">{preview.name}</p>
                <a href={mapsUrl(preview.address)} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 hover:underline block mt-0.5">
                  📍 {preview.address}
                </a>
                <a href={`tel:${preview.cancel_phone}`} className="text-xs text-teal-700 block mt-0.5">
                  📞 {preview.cancel_phone}
                </a>
                <p className="text-xs text-slate-500 mt-0.5">営業: {preview.business_hours_start?.slice(0,5)}〜{preview.business_hours_end?.slice(0,5)}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {preview.has_wheelchair && <span className="badge-blue">車椅子</span>}
              {preview.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
              {preview.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
              {preview.rental_wheelchair && <span className="badge-green">車椅子貸出</span>}
              {preview.has_female_caregiver && <span className="badge-green">女性介護者</span>}
              {preview.long_distance && <span className="badge-gray">長距離対応</span>}
              {preview.same_day && <span className="badge-gray">当日対応</span>}
            </div>
            {preview.pr_text && (
              <p className="text-sm text-slate-700 whitespace-pre-line mb-3 border-t pt-3">{preview.pr_text}</p>
            )}
            {preview.pricing && (
              <div className="border-t pt-3 text-sm">
                <span className="text-xs text-slate-500">料金: </span>{preview.pricing}
              </div>
            )}
            {preview.qualifications && (
              <div className="border-t mt-2 pt-2 text-sm">
                <span className="text-xs text-slate-500">資格・特徴: </span>{preview.qualifications}
              </div>
            )}
            <div className="mt-4 space-y-2">
              <button
                onClick={() => { setPreview(null); navigate('/demo/msw/search') }}
                className="btn-primary w-full"
              >
                空き枠を検索して申請する →
              </button>
              <button onClick={() => setPreview(null)} className="btn-secondary w-full">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </DemoLayout>
  )
}

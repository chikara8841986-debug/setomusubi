import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Business } from '../../types/database'

type FavoriteEntry = { business_id: string }

const SERVICE_AREAS = [
  '善通寺市', '丸亀市', '坂出市', '宇多津町',
  '多度津町', '琴平町', 'まんのう町', '綾川町',
]

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']
function closedDaysText(days: number[]): string {
  if (!days?.length) return ''
  return '定休: ' + days.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join('・')
}

export default function MswBusinesses() {
  const { hospitalId } = useAuth()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [preview, setPreview] = useState<Business | null>(null)
  const [areaFilter, setAreaFilter] = useState('')
  const [equipFilter, setEquipFilter] = useState<string[]>([])
  const [favOnly, setFavOnly] = useState(false)
  const [nameSearch, setNameSearch] = useState('')

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const loadAll = async () => {
    setLoadError(false)
    const [{ data: bizData, error }, { data: favData }] = await Promise.all([
      supabase.from('businesses').select('*').eq('approved', true).order('name'),
      hospitalId
        ? supabase.from('favorites').select('business_id').eq('hospital_id', hospitalId)
        : Promise.resolve({ data: [] }),
    ])
    if (error) { setLoadError(true); setLoading(false); return }
    setBusinesses(bizData ?? [])
    setFavorites(new Set((favData as FavoriteEntry[] ?? []).map(f => f.business_id)))
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [hospitalId])

  const toggleFavorite = async (businessId: string) => {
    if (!hospitalId) return
    if (favorites.has(businessId)) {
      await supabase.from('favorites').delete()
        .eq('hospital_id', hospitalId).eq('business_id', businessId)
      setFavorites(prev => { const s = new Set(prev); s.delete(businessId); return s })
    } else {
      await supabase.from('favorites').insert({ hospital_id: hospitalId, business_id: businessId })
      setFavorites(prev => new Set([...prev, businessId]))
    }
  }

  const toggleEquip = (key: string) => {
    setEquipFilter(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  const EQUIP_OPTIONS = [
    { key: 'has_wheelchair', label: '車椅子' },
    { key: 'has_reclining_wheelchair', label: 'リクライニング' },
    { key: 'has_stretcher', label: 'ストレッチャー' },
    { key: 'has_female_caregiver', label: '女性介護者' },
    { key: 'long_distance', label: '長距離対応' },
    { key: 'same_day', label: '当日対応' },
  ] as const

  const filtered = businesses
    .filter(biz => {
      if (favOnly && !favorites.has(biz.id)) return false
      if (areaFilter && !biz.service_areas?.includes(areaFilter)) return false
      if (nameSearch && !biz.name.includes(nameSearch)) return false
      for (const key of equipFilter) {
        if (!biz[key as keyof Business]) return false
      }
      return true
    })
    .sort((a, b) => (favorites.has(a.id) ? 0 : 1) - (favorites.has(b.id) ? 0 : 1))

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={loadAll} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">事業所一覧</h1>
      <p className="text-xs text-gray-400 mb-4">承認済みの介護タクシー事業所を検索できます。電話でのご相談にもご利用ください。</p>

      {/* Filters */}
      <div className="card mb-4 space-y-3">
        <div>
          <label className="label">事業所名で検索</label>
          <input
            type="text"
            className="input-base"
            placeholder="事業所名を入力..."
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
          />
        </div>
        <div>
          <label className="label">エリア</label>
          <select className="input-base" value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
            <option value="">すべてのエリア</option>
            {SERVICE_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="label">条件（複数選択可）</label>
          <div className="flex flex-wrap gap-2">
            {EQUIP_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => toggleEquip(key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  equipFilter.includes(key)
                    ? 'bg-teal-600 text-white border-teal-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-teal-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-gray-500">{filtered.length}件</p>
        {favorites.size > 0 && (
          <button
            onClick={() => setFavOnly(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              favOnly
                ? 'bg-amber-500 text-white border-amber-500'
                : 'bg-white text-gray-500 border-gray-300 hover:border-amber-300'
            }`}
          >
            ⭐ お気に入りのみ
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          条件に合う事業所が見つかりませんでした
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(biz => (
            <div key={biz.id} className="card">
              <div className="flex items-start gap-3">
                {biz.profile_image_url ? (
                  <img src={biz.profile_image_url} alt={biz.name}
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-lg">
                    🚐
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-semibold text-gray-900">{biz.name}</h3>
                        {biz.closed_days?.length > 0 && (
                          <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full">
                            {closedDaysText(biz.closed_days)}
                          </span>
                        )}
                      </div>
                      {biz.address && (
                        <a href={mapsUrl(biz.address)} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-teal-700 hover:underline block mt-0.5">
                          📍 {biz.address}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => toggleFavorite(biz.id)}
                      className="text-lg flex-shrink-0"
                      title={favorites.has(biz.id) ? 'お気に入り解除' : 'お気に入り登録'}
                    >
                      {favorites.has(biz.id) ? '⭐' : '☆'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 my-2">
                    {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                    {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                    {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                    {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                    {biz.long_distance && <span className="badge-gray">長距離対応</span>}
                    {biz.same_day && <span className="badge-gray">当日対応</span>}
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {biz.cancel_phone && (
                      <a href={`tel:${biz.cancel_phone}`}
                        className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0">
                        📞 {biz.cancel_phone}
                      </a>
                    )}
                    <button onClick={() => setPreview(biz)}
                      className="text-xs text-teal-700 hover:underline">
                      詳細を見る →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Business detail modal */}
      {preview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[90vh] overflow-y-auto p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">事業所詳細</h3>
              <button onClick={() => setPreview(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            <div className="flex items-start gap-3 mb-3">
              {preview.profile_image_url ? (
                <img src={preview.profile_image_url} alt={preview.name}
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-2xl">🚐</div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{preview.name}</p>
                {preview.address && (
                  <a href={mapsUrl(preview.address)} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-teal-700 hover:underline block mt-0.5">
                    📍 {preview.address}
                  </a>
                )}
                {preview.cancel_phone && (
                  <a href={`tel:${preview.cancel_phone}`} className="text-xs text-teal-700 block mt-0.5">
                    📞 {preview.cancel_phone}
                  </a>
                )}
                {preview.business_hours_start && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    🕐 {preview.business_hours_start.slice(0,5)}〜{preview.business_hours_end?.slice(0,5)}
                  </p>
                )}
                {preview.website_url && (
                  <a href={preview.website_url} target="_blank" rel="noopener noreferrer"
                    className="text-xs text-teal-700 underline block mt-0.5">🔗 ホームページ</a>
                )}
              </div>
            </div>

            {preview.service_areas?.length > 0 && (
              <p className="text-xs text-gray-500 mb-3">
                対応エリア: {preview.service_areas.join('・')}
              </p>
            )}

            <div className="flex flex-wrap gap-1 mb-3">
              {preview.has_wheelchair && <span className="badge-blue">車椅子</span>}
              {preview.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
              {preview.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
              {preview.has_female_caregiver && <span className="badge-green">女性介護者</span>}
              {preview.long_distance && <span className="badge-gray">長距離対応</span>}
              {preview.same_day && <span className="badge-gray">当日対応</span>}
            </div>

            {preview.pr_text && (
              <p className="text-sm text-gray-700 whitespace-pre-line mb-3 border-t pt-3">{preview.pr_text}</p>
            )}

            {preview.vehicle_image_urls?.length > 0 && (
              <div className="grid grid-cols-2 gap-2 mb-3 border-t pt-3">
                {preview.vehicle_image_urls.map(url => (
                  <img key={url} src={url} alt="車両"
                    className="w-full aspect-video object-cover rounded-lg border border-gray-100" />
                ))}
              </div>
            )}

            {preview.pricing && (
              <div className="border-t pt-3 text-sm">
                <span className="text-xs text-gray-500">料金: </span>{preview.pricing}
              </div>
            )}
            {preview.qualifications && (
              <div className="border-t mt-2 pt-2 text-sm">
                <span className="text-xs text-gray-500">資格・特徴: </span>{preview.qualifications}
              </div>
            )}

            <button onClick={() => setPreview(null)} className="btn-secondary w-full mt-4">閉じる</button>
          </div>
        </div>
      )}
    </div>
  )
}

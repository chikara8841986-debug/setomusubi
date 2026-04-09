import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Business } from '../../types/database'

type FavoriteWithBusiness = { id: string; business_id: string; businesses: Business }

const EQUIPMENT_LABELS: Record<string, string> = {
  has_wheelchair: '車椅子',
  has_reclining_wheelchair: 'リクライニング',
  has_stretcher: 'ストレッチャー',
  has_female_caregiver: '女性介護者',
  long_distance: '長距離対応',
  same_day: '当日対応',
}

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function MswFavorites() {
  const { hospitalId } = useAuth()
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState<FavoriteWithBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Business | null>(null)

  const fetchFavorites = async () => {
    if (!hospitalId) return
    const { data } = await supabase
      .from('favorites')
      .select('id, business_id, businesses(*)')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false })
    setFavorites((data as unknown as FavoriteWithBusiness[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchFavorites() }, [hospitalId])

  const handleRemove = async (favoriteId: string, name: string) => {
    if (!confirm(`「${name}」をお気に入りから削除しますか？`)) return
    setRemovingId(favoriteId)
    await supabase.from('favorites').delete().eq('id', favoriteId)
    setFavorites(prev => prev.filter(f => f.id !== favoriteId))
    if (preview && favorites.find(f => f.id === favoriteId)?.businesses.id === preview.id) {
      setPreview(null)
    }
    setRemovingId(null)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">お気に入り事業所</h1>
      <p className="text-xs text-gray-400 mb-5">よく使う事業所を登録しておくと検索結果で目印になります</p>

      {favorites.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-gray-400 text-sm mb-1">お気に入りに登録された事業所がありません</p>
          <p className="text-gray-400 text-xs mb-4">検索結果の ☆ から登録できます</p>
          <button onClick={() => navigate('/msw/search')} className="btn-primary text-sm">
            事業所を検索する
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {favorites.map(({ id, businesses: biz }) => (
            <div key={id} className="card">
              <div className="flex items-start gap-3">
                {/* Profile image */}
                {biz.profile_image_url ? (
                  <img
                    src={biz.profile_image_url}
                    alt={biz.name}
                    className="w-14 h-14 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-400 text-xl">
                    🚐
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-semibold text-gray-900 flex items-center gap-1">
                        <span>⭐</span> {biz.name}
                      </h3>
                      {biz.address && (
                        <a
                          href={mapsUrl(biz.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                        >
                          📍 {biz.address}
                        </a>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(id, biz.name)}
                      disabled={removingId === id}
                      className="text-xs text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors pt-0.5"
                    >
                      {removingId === id ? '...' : '削除'}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {(Object.keys(EQUIPMENT_LABELS) as (keyof Business)[]).map(key =>
                      biz[key] ? (
                        <span key={key} className="badge-blue">{EQUIPMENT_LABELS[key]}</span>
                      ) : null
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {biz.cancel_phone && (
                      <a
                        href={`tel:${biz.cancel_phone}`}
                        className="btn-secondary text-xs px-3 py-1.5"
                      >
                        📞 電話する
                      </a>
                    )}
                    <button
                      onClick={() => setPreview(biz)}
                      className="text-xs text-blue-600 hover:underline"
                    >
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
                <img
                  src={preview.profile_image_url}
                  alt={preview.name}
                  className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100"
                />
              ) : (
                <div className="w-16 h-16 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0 text-blue-400 text-2xl">🚐</div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{preview.name}</p>
                {preview.address && (
                  <a
                    href={mapsUrl(preview.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline block mt-0.5"
                  >
                    📍 {preview.address}
                  </a>
                )}
                {preview.cancel_phone && (
                  <a href={`tel:${preview.cancel_phone}`} className="text-xs text-blue-600 block mt-0.5">
                    📞 {preview.cancel_phone}
                  </a>
                )}
                {preview.website_url && (
                  <a
                    href={preview.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 underline block mt-0.5"
                  >
                    🔗 ホームページ
                  </a>
                )}
              </div>
            </div>

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
                  <img key={url} src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-gray-100" />
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

            <div className="flex gap-2 mt-4">
              <button onClick={() => setPreview(null)} className="btn-secondary flex-1">閉じる</button>
              <button
                onClick={() => { navigate('/msw/search'); setPreview(null) }}
                className="btn-primary flex-1"
              >
                予約を検索する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

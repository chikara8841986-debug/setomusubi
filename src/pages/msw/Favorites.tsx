import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import type { Business } from '../../types/database'

type FavoriteWithBusiness = { id: string; business_id: string; businesses: Business }

export default function MswFavorites() {
  const { hospitalId } = useAuth()
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState<FavoriteWithBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [removingId, setRemovingId] = useState<string | null>(null)

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
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-base">⭐</span>
                    <h3 className="font-semibold text-gray-900">{biz.name}</h3>
                  </div>
                  {biz.address && <p className="text-xs text-gray-500">{biz.address}</p>}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                    {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                    {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                    {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                    {biz.long_distance && <span className="badge-gray">長距離</span>}
                    {biz.same_day && <span className="badge-gray">当日対応</span>}
                  </div>
                  {biz.cancel_phone && (
                    <p className="text-xs text-gray-500 mt-2">
                      📞 <a href={`tel:${biz.cancel_phone}`} className="text-blue-600">{biz.cancel_phone}</a>
                    </p>
                  )}
                  {biz.pricing && <p className="text-xs text-gray-500 mt-1">料金: {biz.pricing}</p>}
                </div>
                <button
                  onClick={() => handleRemove(id, biz.name)}
                  disabled={removingId === id}
                  className="text-xs text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors"
                >
                  {removingId === id ? '...' : '削除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

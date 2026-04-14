import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { jstTodayStr, jstHour, jstDateOffsetStr } from '../../lib/jst'
import type { Business } from '../../types/database'

type FavoriteWithBusiness = { id: string; business_id: string; businesses: Business }

const EQUIPMENT_LABELS: Record<string, string> = {
  has_wheelchair: '車椅子',
  has_reclining_wheelchair: 'リクライニング',
  has_stretcher: 'ストレッチャー',
  rental_wheelchair: '車椅子貸出',
  rental_reclining_wheelchair: 'リクライニング貸出',
  rental_stretcher: 'ストレッチャー貸出',
  has_female_caregiver: '女性介護者',
  long_distance: '長距離対応',
  same_day: '当日対応',
}

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土']

function closedDaysText(days: number[]): string {
  if (!days?.length) return ''
  return '定休: ' + days.sort((a, b) => a - b).map(d => DAY_LABELS[d]).join('・')
}

function mapsUrl(address: string) {
  return `https://maps.google.com/maps?q=${encodeURIComponent(address)}`
}

export default function MswFavorites() {
  const { hospitalId } = useAuth()
  const navigate = useNavigate()
  const [favorites, setFavorites] = useState<FavoriteWithBusiness[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [removeConfirmId, setRemoveConfirmId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Business | null>(null)
  const [availCheck, setAvailCheck] = useState(false)
  const [availDate, setAvailDate] = useState(jstTodayStr)
  const [availStart, setAvailStart] = useState(() => {
    const h = jstHour(); const next = Math.min(h + 1, 23)
    return `${String(next).padStart(2, '0')}:00`
  })
  const [availEnd, setAvailEnd] = useState(() => {
    const h = jstHour(); const next = Math.min(h + 2, 23)
    return `${String(next).padStart(2, '0')}:00`
  })
  const [availMap, setAvailMap] = useState<Record<string, boolean>>({})

  const fetchFavorites = async () => {
    if (!hospitalId) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('favorites')
      .select('id, business_id, businesses(*)')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false })
    if (error) { setLoadError(true); setLoading(false); return }
    setFavorites((data as unknown as FavoriteWithBusiness[]) ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchFavorites() }, [hospitalId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreview(null) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const checkAvailability = async () => {
    const ids = favorites.map(f => f.business_id)
    if (!ids.length) return
    const { data } = await supabase
      .from('availability_slots')
      .select('business_id')
      .in('business_id', ids)
      .eq('date', availDate)
      .eq('is_available', true)
      .lte('start_time', availStart)
      .gte('end_time', availEnd)
    const map: Record<string, boolean> = {}
    for (const row of data ?? []) map[row.business_id] = true
    setAvailMap(map)
  }

  useEffect(() => {
    if (!availCheck) { setAvailMap({}); return }
    checkAvailability()
  }, [availCheck, availDate, availStart, availEnd, favorites.length])

  const handleRemove = async (favoriteId: string) => {
    setRemoveConfirmId(null)
    setRemovingId(favoriteId)
    await supabase.from('favorites').delete().eq('id', favoriteId)
    setFavorites(prev => prev.filter(f => f.id !== favoriteId))
    if (preview && favorites.find(f => f.id === favoriteId)?.businesses.id === preview.id) {
      setPreview(null)
    }
    setRemovingId(null)
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchFavorites} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">お気に入り事業所</h1>
        {favorites.length > 0 && (
          <button
            onClick={() => setAvailCheck(v => !v)}
            className={`text-sm px-3 py-1.5 rounded-lg border font-medium transition-colors ${
              availCheck
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-teal-300'
            }`}
          >
            {availCheck ? '✓ 空き確認中' : '空き確認'}
          </button>
        )}
      </div>
      <p className="text-xs text-gray-400 mb-3">よく使う事業所を登録しておくと検索結果で目印になります</p>

      {availCheck && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              className="input-base w-auto text-sm"
              value={availDate}
              min={jstTodayStr()}
              onChange={e => setAvailDate(e.target.value)}
            />
            <button onClick={() => setAvailDate(jstTodayStr())} className="text-xs px-2 py-1 rounded-lg bg-white border border-teal-300 text-teal-600 hover:bg-teal-50">今日</button>
            <button onClick={() => setAvailDate(jstDateOffsetStr(1))} className="text-xs px-2 py-1 rounded-lg bg-white border border-teal-300 text-teal-600 hover:bg-teal-50">明日</button>
          </div>
          <div className="flex items-center gap-2">
            <input type="time" className="input-base w-auto text-sm" value={availStart} onChange={e => setAvailStart(e.target.value)} />
            <span className="text-sm text-gray-500">〜</span>
            <input type="time" className="input-base w-auto text-sm" value={availEnd} onChange={e => setAvailEnd(e.target.value)} />
          </div>
        </div>
      )}

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
          {[...favorites]
            .sort((a, b) => {
              if (!availCheck) return 0
              const aAvail = availMap[a.business_id] ?? false
              const bAvail = availMap[b.business_id] ?? false
              return bAvail === aAvail ? 0 : bAvail ? 1 : -1
            })
            .map(({ id, business_id, businesses: biz }) => (
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
                  <div className="w-14 h-14 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-xl">
                    🚐
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <h3 className="font-semibold text-gray-900 flex items-center gap-1">
                          <span>⭐</span> {biz.name}
                        </h3>
                        {availCheck && (
                          availMap[business_id]
                            ? <span className="text-[10px] font-bold text-teal-700 bg-teal-50 border border-teal-300 px-1.5 py-0.5 rounded-full">空きあり</span>
                            : <span className="text-[10px] font-bold text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full">空きなし</span>
                        )}
                        {biz.closed_days?.length > 0 && (
                          <span className="text-[10px] text-gray-400 bg-gray-50 border border-gray-200 px-1.5 py-0.5 rounded-full">
                            {closedDaysText(biz.closed_days)}
                          </span>
                        )}
                      </div>
                      {biz.address && (
                        <a
                          href={mapsUrl(biz.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-teal-700 hover:underline mt-0.5 inline-block"
                        >
                          📍 {biz.address}
                        </a>
                      )}
                    </div>
                    {removeConfirmId === id ? (
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => setRemoveConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-600">戻る</button>
                        <button
                          onClick={() => handleRemove(id)}
                          disabled={removingId === id}
                          className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-0.5 rounded-lg font-medium"
                        >{removingId === id ? '...' : '確定'}</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setRemoveConfirmId(id)}
                        disabled={removingId === id}
                        className="text-xs text-gray-300 hover:text-red-400 flex-shrink-0 transition-colors pt-0.5"
                      >
                        {removingId === id ? '...' : '削除'}
                      </button>
                    )}
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
                      className="text-xs text-teal-700 hover:underline"
                    >
                      詳細を見る →
                    </button>
                    {availCheck && availMap[business_id] && (
                      <button
                        onClick={() => navigate('/msw/search', {
                          state: { searchPrefill: { date: availDate, startTime: availStart, endTime: availEnd } }
                        })}
                        className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 transition-colors"
                      >
                        この枠で申請 →
                      </button>
                    )}
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
                <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-2xl">🚐</div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-gray-900">{preview.name}</p>
                {preview.address && (
                  <a
                    href={mapsUrl(preview.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-teal-700 hover:underline block mt-0.5"
                  >
                    📍 {preview.address}
                  </a>
                )}
                {preview.cancel_phone && (
                  <a href={`tel:${preview.cancel_phone}`} className="text-xs text-teal-700 block mt-0.5">
                    📞 {preview.cancel_phone}
                  </a>
                )}
                {preview.website_url && (
                  <a
                    href={preview.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-teal-700 underline block mt-0.5"
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

            <div className="mt-4 space-y-2">
              {availCheck && availMap[preview.id] && (
                <button
                  onClick={() => { setPreview(null); navigate('/msw/search', { state: { searchPrefill: { date: availDate, startTime: availStart, endTime: availEnd } } }) }}
                  className="btn-primary w-full"
                >
                  この枠で申請する →
                </button>
              )}
              <button
                onClick={() => { navigate('/msw/search'); setPreview(null) }}
                className="w-full text-sm border border-teal-300 text-teal-600 bg-teal-50 hover:bg-teal-100 px-4 py-2 rounded-lg font-medium transition-colors"
              >
                申請ページで検索する
              </button>
              <button onClick={() => setPreview(null)} className="btn-secondary w-full">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

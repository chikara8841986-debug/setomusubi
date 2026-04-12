import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Business } from '../../types/database'

type IntroFields = Pick<Business,
  'name' | 'address' | 'cancel_phone' | 'website_url' |
  'profile_image_url' | 'vehicle_image_urls' | 'pr_text' |
  'qualifications' | 'pricing' | 'has_wheelchair' |
  'has_reclining_wheelchair' | 'has_stretcher' | 'has_female_caregiver' |
  'long_distance' | 'same_day'
>

const EQUIPMENT_LABELS: Record<string, string> = {
  has_wheelchair: '車椅子対応',
  has_reclining_wheelchair: 'リクライニング対応',
  has_stretcher: 'ストレッチャー対応',
  has_female_caregiver: '女性介護者在籍',
  long_distance: '長距離対応',
  same_day: '当日対応',
}

export default function BusinessIntroduction() {
  const { businessId, user } = useAuth()
  const { showToast } = useToast()
  const [data, setData] = useState<IntroFields | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [prText, setPrText] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [vehicleImageUrls, setVehicleImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const profileInputRef = useRef<HTMLInputElement>(null)
  const vehicleInputRef = useRef<HTMLInputElement>(null)

  const fetchData = async () => {
    if (!businessId) return
    setLoadError(false)
    const { data: biz, error } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    if (error) { setLoadError(true); return }
    if (!biz) return
    const b = biz as IntroFields
    setData(b)
    setWebsiteUrl(b.website_url ?? '')
    setPrText(b.pr_text ?? '')
    setProfileImageUrl(b.profile_image_url ?? '')
    setVehicleImageUrls(b.vehicle_image_urls ?? [])
  }

  useEffect(() => { fetchData() }, [businessId])

  const uploadImage = async (file: File, path: string): Promise<string | null> => {
    const { error } = await supabase.storage
      .from('business-images')
      .upload(path, file, { upsert: true })
    if (error) { console.error(error); return null }
    const { data: urlData } = supabase.storage.from('business-images').getPublicUrl(path)
    return urlData.publicUrl
  }

  const handleProfileImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    const url = await uploadImage(file, `${user.id}/profile_${Date.now()}`)
    if (url) setProfileImageUrl(url)
    setUploading(false)
  }

  const handleVehicleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (!files.length || !user) return
    setUploading(true)
    const urls: string[] = []
    for (const file of files) {
      const url = await uploadImage(file, `${user.id}/vehicle_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      if (url) urls.push(url)
    }
    setVehicleImageUrls(prev => [...prev, ...urls])
    setUploading(false)
    e.target.value = ''
  }

  const removeVehicleImage = async (url: string) => {
    // Extract path from URL for deletion
    const path = url.split('/business-images/')[1]
    if (path) await supabase.storage.from('business-images').remove([path])
    setVehicleImageUrls(prev => prev.filter(u => u !== url))
  }

  const handleSave = async () => {
    if (!businessId) return
    setSaving(true)
    await supabase.from('businesses').update({
      website_url: websiteUrl.trim() || null,
      pr_text: prText.trim() || null,
      profile_image_url: profileImageUrl || null,
      vehicle_image_urls: vehicleImageUrls,
    }).eq('id', businessId)
    setSaving(false)
    showToast('紹介ページを保存しました')
  }

  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchData} className="btn-secondary text-sm">再試行</button>
    </div>
  )
  if (!data) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  const features = Object.entries(EQUIPMENT_LABELS).filter(([key]) => data[key as keyof IntroFields])

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">事業所紹介ページ</h1>
      <p className="text-xs text-gray-400 mb-5">MSWが事業所を選ぶ際に参照する紹介ページを設定します</p>

      {/* Preview section */}
      <div className="card mb-5 border-teal-100">
        <p className="text-xs font-semibold text-teal-600 mb-3 uppercase tracking-wide">プレビュー（MSWに見える画面）</p>

        <div className="flex items-start gap-3 mb-3">
          {profileImageUrl ? (
            <img src={profileImageUrl} alt="事業所" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-gray-100" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-2xl">🚐</div>
          )}
          <div>
            <h2 className="font-bold text-gray-900 text-base">{data.name}</h2>
            {data.address && (
              <a
                href={`https://maps.google.com/maps?q=${encodeURIComponent(data.address)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-teal-700 hover:underline block mt-0.5"
              >
                📍 {data.address}
              </a>
            )}
            {data.cancel_phone && (
              <p className="text-xs text-gray-600 mt-0.5">📞 {data.cancel_phone}</p>
            )}
            {websiteUrl && (
              <a href={websiteUrl} target="_blank" rel="noopener noreferrer"
                className="text-xs text-teal-700 underline mt-0.5 inline-block">🔗 ホームページ</a>
            )}
          </div>
        </div>

        {features.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {features.map(([key, label]) => (
              <span key={key} className="badge-blue">{label}</span>
            ))}
          </div>
        )}

        {prText && (
          <p className="text-sm text-gray-700 whitespace-pre-line mb-3 border-t pt-3">{prText}</p>
        )}

        {vehicleImageUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2 border-t pt-3">
            {vehicleImageUrls.map(url => (
              <img key={url} src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-gray-100" />
            ))}
          </div>
        )}

        {data.pricing && (
          <div className="border-t mt-3 pt-3">
            <p className="text-xs text-gray-500 font-medium">料金</p>
            <p className="text-sm text-gray-700">{data.pricing}</p>
          </div>
        )}
        {data.qualifications && (
          <div className="border-t mt-2 pt-2">
            <p className="text-xs text-gray-500 font-medium">資格・特徴</p>
            <p className="text-sm text-gray-700">{data.qualifications}</p>
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="card space-y-5">
        <h2 className="text-sm font-semibold text-gray-700">紹介内容を編集</h2>

        {/* Profile image */}
        <div>
          <label className="label">代表写真（スタッフ・外観など）</label>
          <div className="flex items-center gap-3">
            {profileImageUrl ? (
              <div className="relative">
                <img src={profileImageUrl} alt="プロフィール" className="w-20 h-20 rounded-xl object-cover border border-gray-200" />
                <button
                  onClick={() => setProfileImageUrl('')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                >×</button>
              </div>
            ) : (
              <div className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs text-center cursor-pointer hover:border-teal-300 transition-colors"
                onClick={() => profileInputRef.current?.click()}>
                写真を<br />追加
              </div>
            )}
            <div>
              <button onClick={() => profileInputRef.current?.click()}
                className="btn-secondary text-sm" disabled={uploading}>
                {uploading ? 'アップロード中...' : '画像を選択'}
              </button>
              <p className="text-xs text-gray-400 mt-1">JPG / PNG / WebP</p>
            </div>
          </div>
          <input ref={profileInputRef} type="file" accept="image/*" className="hidden"
            onChange={handleProfileImageChange} />
        </div>

        {/* Vehicle images */}
        <div>
          <label className="label">車両・設備の写真（複数可）</label>
          <div className="grid grid-cols-3 gap-2 mb-2">
            {vehicleImageUrls.map(url => (
              <div key={url} className="relative">
                <img src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-gray-200" />
                <button
                  onClick={() => removeVehicleImage(url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                >×</button>
              </div>
            ))}
            <button
              onClick={() => vehicleInputRef.current?.click()}
              disabled={uploading || vehicleImageUrls.length >= 6}
              className="aspect-video rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-xs hover:border-teal-300 transition-colors disabled:opacity-40"
            >
              ＋ 追加
            </button>
          </div>
          <p className="text-xs text-gray-400">最大6枚</p>
          <input ref={vehicleInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={handleVehicleImageChange} />
        </div>

        {/* PR text */}
        <div>
          <label className="label">PR文・自己紹介</label>
          <textarea
            className="input-base resize-none"
            rows={5}
            value={prText}
            onChange={e => setPrText(e.target.value)}
            placeholder={`例）\n当社は創業15年の地域密着型の介護タクシーです。\nスタッフ全員が介護福祉士の資格を持ち、安心してご利用いただけます。\n車椅子・ストレッチャー・リクライニング対応の車両を完備しています。`}
          />
          <p className="text-xs text-gray-400 mt-1">{prText.length} 文字</p>
        </div>

        {/* Website URL */}
        <div>
          <label className="label">ホームページURL（任意）</label>
          <input
            type="url"
            className="input-base"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            placeholder="https://example.com"
          />
        </div>

        <button onClick={handleSave} disabled={saving || uploading} className="btn-primary w-full">
          {saving ? '保存中...' : '保存する'}
        </button>

        <p className="text-xs text-gray-400 text-center">
          ※ 料金・資格情報は「プロフィール」ページで編集できます
        </p>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Business } from '../../types/database'

type IntroFields = Pick<Business,
  'name' | 'address' | 'cancel_phone' | 'website_url' |
  'profile_image_url' | 'vehicle_image_urls' | 'pr_text' |
  'qualifications' | 'pricing' | 'has_wheelchair' |
  'has_reclining_wheelchair' | 'has_stretcher' |
  'rental_wheelchair' | 'rental_reclining_wheelchair' | 'rental_stretcher' |
  'has_female_caregiver' | 'long_distance' | 'same_day'
>

const EQUIPMENT_LABELS: Record<string, string> = {
  has_wheelchair: '車椅子対応',
  has_reclining_wheelchair: 'リクライニング対応',
  has_stretcher: 'ストレッチャー対応',
  rental_wheelchair: '車椅子貸出',
  rental_reclining_wheelchair: 'リクライニング貸出',
  rental_stretcher: 'ストレッチャー貸出',
  has_female_caregiver: '女性介護者在籍',
  long_distance: '長距離対応',
  same_day: '当日対応',
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const MAX_IMAGE_SIZE = 10 * 1024 * 1024 // 10MB

function validateImageFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return 'JPG・PNG・WebP・GIF形式の画像を選択してください'
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return 'ファイルサイズが大きすぎます（10MB以下の画像を選択してください）'
  }
  return null
}

export default function BusinessIntroduction() {
  const { businessId, user } = useAuth()
  const { showToast } = useToast()
  const [data, setData] = useState<IntroFields | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [prText, setPrText] = useState('')
  const [profileImageUrl, setProfileImageUrl] = useState('')
  const [vehicleImageUrls, setVehicleImageUrls] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [deleteConfirmUrl, setDeleteConfirmUrl] = useState<string | null>(null)
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
    setSavedSnapshot(JSON.stringify({
      website_url: b.website_url ?? '',
      pr_text: b.pr_text ?? '',
      profile_image_url: b.profile_image_url ?? '',
      vehicle_image_urls: b.vehicle_image_urls ?? [],
    }))
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
    const validationError = validateImageFile(file)
    if (validationError) {
      showToast(validationError, 'error')
      e.target.value = ''
      return
    }
    setUploading(true)
    const url = await uploadImage(file, `${user.id}/profile_${Date.now()}`)
    if (url) {
      setProfileImageUrl(url)
    } else {
      showToast('写真のアップロードに失敗しました。再度お試しください。', 'error')
    }
    setUploading(false)
    e.target.value = ''
  }

  const handleVehicleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? [])
    if (!rawFiles.length || !user) return
    // ファイル検証
    const invalidFiles = rawFiles.filter(f => validateImageFile(f) !== null)
    if (invalidFiles.length > 0) {
      showToast(`${invalidFiles.length}枚のファイルが無効です（JPG/PNG/WebP/GIF、10MB以下）`, 'error')
      e.target.value = ''
      return
    }
    const files = rawFiles
    setUploading(true)
    setUploadingCount(files.length)
    const urls: string[] = []
    let failCount = 0
    for (const file of files) {
      const url = await uploadImage(file, `${user.id}/vehicle_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      if (url) urls.push(url)
      else failCount++
    }
    setVehicleImageUrls(prev => [...prev, ...urls])
    setUploading(false)
    setUploadingCount(0)
    e.target.value = ''
    if (failCount > 0) {
      showToast(`${failCount}枚のアップロードに失敗しました。再度お試しください。`, 'error')
    }
  }

  const removeVehicleImage = async (url: string) => {
    if (!businessId) return
    setDeleteConfirmUrl(null)
    const newUrls = vehicleImageUrls.filter(u => u !== url)
    // DB更新を先に行い、成功確認後にストレージ削除・状態更新する
    const { error } = await supabase.from('businesses').update({ vehicle_image_urls: newUrls }).eq('id', businessId)
    if (error) {
      showToast('削除に失敗しました。再試行してください。', 'error')
      return
    }
    // ストレージ削除（ベストエフォート：失敗してもUIに影響しない）
    const path = url.split('/business-images/')[1]
    if (path) supabase.storage.from('business-images').remove([path]).catch(() => {})
    setVehicleImageUrls(newUrls)
    setSavedSnapshot(prev => {
      const snap = JSON.parse(prev || '{}')
      return JSON.stringify({ ...snap, vehicle_image_urls: newUrls })
    })
    showToast('車両写真を削除しました', 'error')
  }

  const handleSave = async () => {
    if (!businessId) return

    // URLバリデーション（httpsのみ許可）
    const trimmedUrl = websiteUrl.trim()
    if (trimmedUrl) {
      try {
        const parsed = new URL(trimmedUrl)
        if (parsed.protocol !== 'https:') {
          showToast('URLはhttps://で始まるものを入力してください', 'error')
          return
        }
      } catch {
        showToast('ウェブサイトURLの形式が正しくありません（例: https://example.com）', 'error')
        return
      }
    }

    setSaving(true)
    const { error } = await supabase.from('businesses').update({
      website_url: trimmedUrl || null,
      pr_text: prText.trim() || null,
      profile_image_url: profileImageUrl || null,
      vehicle_image_urls: vehicleImageUrls,
    }).eq('id', businessId)

    if (error) {
      showToast('保存に失敗しました', 'error')
      setSaving(false)
      return
    }
    setSavedSnapshot(JSON.stringify({
      website_url: trimmedUrl,
      pr_text: prText.trim() || '',
      profile_image_url: profileImageUrl || '',
      vehicle_image_urls: vehicleImageUrls,
    }))
    setSaving(false)
    showToast('紹介ページを保存しました')
  }

  const currentSnapshot = JSON.stringify({
    website_url: websiteUrl,
    pr_text: prText,
    profile_image_url: profileImageUrl,
    vehicle_image_urls: vehicleImageUrls,
  })
  const isDirty = savedSnapshot !== '' && currentSnapshot !== savedSnapshot

  if (loadError) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-2">😵</div><p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchData} className="btn-secondary text-sm">再試行</button>
    </div>
  )
  if (!data) return <div className="flex flex-col items-center justify-center py-16 gap-3"><span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p></div>

  const features = Object.entries(EQUIPMENT_LABELS).filter(([key]) => data[key as keyof IntroFields])

  // Completeness check
  const checks = [
    { done: !!profileImageUrl, label: '代表写真' },
    { done: vehicleImageUrls.length > 0, label: '車両写真' },
    { done: prText.length >= 20, label: 'PR文（20文字以上）' },
    { done: !!websiteUrl, label: 'ホームページURL' },
  ]
  const completedCount = checks.filter(c => c.done).length

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800 mb-1">事業所紹介ページ</h1>
      <p className="text-xs text-slate-400 mb-3">MSWが事業所を選ぶ際に参照する紹介ページを設定します</p>

      {isDirty && (
        <div className="mb-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <span className="text-sm text-blue-700 font-medium">未保存の変更があります</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || uploading}
              className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              type="button"
              onClick={() => {
                const snap = JSON.parse(savedSnapshot)
                setWebsiteUrl(snap.website_url ?? '')
                setPrText(snap.pr_text ?? '')
                setProfileImageUrl(snap.profile_image_url ?? '')
                setVehicleImageUrls(snap.vehicle_image_urls ?? [])
              }}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >元に戻す</button>
          </div>
        </div>
      )}

      {/* Completeness indicator */}
      {completedCount < checks.length && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium text-amber-800">紹介ページの充実度</p>
            <p className="text-xs font-bold text-amber-700">{completedCount}/{checks.length}</p>
          </div>
          <div className="w-full h-1.5 bg-amber-200 rounded-full overflow-hidden mb-2">
            <div className="h-1.5 bg-amber-500 rounded-full transition-all" style={{ width: `${(completedCount / checks.length) * 100}%` }} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {checks.filter(c => !c.done).map(c => (
              <span key={c.label} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{c.label}</span>
            ))}
          </div>
        </div>
      )}
      {completedCount === checks.length && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 text-xs text-teal-700 font-medium">
          ✓ 紹介ページが充実しています！
          <span className="block font-normal text-teal-600 mt-0.5">
            <Link to="/business/calendar" className="underline hover:text-teal-800">カレンダー</Link>に空き枠を追加するとMSWの検索に表示されます
          </span>
        </div>
      )}

      {/* Preview section */}
      <div className="card mb-5 border-teal-100">
        <p className="text-xs font-semibold text-teal-600 mb-3 uppercase tracking-wide">プレビュー（MSWに見える画面）</p>

        <div className="flex items-start gap-3 mb-3">
          {profileImageUrl ? (
            <img src={profileImageUrl} alt="事業所" className="w-16 h-16 rounded-xl object-cover flex-shrink-0 border border-slate-100" />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0 text-teal-400 text-2xl">🚐</div>
          )}
          <div>
            <h2 className="font-bold text-slate-800 text-base">{data.name}</h2>
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
              <p className="text-xs text-slate-600 mt-0.5">📞 {data.cancel_phone}</p>
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
          <p className="text-sm text-slate-700 whitespace-pre-line mb-3 border-t pt-3">{prText}</p>
        )}

        {vehicleImageUrls.length > 0 && (
          <div className="grid grid-cols-3 gap-2 border-t pt-3">
            {vehicleImageUrls.map(url => (
              <img key={url} src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-slate-100" />
            ))}
          </div>
        )}

        {data.pricing && (
          <div className="border-t mt-3 pt-3">
            <p className="text-xs text-slate-500 font-medium">料金</p>
            <p className="text-sm text-slate-700">{data.pricing}</p>
          </div>
        )}
        {data.qualifications && (
          <div className="border-t mt-2 pt-2">
            <p className="text-xs text-slate-500 font-medium">資格・特徴</p>
            <p className="text-sm text-slate-700">{data.qualifications}</p>
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="card space-y-5">
        <h2 className="text-sm font-semibold text-slate-700">紹介内容を編集</h2>

        {/* Profile image */}
        <div>
          <label className="label">代表写真（スタッフ・外観など）</label>
          <div className="flex items-center gap-3">
            {profileImageUrl ? (
              <div className="relative">
                <img src={profileImageUrl} alt="プロフィール" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                <button
                  onClick={() => setProfileImageUrl('')}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center" aria-label="閉じる"
                >×</button>
              </div>
            ) : (
              <div className={`w-20 h-20 rounded-xl border-2 border-dashed flex items-center justify-center text-xs text-center transition-colors ${
                uploading ? 'border-teal-300 bg-teal-50 text-teal-500 cursor-wait' : 'border-slate-200 text-slate-400 cursor-pointer hover:border-teal-300'
              }`}
                onClick={() => !uploading && profileInputRef.current?.click()}>
                {uploading ? '送信中…' : <span>写真を<br />追加</span>}
              </div>
            )}
            <div>
              <button onClick={() => profileInputRef.current?.click()}
                className="btn-secondary text-sm" disabled={uploading}>
                {uploading ? 'アップロード中...' : '画像を選択'}
              </button>
              <p className="text-xs text-slate-400 mt-1">JPG / PNG / WebP</p>
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
                <img src={url} alt="車両" className="w-full aspect-video object-cover rounded-lg border border-slate-200" />
                {deleteConfirmUrl === url ? (
                  <div className="absolute inset-0 bg-black/60 rounded-lg flex flex-col items-center justify-center gap-1.5 p-1">
                    <p className="text-white text-[10px] font-medium text-center">削除しますか？</p>
                    <div className="flex gap-1">
                      <button onClick={() => setDeleteConfirmUrl(null)}
                        className="text-[10px] bg-white/20 text-white px-2 py-0.5 rounded-md hover:bg-white/30">
                        戻る
                      </button>
                      <button onClick={() => removeVehicleImage(url)}
                        className="text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-md hover:bg-red-600 font-medium">
                        削除
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirmUrl(url)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-600"
                    aria-label="車両写真を削除"
                  >×</button>
                )}
              </div>
            ))}
            {vehicleImageUrls.length < 6 && (
              <button
                onClick={() => vehicleInputRef.current?.click()}
                disabled={uploading}
                className={`aspect-video rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs transition-colors ${
                  uploading ? 'border-teal-300 bg-teal-50 text-teal-500 cursor-wait' : 'border-slate-200 text-slate-400 hover:border-teal-300'
                }`}
              >
                {uploading ? (
                  <>
                    <span className="spinner" style={{ width: '16px', height: '16px' }} />
                    <span>{uploadingCount > 1 ? `${uploadingCount}枚 送信中` : '送信中…'}</span>
                  </>
                ) : '＋ 追加'}
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">
            {vehicleImageUrls.length > 0
              ? `${vehicleImageUrls.length}/6枚${vehicleImageUrls.length >= 6 ? '（上限）' : ''}`
              : '最大6枚'}
          </p>
          <input ref={vehicleInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={handleVehicleImageChange} />
        </div>

        {/* PR text */}
        <div>
          <label className="label">PR文・自己紹介</label>
          <textarea
            className="input-base resize-none"
            rows={5}
            maxLength={3000}
            value={prText}
            onChange={e => setPrText(e.target.value)}
            placeholder={`例）\n当社は創業15年の地域密着型の介護タクシーです。\nスタッフ全員が介護福祉士の資格を持ち、安心してご利用いただけます。\n車椅子・ストレッチャー・リクライニング対応の車両を完備しています。`}
          />
          <p className={`text-xs mt-1 ${prText.length === 0 ? 'text-slate-400' : prText.length < 20 ? 'text-amber-500 font-medium' : 'text-teal-600'}`}>
            {prText.length} 文字{prText.length > 0 && prText.length < 20 ? `（あと${20 - prText.length}文字で充実度アップ）` : prText.length >= 20 ? ' ✓' : ''}
          </p>
        </div>

        {/* Website URL */}
        <div>
          <label className="label">ホームページURL（任意）</label>
          <input
            type="url"
            className="input-base"
            value={websiteUrl}
            onChange={e => setWebsiteUrl(e.target.value)}
            maxLength={500}
            placeholder="https://example.com"
          />
        </div>

        <button onClick={handleSave} disabled={saving || uploading || !isDirty}
          className={`w-full font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
            isDirty ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}>
          {saving ? '保存中...' : isDirty ? '変更を保存する' : '保存済み'}
        </button>

        <p className="text-xs text-slate-400 text-center">
          ※ 料金・資格情報は{' '}
          <Link to="/business/profile" className="text-teal-600 hover:underline">プロフィール</Link>
          {' '}ページで編集できます
        </p>
      </div>
    </div>
  )
}



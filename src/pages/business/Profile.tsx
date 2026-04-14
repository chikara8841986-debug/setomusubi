import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Business } from '../../types/database'

const SERVICE_AREAS = [
  '善通寺市', '丸亀市', '坂出市', '宇多津町',
  '多度津町', '琴平町', 'まんのう町', '綾川町'
]

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function BusinessProfile() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')

  const [form, setForm] = useState<Partial<Business>>({
    name: '',
    address: '',
    phone: '',
    service_areas: [],
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    closed_days: [],
    has_wheelchair: false,
    has_reclining_wheelchair: false,
    has_stretcher: false,
    rental_wheelchair: false,
    rental_reclining_wheelchair: false,
    rental_stretcher: false,
    has_female_caregiver: false,
    long_distance: false,
    same_day: false,
    qualifications: '',
    pricing: '',
    cancel_phone: '',
    website_url: '',
    pr_text: '',
  })

  const fetchProfile = async () => {
    if (!user) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (error && error.code !== 'PGRST116') { setLoadError(true); setLoading(false); return }
    if (data) { setForm(data); setSavedSnapshot(JSON.stringify(data)) }
    setLoading(false)
  }

  useEffect(() => { fetchProfile() }, [user])

  const toggleArea = (area: string) => {
    setForm(f => ({
      ...f,
      service_areas: f.service_areas?.includes(area)
        ? f.service_areas.filter(a => a !== area)
        : [...(f.service_areas ?? []), area]
    }))
  }

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      closed_days: f.closed_days?.includes(day)
        ? f.closed_days.filter(d => d !== day)
        : [...(f.closed_days ?? []), day]
    }))
  }

  const toggleBool = (key: keyof Business) => {
    setForm(f => ({ ...f, [key]: !f[key] }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    const { error: err } = await supabase
      .from('businesses')
      .update({
        name: form.name,
        address: form.address,
        phone: form.phone,
        service_areas: form.service_areas,
        business_hours_start: form.business_hours_start,
        business_hours_end: form.business_hours_end,
        closed_days: form.closed_days,
        has_wheelchair: form.has_wheelchair,
        has_reclining_wheelchair: form.has_reclining_wheelchair,
        has_stretcher: form.has_stretcher,
        rental_wheelchair: form.rental_wheelchair,
        rental_reclining_wheelchair: form.rental_reclining_wheelchair,
        rental_stretcher: form.rental_stretcher,
        has_female_caregiver: form.has_female_caregiver,
        long_distance: form.long_distance,
        same_day: form.same_day,
        qualifications: form.qualifications,
        pricing: form.pricing,
        cancel_phone: form.cancel_phone,
        website_url: form.website_url?.trim() || null,
        pr_text: form.pr_text?.trim() || null,
      })
      .eq('user_id', user.id)

    setSaving(false)
    if (err) {
      showToast('保存に失敗しました', 'error')
    } else {
      setSavedSnapshot(JSON.stringify(form))
      showToast('プロフィールを保存しました')
    }
  }

  const isDirty = JSON.stringify(form) !== savedSnapshot

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchProfile} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  const BoolRow = ({ label, field }: { label: string; field: keyof Business }) => (
    <label className="flex items-center justify-between py-2.5 border-b border-gray-100 cursor-pointer">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        onClick={() => toggleBool(field)}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
          form[field] ? 'bg-teal-500' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
          form[field] ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
    </label>
  )

  const missingFields = [
    !form.cancel_phone && 'キャンセル連絡先',
    (!form.service_areas || form.service_areas.length === 0) && '対応エリア',
    !form.phone && '電話番号',
  ].filter(Boolean) as string[]

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">プロフィール設定</h1>

      {isDirty && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between">
          <p className="text-xs font-medium text-blue-700">未保存の変更があります</p>
          <button
            type="button"
            onClick={() => {
              const snap = JSON.parse(savedSnapshot || '{}')
              setForm(snap)
            }}
            className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
          >元に戻す</button>
        </div>
      )}

      {missingFields.length > 0 && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-medium text-amber-800 mb-1.5">⚠️ 以下を設定するとMSWの検索に表示されます</p>
          <div className="flex flex-wrap gap-1.5">
            {missingFields.map(f => (
              <span key={f} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Basic info */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">基本情報</h2>
          <div>
            <label className="label">事業所名 <span className="text-red-500">*</span></label>
            <input className="input-base" value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          </div>
          <div>
            <label className="label">所在地</label>
            <input className="input-base" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="香川県丸亀市〇〇町1-2-3" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">電話番号</label>
              <input className="input-base" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="0877-00-0000" />
            </div>
            <div>
              <label className="label">キャンセル連絡先</label>
              <input className="input-base" value={form.cancel_phone ?? ''} onChange={e => setForm(f => ({ ...f, cancel_phone: e.target.value }))} placeholder="0877-00-0000" />
            </div>
          </div>
        </div>

        {/* Service hours */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">営業時間・定休日</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">開始時間</label>
              <input type="time" className="input-base" value={form.business_hours_start ?? ''} onChange={e => setForm(f => ({ ...f, business_hours_start: e.target.value }))} />
            </div>
            <div>
              <label className="label">終了時間</label>
              <input type="time" className="input-base" value={form.business_hours_end ?? ''} onChange={e => setForm(f => ({ ...f, business_hours_end: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">定休日</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((d, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-9 h-9 rounded-full text-sm font-medium border transition-colors ${
                    form.closed_days?.includes(i)
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Service areas */}
        <div className="card space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-semibold text-gray-700">対応エリア</h2>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm(f => ({ ...f, service_areas: [...SERVICE_AREAS] }))}
                className="text-xs text-teal-600 hover:underline">全選択</button>
              <button type="button" onClick={() => setForm(f => ({ ...f, service_areas: [] }))}
                className="text-xs text-gray-400 hover:underline">全解除</button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_AREAS.map(area => (
              <label key={area} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.service_areas?.includes(area) ?? false}
                  onChange={() => toggleArea(area)}
                  className="w-4 h-4 rounded border-gray-300 text-teal-600"
                />
                <span className="text-sm text-gray-700">{area}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Equipment */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-1">車両・機材</h2>
          <BoolRow label="車椅子対応" field="has_wheelchair" />
          <BoolRow label="リクライニング車椅子対応" field="has_reclining_wheelchair" />
          <BoolRow label="ストレッチャー対応" field="has_stretcher" />
          <BoolRow label="車椅子貸出" field="rental_wheelchair" />
          <BoolRow label="リクライニング車椅子貸出" field="rental_reclining_wheelchair" />
          <BoolRow label="ストレッチャー貸出" field="rental_stretcher" />
        </div>

        {/* Options */}
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2 mb-1">その他の対応</h2>
          <BoolRow label="女性介護者在籍" field="has_female_caregiver" />
          <BoolRow label="長距離・県外対応" field="long_distance" />
          <BoolRow label="当日対応" field="same_day" />
        </div>

        {/* Free text */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">資格・料金・特徴</h2>
          <div>
            <label className="label">資格・特徴</label>
            <textarea
              className="input-base resize-none"
              rows={3}
              value={form.qualifications ?? ''}
              onChange={e => setForm(f => ({ ...f, qualifications: e.target.value }))}
              placeholder="介護士資格保有・酸素吸入対応可 など"
            />
          </div>
          <div>
            <label className="label">料金体系</label>
            <textarea
              className="input-base resize-none"
              rows={3}
              value={form.pricing ?? ''}
              onChange={e => setForm(f => ({ ...f, pricing: e.target.value }))}
              placeholder="基本料金〇〇円＋距離料金〇〇円/km など"
            />
          </div>
        </div>

        {/* PR / Web */}
        <div className="card space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 border-b pb-2">PR・ウェブサイト</h2>
          <div>
            <label className="label">PRテキスト</label>
            <p className="text-xs text-gray-400 mb-1">MSWの事業所一覧・詳細ページに表示されます</p>
            <textarea
              className="input-base resize-none"
              rows={4}
              value={form.pr_text ?? ''}
              onChange={e => setForm(f => ({ ...f, pr_text: e.target.value }))}
              placeholder="当社の特徴・強み・利用者へのメッセージなど"
            />
          </div>
          <div>
            <label className="label">ホームページURL</label>
            <input
              type="url"
              className="input-base"
              value={form.website_url ?? ''}
              onChange={e => setForm(f => ({ ...f, website_url: e.target.value }))}
              placeholder="https://example.com"
            />
          </div>
        </div>

        <button type="submit" className={`w-full font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
          isDirty
            ? 'bg-teal-600 text-white hover:bg-teal-700'
            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
        }`} disabled={saving || !isDirty}>
          {saving ? '保存中...' : isDirty ? '変更を保存する' : '保存済み'}
        </button>
      </form>
    </div>
  )
}

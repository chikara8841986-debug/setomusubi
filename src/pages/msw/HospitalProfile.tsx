import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'

export default function HospitalProfile() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  const snapshot = () => JSON.stringify({ name, address, phone })
  const isDirty = snapshot() !== savedSnapshot

  const fetchProfile = async () => {
    if (!user) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('hospitals')
      .select('*')
      .eq('user_id', user.id)
      .single()
    if (error && error.code !== 'PGRST116') { setLoadError(true); setLoading(false); return }
    if (data) {
      setName(data.name)
      setAddress(data.address ?? '')
      setPhone(data.phone ?? '')
      setSavedSnapshot(JSON.stringify({ name: data.name, address: data.address ?? '', phone: data.phone ?? '' }))
    }
    setLoading(false)
  }

  useEffect(() => { fetchProfile() }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)

    const { error } = await supabase
      .from('hospitals')
      .update({ name: name.trim(), address: address.trim() || null, phone: phone.trim() || null })
      .eq('user_id', user.id)

    setSaving(false)
    if (error) {
      showToast('保存に失敗しました', 'error')
    } else {
      setSavedSnapshot(snapshot())
      showToast('病院情報を保存しました')
    }
  }

  const handleReset = () => {
    if (!savedSnapshot) return
    const s = JSON.parse(savedSnapshot)
    setName(s.name)
    setAddress(s.address)
    setPhone(s.phone)
  }

  if (loading) return <div className="flex flex-col items-center justify-center py-16 gap-3"><span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p></div>
  if (loadError) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-2">😵</div><p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchProfile} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-slate-800 mb-1">病院情報</h1>
      <p className="text-xs text-slate-400 mb-4">仮予約を申請すると、ここで入力した情報が事業所へ通知されます。正確に入力してください。</p>

      {isDirty ? (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <span className="text-sm text-blue-700 font-medium">未保存の変更があります</span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="submit"
              form="hospital-profile-form"
              disabled={saving}
              className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? '保存中...' : '保存する'}
            </button>
            {savedSnapshot && (
              <button onClick={handleReset} className="text-xs text-blue-500 hover:text-blue-700 underline">元に戻す</button>
            )}
          </div>
        </div>
      ) : name && address && phone ? (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 text-xs text-teal-700 font-medium">
          ✓ 病院情報がすべて設定されています
          <span className="block font-normal text-teal-600 mt-0.5">
            <Link to="/msw/search" className="underline hover:text-teal-800">空き事業所を検索</Link>して仮予約を申請できます
          </span>
        </div>
      ) : null}

      <form id="hospital-profile-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-3">
          <div>
            <label className="label">病院名 <span className="text-red-500">*</span></label>
            <input className="input-base" value={name} onChange={e => setName(e.target.value)} required maxLength={100} />
            <p className="text-xs text-slate-400 mt-0.5">事業所の予約管理画面に「〇〇病院からの申請」と表示されます</p>
          </div>
          <div>
            <label className="label">病院住所</label>
            <input className="input-base" value={address} onChange={e => setAddress(e.target.value)} maxLength={300} placeholder="香川県丸亀市〇〇町..." />
            <p className="text-xs text-slate-400 mt-0.5">事業所がルート確認や距離計算に使用します</p>
          </div>
          <div>
            <label className="label">代表電話番号</label>
            <input type="tel" className="input-base" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} placeholder="0877-00-0000" />
            <p className="text-xs text-slate-400 mt-0.5">事業所が予約確認のご連絡に使用することがあります</p>
          </div>
        </div>

        <button
          type="submit"
          className={`w-full font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
            isDirty ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
          disabled={saving || !isDirty}
        >
          {saving ? '保存中...' : isDirty ? '変更を保存する' : '保存済み'}
        </button>
      </form>
    </div>
  )
}



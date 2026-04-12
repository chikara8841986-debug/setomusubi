import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'

export default function HospitalProfile() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

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
      showToast('病院情報を保存しました')
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchProfile} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">病院情報</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-3">
          <div>
            <label className="label">病院名 <span className="text-red-500">*</span></label>
            <input className="input-base" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div>
            <label className="label">病院住所</label>
            <input className="input-base" value={address} onChange={e => setAddress(e.target.value)} placeholder="香川県丸亀市〇〇町..." />
          </div>
          <div>
            <label className="label">代表電話番号</label>
            <input type="tel" className="input-base" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0877-00-0000" />
          </div>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </form>
    </div>
  )
}

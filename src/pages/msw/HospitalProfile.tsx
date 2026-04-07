import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'

export default function HospitalProfile() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('hospitals')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setName(data.name)
          setAddress(data.address ?? '')
          setPhone(data.phone ?? '')
        }
        setLoading(false)
      })
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    setError('')
    setSuccess(false)

    const { error: err } = await supabase
      .from('hospitals')
      .update({ name: name.trim(), address: address.trim() || null, phone: phone.trim() || null })
      .eq('user_id', user.id)

    setSaving(false)
    if (err) {
      setError('保存に失敗しました: ' + err.message)
    } else {
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

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

        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        {success && <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">保存しました</p>}

        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </form>
    </div>
  )
}

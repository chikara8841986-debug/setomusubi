import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import LineLinkCard from '../../components/LineLinkCard'

// 一般の方（ご利用者本人・ご家族）向けのマイページ。
// profiles テーブルには氏名・電話番号の列が無いため、auth.users の user_metadata に保存する
// （登録時に PersonalRegister.tsx が full_name / phone を metadata として渡している）。
export default function PersonalProfile() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) return
    setFullName(typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '')
    setPhone(typeof user.user_metadata?.phone === 'string' ? user.user_metadata.phone : '')
  }, [user])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!fullName.trim()) { showToast('お名前を入力してください', 'error'); return }
    if (!phone.trim()) { showToast('電話番号を入力してください', 'error'); return }

    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), phone: phone.trim() },
    })
    setSaving(false)

    if (error) {
      showToast('保存に失敗しました', 'error')
      return
    }
    showToast('保存しました')
  }

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 mb-1">マイページ</h1>
        <p className="text-sm text-slate-600 leading-relaxed">お名前・電話番号は、予約申請時の連絡先として使われます。</p>
      </div>

      <form onSubmit={handleSubmit} className="card space-y-4">
        <div>
          <label className="label">お名前</label>
          <input
            type="text"
            className="input-base"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={50}
          />
        </div>
        <div>
          <label className="label">電話番号</label>
          <input
            type="tel"
            className="input-base"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={20}
          />
          <p className="text-xs text-slate-400 mt-1">新しい予約申請フォームに自動で入力されます（過去の申請には反映されません）</p>
        </div>
        <div>
          <label className="label">メールアドレス</label>
          <input type="email" className="input-base bg-slate-50 text-slate-400" value={user?.email ?? ''} disabled />
          <p className="text-xs text-slate-400 mt-1">メールアドレスの変更はサポートまでお問い合わせください</p>
        </div>
        <button type="submit" className="btn-primary w-full" disabled={saving}>
          {saving ? '保存中...' : '保存する'}
        </button>
      </form>

      <LineLinkCard />

      <div className="card">
        <h3 className="text-base font-bold text-slate-800 mb-1">お問い合わせ</h3>
        <p className="text-sm text-slate-600 mb-3">ご不明点やご要望があれば、フォームからお問い合わせください。</p>
        <Link to="/contact" className="btn-secondary inline-block text-sm">問い合わせフォームを開く</Link>
      </div>
    </div>
  )
}

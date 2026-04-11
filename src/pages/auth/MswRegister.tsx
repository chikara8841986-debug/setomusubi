import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function MswRegister() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Account
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  // Step 2: Hospital info
  const [hospitalName, setHospitalName] = useState('')
  const [hospitalAddress, setHospitalAddress] = useState('')
  const [hospitalPhone, setHospitalPhone] = useState('')
  const [contactName, setContactName] = useState('')

  const handleStep1 = (e: FormEvent) => {
    e.preventDefault()
    if (password !== passwordConfirm) {
      setError('パスワードが一致しません')
      return
    }
    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください')
      return
    }
    setError('')
    setStep(2)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!hospitalName.trim()) {
      setError('病院名を入力してください')
      return
    }
    setLoading(true)
    setError('')

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('ユーザー作成に失敗しました')

      const { error: profileError } = await supabase
        .from('profiles')
        .insert({ id: data.user.id, role: 'msw' })
      if (profileError) throw profileError

      const { data: hospital, error: hospError } = await supabase
        .from('hospitals')
        .insert({
          user_id: data.user.id,
          name: hospitalName.trim(),
          address: hospitalAddress.trim() || null,
          phone: hospitalPhone.trim() || null,
        })
        .select()
        .single()
      if (hospError) throw hospError

      if (contactName.trim() && hospital) {
        await supabase
          .from('msw_contacts')
          .insert({ hospital_id: hospital.id, name: contactName.trim() })
      }

      navigate('/msw/search')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '登録に失敗しました'
      if (msg.includes('already registered')) {
        setError('このメールアドレスは既に登録されています')
      } else {
        setError(msg)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-slate-900/65 via-slate-800/50 to-slate-900/65" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <Link to="/" className="font-display text-3xl font-black text-white drop-shadow-lg tracking-wide">せとむすび</Link>
          <p className="text-white/70 text-sm mt-2">MSW（病院）新規登録</p>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-2 mb-6">
          {[1, 2].map(s => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${s <= step ? 'bg-teal-400' : 'bg-white/20'}`} />
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          {step === 1 ? (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">アカウント情報</h2>
              <form onSubmit={handleStep1} className="space-y-4">
                <div>
                  <label className="label">メールアドレス</label>
                  <input type="email" className="input-base" value={email}
                    onChange={e => setEmail(e.target.value)} required placeholder="msw@hospital.jp" />
                </div>
                <div>
                  <label className="label">パスワード（8文字以上）</label>
                  <input type="password" className="input-base" value={password}
                    onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
                </div>
                <div>
                  <label className="label">パスワード（確認）</label>
                  <input type="password" className="input-base" value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)} required placeholder="••••••••" />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full">次へ →</button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">病院情報</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">病院名 <span className="text-red-500">*</span></label>
                  <input type="text" className="input-base" value={hospitalName}
                    onChange={e => setHospitalName(e.target.value)} required placeholder="〇〇病院" />
                </div>
                <div>
                  <label className="label">病院住所</label>
                  <input type="text" className="input-base" value={hospitalAddress}
                    onChange={e => setHospitalAddress(e.target.value)} placeholder="香川県丸亀市〇〇町..." />
                </div>
                <div>
                  <label className="label">代表電話番号</label>
                  <input type="tel" className="input-base" value={hospitalPhone}
                    onChange={e => setHospitalPhone(e.target.value)} placeholder="0877-00-0000" />
                </div>
                <div>
                  <label className="label">担当者名（任意）</label>
                  <input type="text" className="input-base" value={contactName}
                    onChange={e => setContactName(e.target.value)} placeholder="山田 花子" />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => { setStep(1); setError('') }}>
                    ← 戻る
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={loading}>
                    {loading ? '登録中...' : '登録する'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-sm text-white/70 mt-5">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-teal-300 hover:text-white font-medium transition-colors">ログイン</Link>
        </p>
      </div>
    </div>
  )
}

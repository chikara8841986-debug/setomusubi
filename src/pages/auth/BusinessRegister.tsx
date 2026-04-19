import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function BusinessRegister() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Step 1: Account
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Step 2: Business info
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')

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
    if (!name.trim()) {
      setError('事業所名を入力してください')
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
        .insert({ id: data.user.id, role: 'business' })
      if (profileError) throw profileError

      const { error: bizError } = await supabase
        .from('businesses')
        .insert({
          user_id: data.user.id,
          name: name.trim(),
          phone: phone.trim() || null,
          approved: false,
          service_areas: [],
          closed_days: [],
        })
      if (bizError) throw bizError

      navigate('/login', { state: { message: '登録申請が完了しました。管理者の承認をお待ちください。', email } })
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
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <Link to="/" className="font-display text-3xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</Link>
          <p className="text-slate-600 text-sm mt-2">事業所 新規登録</p>
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
                    onChange={e => setEmail(e.target.value)} required placeholder="info@taxi.jp" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="label mb-0">パスワード（8文字以上）</label>
                    <button type="button" onClick={() => setShowPassword(v => !v)}
                      className="text-xs text-gray-400 hover:text-gray-600">
                      {showPassword ? '隠す' : '表示'}
                    </button>
                  </div>
                  <input type={showPassword ? 'text' : 'password'} className="input-base" value={password}
                    onChange={e => setPassword(e.target.value)} required placeholder="••••••••" />
                  {password.length > 0 && password.length < 8 && (
                    <p className="text-xs text-amber-500 mt-0.5">あと{8 - password.length}文字必要です</p>
                  )}
                  {password.length >= 8 && (
                    <p className="text-xs text-teal-600 mt-0.5">✓ 8文字以上</p>
                  )}
                </div>
                <div>
                  <label className="label">パスワード（確認）</label>
                  <input type={showPassword ? 'text' : 'password'} className="input-base" value={passwordConfirm}
                    onChange={e => setPasswordConfirm(e.target.value)} required placeholder="••••••••" />
                  {passwordConfirm.length > 0 && password !== passwordConfirm && (
                    <p className="text-xs text-red-500 mt-0.5">パスワードが一致していません</p>
                  )}
                  {passwordConfirm.length > 0 && password === passwordConfirm && password.length >= 8 && (
                    <p className="text-xs text-teal-600 mt-0.5">✓ 一致しています</p>
                  )}
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full">次へ →</button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">事業所情報</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">事業所名 <span className="text-red-500">*</span></label>
                  <input type="text" className="input-base" value={name}
                    onChange={e => setName(e.target.value)} required placeholder="〇〇介護タクシー" />
                </div>
                <div>
                  <label className="label">電話番号</label>
                  <input type="tel" className="input-base" value={phone}
                    onChange={e => setPhone(e.target.value)} placeholder="0877-00-0000" />
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2.5">
                  ※ 登録後、管理者の承認が完了するまでサービスをご利用いただけません。
                </p>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary flex-1" onClick={() => { setStep(1); setError('') }}>
                    ← 戻る
                  </button>
                  <button type="submit" className="btn-primary flex-1" disabled={loading}>
                    {loading ? '登録中...' : '登録申請'}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <p className="mt-5 bg-white/75 backdrop-blur-md rounded-2xl px-5 py-3.5 text-center text-sm text-slate-700 shadow-sm">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-teal-700 hover:text-teal-900 font-medium transition-colors">ログイン</Link>
        </p>
      </div>
    </div>
  )
}

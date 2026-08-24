import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

// 一般の方（ご利用者本人・ご家族）向けの新規登録。
// role='personal' で signUp すると、DB側トリガが profiles 行だけを作る（hospitals行は作らない）。
// 病棟・病室などMSW専用の項目は持たず、電話番号を必須にする（連絡が取れないと運行できないため）。
export default function PersonalRegister() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [phone, setPhone] = useState('')
  const [agreedToPolicies, setAgreedToPolicies] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) { setError('お名前を入力してください'); return }
    if (!phone.trim()) { setError('電話番号を入力してください'); return }
    if (password !== passwordConfirm) { setError('パスワードが一致しません'); return }
    if (password.length < 8) { setError('パスワードは8文字以上で設定してください'); return }
    if (!agreedToPolicies) { setError('利用規約とプライバシーポリシーへの同意が必要です'); return }

    setLoading(true)
    try {
      // すべてのレコード作成は auth.users への INSERT トリガで原子的に処理される。
      // role='personal' の場合、hospitals 行は作られず profiles 行だけが作られる。
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            role: 'personal',
            full_name: fullName.trim(),
            phone: phone.trim(),
          },
        },
      })
      if (signUpError) throw signUpError
      if (!data.user) throw new Error('user_not_created')
      if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
        throw new Error('already_registered')
      }

      navigate('/login', {
        state: {
          message: '登録を受け付けました。確認メールを送信したので、メール内のリンクをクリックして登録を完了してください。',
          email,
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'already_registered' || msg.includes('already registered') || msg.includes('already been registered')) {
        setError('このメールアドレスは既に登録されています')
      } else if (msg.includes('Password')) {
        setError('パスワードが要件を満たしていません')
      } else if (msg.includes('registration_invalid_role')) {
        setError('登録に失敗しました。サポートに連絡してください。')
      } else if (msg === 'user_not_created') {
        setError('アカウント作成に失敗しました。再試行してください。')
      } else {
        setError('登録に失敗しました。入力内容を確認のうえ、再試行してください。')
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
          <p className="text-slate-600 text-sm mt-2">ご利用者登録</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          <h2 className="text-base font-bold text-slate-800 mb-1">新規登録</h2>
          <p className="text-xs text-slate-400 mb-5">ご本人またはご家族が、介護タクシーを検索・予約するためのアカウントです</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">お名前 <span className="text-red-500">*</span></label>
              <input type="text" className="input-base" value={fullName}
                onChange={e => setFullName(e.target.value)} required maxLength={50} placeholder="山田 花子"
                autoComplete="name" />
              <p className="text-xs text-slate-400 mt-0.5">ご本人、またはご家族の方のお名前をご入力ください</p>
            </div>

            <div>
              <label className="label">電話番号 <span className="text-red-500">*</span></label>
              <input type="tel" className="input-base" value={phone}
                onChange={e => setPhone(e.target.value)} required maxLength={20} placeholder="090-0000-0000"
                autoComplete="tel" />
              <p className="text-xs text-slate-400 mt-0.5">予約の連絡が取れる電話番号をご入力ください</p>
            </div>

            <div>
              <label className="label">メールアドレス <span className="text-red-500">*</span></label>
              <input type="email" className="input-base" value={email}
                onChange={e => setEmail(e.target.value)} required maxLength={255} placeholder="example@mail.jp" autoComplete="email" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="label mb-0">パスワード <span className="text-red-500">*</span>（8文字以上）</label>
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="text-xs text-slate-400 hover:text-slate-600">
                  {showPassword ? '隠す' : '表示'}
                </button>
              </div>
              <input type={showPassword ? 'text' : 'password'} className="input-base" value={password}
                onChange={e => setPassword(e.target.value)} required maxLength={128} placeholder="••••••••" autoComplete="new-password" />
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
                onChange={e => setPasswordConfirm(e.target.value)} required maxLength={128} placeholder="••••••••" autoComplete="new-password" />
              {passwordConfirm.length > 0 && password !== passwordConfirm && (
                <p className="text-xs text-red-500 mt-0.5">パスワードが一致していません</p>
              )}
              {passwordConfirm.length > 0 && password === passwordConfirm && password.length >= 8 && (
                <p className="text-xs text-teal-600 mt-0.5">✓ 一致しています</p>
              )}
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
              <input
                type="checkbox"
                checked={agreedToPolicies}
                onChange={e => setAgreedToPolicies(e.target.checked)}
                required
                className="mt-1 h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <span>
                <Link to="/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 hover:underline">
                  利用規約
                </Link>
                {' '}と{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-teal-700 hover:underline">
                  プライバシーポリシー
                </Link>
                に同意します。
              </span>
            </label>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

            <button type="submit" className="btn-primary w-full" disabled={loading || !agreedToPolicies}>
              {loading ? '登録中...' : '登録する'}
            </button>
          </form>
        </div>

        <p className="mt-5 bg-white/75 backdrop-blur-md rounded-2xl px-5 py-3.5 text-center text-sm text-slate-700 shadow-sm">
          すでにアカウントをお持ちの方は{' '}
          <Link to="/login" className="text-teal-700 hover:text-teal-900 font-medium transition-colors">ログイン</Link>
        </p>
        <p className="mt-2 text-center text-xs text-white/70">
          病院MSW・ケアマネ等の専門職の方は{' '}
          <Link to="/register/msw" className="underline hover:text-white transition-colors">
            専門職登録
          </Link>
        </p>
      </div>
    </div>
  )
}

import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const notice = (location.state as { message?: string } | null)?.message ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single()

      if (!profile) throw new Error('プロフィールが見つかりません')

      if (profile.role === 'business') navigate('/business/calendar')
      else if (profile.role === 'msw') navigate('/msw/search')
      else if (profile.role === 'admin') navigate('/admin/approvals')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'ログインに失敗しました'
      if (msg.includes('Invalid login credentials')) {
        setError('メールアドレスまたはパスワードが正しくありません')
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
      {/* Blurred dark overlay */}
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-600 text-sm mt-2 tracking-wide">介護タクシー予約プラットフォーム</p>
        </div>

        {notice && (
          <div className="mb-4 bg-emerald-500/20 border border-emerald-400/40 rounded-xl px-4 py-3 text-sm text-emerald-100 backdrop-blur-sm">
            {notice}
          </div>
        )}

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          <h2 className="text-lg font-bold text-slate-800 mb-5">ログイン</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">メールアドレス</label>
              <input
                type="email"
                className="input-base"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="example@hospital.jp"
              />
            </div>
            <div>
              <label className="label">パスワード</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="input-base pr-10"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  tabIndex={-1}
                >
                  {showPassword ? '隠す' : '表示'}
                </button>
              </div>
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
          <div className="mt-4 text-center">
            <Link to="/auth/forgot-password" className="text-xs text-slate-400 hover:text-slate-600 hover:underline transition-colors">
              パスワードを忘れた方
            </Link>
          </div>
        </div>

        {/* Register links */}
        <div className="mt-5 bg-white/75 backdrop-blur-md rounded-2xl px-5 py-4 space-y-2 text-center text-sm text-slate-700 shadow-sm">
          <p>
            事業所の方（新規登録）→{' '}
            <Link to="/register/business" className="text-teal-700 hover:text-teal-900 font-semibold transition-colors">
              事業所登録
            </Link>
          </p>
          <p>
            MSW（病院）の方（新規登録）→{' '}
            <Link to="/register/msw" className="text-teal-700 hover:text-teal-900 font-semibold transition-colors">
              MSW登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-teal-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-700">せとむすび</h1>
          <p className="text-gray-500 text-sm mt-1">介護タクシー予約プラットフォーム</p>
        </div>

        {notice && (
          <div className="mb-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800">
            {notice}
          </div>
        )}

        <div className="card">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">ログイン</h2>
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
              <input
                type="password"
                className="input-base"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
          <div className="mt-3 text-center">
            <Link to="/auth/forgot-password" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
              パスワードを忘れた方
            </Link>
          </div>
        </div>

        <div className="mt-4 space-y-2 text-center text-sm text-gray-600">
          <p>
            事業所の方（新規登録）→{' '}
            <Link to="/register/business" className="text-blue-600 hover:underline font-medium">
              事業所登録
            </Link>
          </p>
          <p>
            MSW（病院）の方（新規登録）→{' '}
            <Link to="/register/msw" className="text-blue-600 hover:underline font-medium">
              MSW登録
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

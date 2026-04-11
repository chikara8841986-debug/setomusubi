import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    if (err) {
      setError('送信に失敗しました: ' + err.message)
    } else {
      setSent(true)
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
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-white drop-shadow-lg tracking-wide">せとむすび</h1>
          <p className="text-white/70 text-sm mt-2">パスワード再設定</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📧</div>
              <p className="font-bold text-slate-800 mb-2">メールを送信しました</p>
              <p className="text-sm text-slate-500 mb-4">
                <span className="font-medium text-slate-700">{email}</span> に<br />
                パスワード再設定用のリンクを送りました。<br />
                メールを確認してください。
              </p>
              <p className="text-xs text-slate-400">メールが届かない場合は迷惑メールをご確認ください</p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-1">パスワードを忘れた方</h2>
              <p className="text-xs text-slate-500 mb-5">
                登録済みのメールアドレスを入力すると、再設定用のリンクをお送りします。
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">メールアドレス</label>
                  <input
                    type="email"
                    className="input-base"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="example@hospital.jp"
                    autoComplete="email"
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? '送信中...' : '再設定メールを送る'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-5 text-center text-sm">
          <Link to="/login" className="text-teal-300 hover:text-white transition-colors">← ログインに戻る</Link>
        </div>
      </div>
    </div>
  )
}

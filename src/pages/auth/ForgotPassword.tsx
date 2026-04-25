import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  // 60秒クールダウンのカウントダウン
  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (cooldown > 0) return
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)
    setCooldown(60) // 連打防止: 60秒待機
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
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-600 text-sm mt-2">パスワード再設定</p>
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
                  <label className="label">メールアドレス <span className="text-red-500">*</span></label>
                  <input
                    type="email"
                    className="input-base"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    maxLength={255}
                    placeholder="example@hospital.jp"
                    autoComplete="email"
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading || cooldown > 0}>
                  {loading ? '送信中...' : cooldown > 0 ? `再送信まで ${cooldown}秒` : '再設定メールを送る'}
                </button>
                {cooldown > 0 && !loading && (
                  <p className="text-xs text-slate-400 text-center">
                    連続送信を防ぐため、しばらくお待ちください
                  </p>
                )}
              </form>
            </>
          )}
        </div>

        <div className="mt-5 bg-white/75 backdrop-blur-md rounded-2xl px-5 py-3.5 text-center text-sm shadow-sm">
          <Link to="/login" className="text-teal-700 hover:text-teal-900 font-semibold transition-colors">← ログインに戻る</Link>
        </div>
      </div>
    </div>
  )
}

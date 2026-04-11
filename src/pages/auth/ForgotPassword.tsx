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
    <div className="min-h-screen flex items-center justify-center p-4 relative" style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}>
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[2px]" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-700">せとむすび</h1>
          <p className="text-gray-500 text-sm mt-1">パスワード再設定</p>
        </div>

        <div className="card">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📧</div>
              <p className="font-semibold text-gray-900 mb-2">メールを送信しました</p>
              <p className="text-sm text-gray-500 mb-4">
                <span className="font-medium text-gray-700">{email}</span> に<br />
                パスワード再設定用のリンクを送りました。<br />
                メールを確認してください。
              </p>
              <p className="text-xs text-gray-400">メールが届かない場合は迷惑メールをご確認ください</p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-semibold text-gray-800 mb-1">パスワードを忘れた方</h2>
              <p className="text-xs text-gray-500 mb-4">
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
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? '送信中...' : '再設定メールを送る'}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-4 text-center text-sm">
          <Link to="/login" className="text-blue-600 hover:underline">← ログインに戻る</Link>
        </div>
      </div>
    </div>
  )
}

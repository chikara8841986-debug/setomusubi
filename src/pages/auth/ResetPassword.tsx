import { useState, useEffect } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    if (password !== confirm) {
      setError('パスワードが一致しません')
      return
    }
    setLoading(true)
    setError('')
    const { error: err } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (err) {
      setError('更新に失敗しました: ' + err.message)
    } else {
      setDone(true)
      setTimeout(() => navigate('/login', { state: { message: 'パスワードを変更しました。新しいパスワードでログインしてください。' } }), 2500)
    }
  }

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 backdrop-blur-lg bg-white/45" />

      <div className="relative z-10 w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-600 text-sm mt-2">新しいパスワードを設定</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          {done ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <p className="font-bold text-slate-800">パスワードを変更しました</p>
              <p className="text-sm text-slate-500 mt-2">ログイン画面へ移動します...</p>
            </div>
          ) : !ready ? (
            <div className="text-center py-6 text-slate-400 text-sm">
              <div className="text-3xl mb-3">⏳</div>
              <p>リンクを確認中...</p>
              <p className="text-xs mt-2">メールのリンクから直接アクセスしてください</p>
            </div>
          ) : (
            <>
              <h2 className="text-base font-bold text-slate-800 mb-5">新しいパスワードを入力</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">新しいパスワード（8文字以上）</label>
                  <input
                    type="password"
                    className="input-base"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="新しいパスワード"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="label">パスワード（確認）</label>
                  <input
                    type="password"
                    className="input-base"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
                    required
                    placeholder="もう一度入力"
                    autoComplete="new-password"
                  />
                </div>
                {error && <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
                <button type="submit" className="btn-primary w-full" disabled={loading}>
                  {loading ? '更新中...' : 'パスワードを変更する'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

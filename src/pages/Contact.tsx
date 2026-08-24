import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'

const NAME_MAX = 100
const BODY_MAX = 3000

function homeForRole(role: 'business' | 'msw' | 'admin' | 'personal' | null): string {
  if (role === 'business') return '/business/calendar'
  if (role === 'msw') return '/msw/search'
  if (role === 'admin') return '/admin/approvals'
  if (role === 'personal') return '/my/search'
  return '/login'
}

export default function Contact() {
  const { user, role, businessName, hospitalName, loading: authLoading } = useAuth()
  const { showToast } = useToast()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [body, setBody] = useState('')
  const [website, setWebsite] = useState('') // ハニーポット（人間には非表示）
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  // ログイン済みなら分かる範囲で自動入力（未ログインなら空欄のまま）
  useEffect(() => {
    if (authLoading) return
    if (user) {
      setEmail((current) => current || user.email || '')
      setName((current) => current || businessName || hospitalName || '')
    }
  }, [authLoading, user, businessName, hospitalName])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    const trimmedBody = body.trim()

    if (!trimmedName || !trimmedEmail || !trimmedBody) {
      setError('お名前・メールアドレス・お問い合わせ内容をすべて入力してください')
      return
    }

    setSubmitting(true)

    // ハニーポット: ボットが埋めていたら実際には送信せず、成功したように見せて終える
    if (website.trim().length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      setSubmitting(false)
      setSubmitted(true)
      return
    }

    const { error: insertError } = await supabase.from('inquiries').insert({
      name: trimmedName,
      email: trimmedEmail,
      body: trimmedBody,
      user_id: user?.id ?? null,
    })

    setSubmitting(false)

    if (insertError) {
      if (insertError.message.includes('inquiry_rate_limited')) {
        setError('短時間に複数回送信されたため、受け付けを一時的に制限しています。少し時間を置いてから再度お試しください。')
      } else {
        setError('送信に失敗しました。時間を置いて再試行するか、しばらくしてから改めてお試しください。')
      }
      showToast('送信に失敗しました', 'error')
      return
    }

    setSubmitted(true)
    showToast('お問い合わせを送信しました')
  }

  const backTo = user ? homeForRole(role) : '/login'
  const backLabel = user ? 'アプリに戻る' : 'ログイン画面へ'

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-display text-3xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-600 text-sm mt-2 tracking-wide">お問い合わせ</p>
        </div>

        <div className="bg-white rounded-2xl shadow-auth p-7">
          {submitted ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">✅</div>
              <h2 className="text-lg font-bold text-slate-800 mb-2">送信しました</h2>
              <p className="text-sm text-slate-600 leading-relaxed mb-6">
                お問い合わせありがとうございます。内容を確認のうえ、ご入力いただいたメールアドレス宛にご連絡いたします。
              </p>
              <Link to={backTo} className="btn-primary inline-block w-full text-center">
                {backLabel}
              </Link>
            </div>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-800 mb-1">お問い合わせ</h2>
              <p className="text-sm text-slate-500 mb-5 leading-relaxed">
                ご質問・ご要望・不具合のご報告など、お気軽にお送りください。
              </p>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ハニーポット: 実ユーザーには見えない欄。ボット対策のため画面には一切表示しない */}
                <div className="absolute -left-[9999px] top-0" aria-hidden="true">
                  <label htmlFor="website">ウェブサイト</label>
                  <input
                    id="website"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>

                <div>
                  <label className="label">お名前</label>
                  <input
                    type="text"
                    className="input-base"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={NAME_MAX}
                    placeholder="例）〇〇介護タクシー 山田"
                    autoComplete="name"
                  />
                </div>

                <div>
                  <label className="label">返信先メールアドレス</label>
                  <input
                    type="email"
                    className="input-base"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                    placeholder="example@example.com"
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="label">お問い合わせ内容</label>
                  <textarea
                    className="input-base resize-none"
                    rows={6}
                    value={body}
                    onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX))}
                    required
                    maxLength={BODY_MAX}
                    placeholder="お問い合わせ内容をご記入ください"
                  />
                  <p className="text-xs text-slate-400 text-right mt-1">{body.length} / {BODY_MAX}</p>
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</p>
                )}

                <button type="submit" className="btn-primary w-full" disabled={submitting}>
                  {submitting ? '送信中...' : '送信する'}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link to={backTo} className="text-xs text-slate-400 hover:text-slate-600 hover:underline transition-colors">
                  {backLabel}
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

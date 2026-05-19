import { useState } from 'react'
import { Link } from 'react-router-dom'

type Step = 0 | 1 | 2 | 3 | 4

const STEPS = [
  {
    title: '① アカウント情報を入力',
    icon: '📧',
    desc: '管理者のメールアドレスとパスワードを設定します。確認メール用のアドレスになります。',
    detail: [
      'メールアドレス',
      'パスワード（8文字以上）',
      'パスワード（確認）',
    ],
  },
  {
    title: '② 事業所情報を入力',
    icon: '🚐',
    desc: '事業所名と電話番号を登録します（最低限の情報のみ）。詳細はログイン後に設定可能です。',
    detail: [
      '事業所名（例: せとうち介護タクシー）',
      '電話番号（任意）',
    ],
  },
  {
    title: '③ 確認メールが届く',
    icon: '✉️',
    desc: 'noreply@send.hakobite-marugame.com から確認メールが届きます。リンクをクリックしてメールアドレスを確認します。',
    detail: [
      '件名: 【せとむすび】メールアドレスの確認',
      'メール内のリンクをクリック',
      '即座に確認完了',
    ],
  },
  {
    title: '④ 管理者の承認待ち',
    icon: '⏳',
    desc: '登録申請が管理者へ通知されます。通常24時間以内に審査・承認します。',
    detail: [
      'この間ログインしても「承認待ち」画面が表示されます',
      '管理者が事業所情報を審査',
      '承認 or 却下が決定される',
    ],
  },
  {
    title: '⑤ 承認完了 → ご利用開始',
    icon: '🎉',
    desc: '承認されると、せとむすび から「承認されました」メールが届きます。ログインして使い始められます。',
    detail: [
      'プロフィール設定（営業時間・対応エリア・設備）',
      '車両を登録（無料2台＋追加で料金変動）',
      'カレンダーで空き時間枠を登録',
      'MSWから仮予約申請が届きはじめる',
    ],
  },
]

export default function DemoBusinessRegister() {
  const [step, setStep] = useState<Step>(0)

  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-lg space-y-4">
        {/* Brand */}
        <div className="text-center mb-2">
          <h1 className="font-display text-3xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-700 text-sm mt-2 font-medium">事業所 新規登録 — 流れの説明</p>
        </div>

        {/* Demo Banner */}
        <div className="bg-amber-400/90 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-amber-300 shadow">
          <p className="text-amber-900 font-bold text-sm">⚡ デモ：登録の流れを5ステップで体験</p>
          <p className="text-amber-800 text-xs mt-0.5">実際の登録ではなく、フローの説明です。</p>
        </div>

        {/* Step navigator */}
        <div className="flex items-center gap-1.5 justify-center">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-10 bg-teal-600' : i < step ? 'w-2 bg-teal-400' : 'w-2 bg-white/40'
              }`}
            />
          ))}
        </div>

        {/* Step card */}
        <div className="bg-white rounded-2xl shadow-auth p-7">
          <div className="text-center mb-5">
            <div className="text-5xl mb-3">{STEPS[step].icon}</div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">{STEPS[step].title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{STEPS[step].desc}</p>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 space-y-2">
            {STEPS[step].detail.map((d, i) => (
              <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-teal-600 mt-0.5">▸</span>
                <span>{d}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-6">
            <button
              className="btn-secondary flex-1"
              disabled={step === 0}
              onClick={() => setStep(s => Math.max(0, (s - 1) as Step) as Step)}
            >
              ← 戻る
            </button>
            {step < STEPS.length - 1 ? (
              <button
                className="btn-primary flex-1"
                onClick={() => setStep(s => Math.min(STEPS.length - 1, (s + 1) as Step) as Step)}
              >
                次へ →
              </button>
            ) : (
              <Link to="/demo" className="btn-primary flex-1 text-center">
                デモトップへ戻る
              </Link>
            )}
          </div>
        </div>

        {/* Footer links */}
        <div className="bg-white/75 backdrop-blur-md rounded-2xl px-5 py-4 space-y-2 text-center text-sm text-slate-700 shadow-sm">
          <p>
            実際に登録するには →{' '}
            <Link to="/register/business" className="text-teal-700 hover:text-teal-900 font-semibold">
              事業所登録ページへ
            </Link>
          </p>
          <p>
            <Link to="/demo" className="text-teal-700 hover:text-teal-900 font-semibold">← デモトップへ</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

type OnboardingRole = 'business' | 'msw'

type OnboardingModalProps = {
  role: OnboardingRole
  onClose: () => void
}

const CONTENT: Record<OnboardingRole, { steps: { icon: string; text: string }[] }> = {
  business: {
    steps: [
      { icon: '📝', text: '「紹介・PR」ページでプロフィールと料金を入力しましょう' },
      { icon: '📅', text: '「カレンダー」で空き枠をドラッグして登録しましょう' },
      { icon: '✅', text: 'MSWから申請が届いたら「予約管理」で承認してください' },
    ],
  },
  msw: {
    steps: [
      { icon: '🔍', text: '「空き検索」で日時・エリアを指定して事業所を探しましょう' },
      { icon: '⭐', text: 'よく使う事業所は「お気に入り」登録が便利です' },
      { icon: '👤', text: '「担当者管理」で担当者を登録すると次回から選択できます' },
    ],
  },
}

export default function OnboardingModal({ role, onClose }: OnboardingModalProps) {
  const { steps } = CONTENT[role]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-teal-100">
        <div className="bg-gradient-to-r from-teal-500 to-emerald-500 px-6 py-5 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-white/80">Welcome</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">ようこそ せとむすびへ！</h2>
          <p className="mt-2 text-sm text-white/90">
            はじめに、よく使う機能と最初の3ステップを確認しましょう。
          </p>
        </div>

        <div className="px-6 py-6">
          <ol className="space-y-4">
            {steps.map((step, index) => (
              <li
                key={step.text}
                className="flex items-start gap-4 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-lg shadow-sm ring-1 ring-teal-100">
                  <span aria-hidden="true">{step.icon}</span>
                </div>
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] text-teal-600">STEP {index + 1}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-700">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
            このガイドはいつでも再表示できます（右上メニューより）
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-xl bg-teal-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-300"
            >
              はじめる →
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

import { Link } from 'react-router-dom'

export default function DemoIndex() {
  return (
    <div
      className="min-h-screen relative flex items-center justify-center p-4"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-white/20" />

      <div className="relative z-10 w-full max-w-sm space-y-4">
        {/* Brand */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-700 text-sm mt-2 font-medium">介護タクシー予約プラットフォーム</p>
        </div>

        {/* Demo Banner */}
        <div className="bg-amber-400/90 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-amber-300 shadow">
          <p className="text-amber-900 font-bold text-sm">⚡ デモモード</p>
          <p className="text-amber-800 text-xs mt-0.5">ログイン不要で操作をお試しいただけます。データは保存されません。</p>
        </div>

        {/* Role Selection */}
        <div className="bg-white rounded-2xl shadow-auth p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-800 text-center mb-4">体験するユーザーを選んでください</h2>

          <Link to="/demo/msw/search" className="block">
            <div className="border-2 border-sky-200 rounded-xl p-4 hover:border-sky-400 hover:bg-sky-50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-2xl flex-shrink-0">
                  🏥
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">MSW（医療ソーシャルワーカー）</p>
                  <p className="text-xs text-slate-500 mt-0.5">事業所を検索して仮予約を申請する体験</p>
                  <p className="text-xs text-sky-600 mt-1 font-medium">✓ 事業所検索　✓ 仮予約申請　✓ 予約履歴</p>
                </div>
              </div>
            </div>
          </Link>

          <Link to="/demo/business/reservations" className="block">
            <div className="border-2 border-teal-200 rounded-xl p-4 hover:border-teal-400 hover:bg-teal-50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-teal-100 flex items-center justify-center text-2xl flex-shrink-0">
                  🚐
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-sm">介護タクシー事業所</p>
                  <p className="text-xs text-slate-500 mt-0.5">空き枠を管理して仮予約を承認する体験</p>
                  <p className="text-xs text-teal-600 mt-1 font-medium">✓ 空き枠管理　✓ 予約承認・却下　✓ カレンダー</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Links */}
        <div className="bg-white/75 backdrop-blur-md rounded-2xl px-5 py-4 space-y-2 text-center text-sm text-slate-700 shadow-sm">
          <p>
            <Link to="/login" className="text-teal-700 hover:text-teal-900 font-semibold transition-colors">
              ← ログインページに戻る
            </Link>
          </p>
          <p>
            <Link to="/manual" target="_blank" className="text-teal-700 hover:text-teal-900 font-semibold transition-colors">
              📖 使い方ガイドを見る（PDF保存可）
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

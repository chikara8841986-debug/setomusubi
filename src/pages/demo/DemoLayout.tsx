import { Link, useLocation } from 'react-router-dom'

type DemoRole = 'msw' | 'business'

const NAV_BUSINESS = [
  { to: '/demo/business/calendar',     label: 'カレンダー', icon: '📅' },
  { to: '/demo/business/reservations', label: '予約管理',   icon: '📋' },
  { to: '/demo/business/profile',      label: 'プロフィール', icon: '🏢' },
]

const NAV_MSW = [
  { to: '/demo/msw/search',       label: '予約する',   icon: '🔍' },
  { to: '/demo/msw/reservations', label: '予約履歴',   icon: '📋' },
  { to: '/demo/msw/businesses',   label: '事業所一覧', icon: '🚗' },
]

export default function DemoLayout({ children, role }: { children: React.ReactNode; role: DemoRole }) {
  const location = useLocation()
  const navItems = role === 'business' ? NAV_BUSINESS : NAV_MSW
  const roleLabel = role === 'business' ? '事業所' : 'MSW'
  const roleBgClass = role === 'business' ? 'bg-teal-600 text-white' : 'bg-sky-600 text-white'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f0f9f8 0%, #e8f5f3 50%, #f0f4ff 100%)' }}>
      {/* Demo Banner */}
      <div className="bg-amber-400 text-amber-950 text-xs py-2 px-4 font-bold flex items-center justify-center gap-3 flex-wrap">
        <span>⚡ デモモード — 操作できますがデータは保存されません</span>
        <span className="text-amber-700">|</span>
        <Link to="/login" className="underline hover:text-amber-700 transition-colors">
          ログイン・新規登録はこちら →
        </Link>
        <Link to="/manual" target="_blank" className="underline hover:text-amber-700 transition-colors">
          📖 使い方ガイド
        </Link>
      </div>

      {/* Header */}
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid rgba(13,148,136,0.12)',
          boxShadow: '0 1px 8px 0 rgba(13,148,136,.08)',
        }}
      >
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-sm text-white text-sm font-black">
              瀬
            </div>
            <span className="font-black text-lg text-teal-700 tracking-tight">せとむすび</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide ${roleBgClass}`}>
              {roleLabel}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 border border-amber-300">
              デモ
            </span>
          </div>
          <Link
            to="/demo"
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          >
            <span>⇄</span>
            <span>切替</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="max-w-4xl mx-auto px-4 flex gap-1 pb-2 overflow-x-auto scrollbar-none">
          {navItems.map(({ to, label, icon }) => {
            const active = location.pathname.startsWith(to)
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-150 ${
                  active
                    ? 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-teal-50 hover:text-teal-700'
                }`}
              >
                <span className="text-base leading-none">{icon}</span>
                <span>{label}</span>
              </Link>
            )
          })}
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 animate-fade-up">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-4" style={{ borderTop: '1px solid rgba(13,148,136,0.08)' }}>
        © 2026 せとむすび　<span className="text-amber-500 font-medium">（デモ表示）</span>
      </footer>
    </div>
  )
}

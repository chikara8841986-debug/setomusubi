import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_BUSINESS = [
  { to: '/business/calendar', label: 'カレンダー' },
  { to: '/business/profile', label: 'プロフィール' },
  { to: '/business/reservations', label: '予約履歴' },
]

const NAV_MSW = [
  { to: '/msw/search', label: '予約する' },
  { to: '/msw/reservations', label: '予約履歴' },
]

const NAV_ADMIN = [
  { to: '/admin/approvals', label: '事業所承認' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = role === 'business' ? NAV_BUSINESS
    : role === 'msw' ? NAV_MSW
    : role === 'admin' ? NAV_ADMIN
    : []

  const roleLabel = role === 'business' ? '事業所' : role === 'msw' ? 'MSW' : role === 'admin' ? '管理者' : ''

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-bold text-blue-700">せとむすび</span>
            {roleLabel && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                {roleLabel}
              </span>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ログアウト
          </button>
        </div>
        {/* Navigation */}
        {navItems.length > 0 && (
          <nav className="max-w-4xl mx-auto px-4 flex gap-1 pb-2 overflow-x-auto">
            {navItems.map(({ to, label }) => {
              const active = location.pathname.startsWith(to)
              return (
                <Link
                  key={to}
                  to={to}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-gray-400 py-4 border-t border-gray-100">
        © 2025 せとむすび
      </footer>
    </div>
  )
}

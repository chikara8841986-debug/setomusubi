import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const NAV_BUSINESS = [
  { to: '/business/calendar', label: 'カレンダー' },
  { to: '/business/profile', label: 'プロフィール' },
  { to: '/business/reservations', label: '予約管理' },
]

const NAV_MSW = [
  { to: '/msw/search', label: '予約する' },
  { to: '/msw/reservations', label: '予約履歴' },
  { to: '/msw/contacts', label: '担当者' },
  { to: '/msw/profile', label: '病院情報' },
]

const NAV_ADMIN = [
  { to: '/admin/approvals', label: '事業所承認' },
  { to: '/admin/reservations', label: '予約一覧' },
  { to: '/admin/stats', label: '統計' },
]

function PendingBadge({ businessId }: { businessId: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true

    const load = async () => {
      const { count: c } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'pending')
      if (mounted) setCount(c ?? 0)
    }

    load()

    const channel = supabase
      .channel('pending-badge-' + businessId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reservations',
        filter: `business_id=eq.${businessId}`,
      }, load)
      .subscribe()

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [businessId])

  if (count === 0) return null
  return (
    <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 inline-flex items-center justify-center font-bold">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, businessId, signOut } = useAuth()
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
              const isReservationsNav = to === '/business/reservations'
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                    active
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {label}
                  {isReservationsNav && businessId && (
                    <PendingBadge businessId={businessId} />
                  )}
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

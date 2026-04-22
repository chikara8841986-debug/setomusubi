import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

type NavItem = { to: string; label: string; icon: string }

const NAV_BUSINESS: NavItem[] = [
  { to: '/business/calendar',     label: 'カレンダー',   icon: '📅' },
  { to: '/business/reservations', label: '予約管理',     icon: '📋' },
  { to: '/business/introduction', label: '紹介ページ',   icon: '🏢' },
  { to: '/business/profile',      label: '設定',         icon: '⚙️' },
]

const NAV_MSW: NavItem[] = [
  { to: '/msw/search',       label: '予約する',     icon: '🔍' },
  { to: '/msw/reservations', label: '予約履歴',     icon: '📋' },
  { to: '/msw/businesses',   label: '事業所一覧',   icon: '🚗' },
  { to: '/msw/favorites',    label: 'お気に入り',   icon: '⭐' },
  { to: '/msw/contacts',     label: '担当者',       icon: '👤' },
  { to: '/msw/profile',      label: '病院情報',     icon: '🏥' },
]

const NAV_ADMIN: NavItem[] = [
  { to: '/admin/approvals',    label: '事業所承認', icon: '✅' },
  { to: '/admin/reservations', label: '予約一覧',   icon: '📊' },
  { to: '/admin/stats',        label: '統計',       icon: '📈' },
]

function AdminPendingBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { count: c } = await supabase
        .from('businesses')
        .select('*', { count: 'exact', head: true })
        .eq('approved', false)
      if (mounted) setCount(c ?? 0)
    }
    load()
    const channel = supabase
      .channel('admin-pending-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, load)
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [])

  if (count === 0) return null
  return (
    <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 inline-flex items-center justify-center font-bold animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

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
    <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 inline-flex items-center justify-center font-bold animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  if (!offline) return null
  return (
    <div className="bg-amber-500 text-white text-xs text-center py-1.5 px-4 font-medium">
      📡 オフライン中です。通信が回復すると自動的に更新されます。
    </div>
  )
}

function AdminReservationsBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { count: c } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending')
      if (mounted) setCount(c ?? 0)
    }
    load()
    const channel = supabase
      .channel('admin-reservations-badge')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, load)
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [])

  if (count === 0) return null
  return (
    <span className="ml-1 text-[10px] bg-red-500 text-white rounded-full w-4 h-4 inline-flex items-center justify-center font-bold animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function MswPendingBadge({ hospitalId }: { hospitalId: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { count: c } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('hospital_id', hospitalId)
        .eq('status', 'pending')
      if (mounted) setCount(c ?? 0)
    }
    load()
    const channel = supabase
      .channel('msw-pending-badge-' + hospitalId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'reservations',
        filter: `hospital_id=eq.${hospitalId}`,
      }, load)
      .subscribe()
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [hospitalId])

  if (count === 0) return null
  return (
    <span className="ml-1 text-[10px] bg-amber-500 text-white rounded-full w-4 h-4 inline-flex items-center justify-center font-bold animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { role, businessId, hospitalId, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  const navItems = role === 'business' ? NAV_BUSINESS
    : role === 'msw' ? NAV_MSW
    : role === 'admin' ? NAV_ADMIN
    : []

  const roleLabel  = role === 'business' ? '事業所' : role === 'msw' ? 'MSW' : role === 'admin' ? '管理者' : ''
  const roleBgClass = role === 'business'
    ? 'bg-teal-600 text-white'
    : role === 'msw'
    ? 'bg-sky-600 text-white'
    : role === 'admin'
    ? 'bg-violet-600 text-white'
    : 'bg-slate-100 text-slate-600'

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #f0f9f8 0%, #e8f5f3 50%, #f0f4ff 100%)' }}>
      <OfflineBanner />

      {/* Header */}
      <header className="sticky top-0 z-30" style={{
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(13,148,136,0.12)',
        boxShadow: '0 1px 8px 0 rgba(13,148,136,.08)',
      }}>
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between h-14">
          <Link to="/" className="flex items-center gap-2.5">
            {/* ロゴアイコン */}
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-sm text-white text-sm font-black">
              瀬
            </div>
            <span className="font-black text-lg text-teal-700 tracking-tight">せとむすび</span>
            {roleLabel && (
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wide ${roleBgClass}`}>
                {roleLabel}
              </span>
            )}
          </Link>
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-400 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100 flex items-center gap-1"
          >
            <span>↩</span>
            <span>ログアウト</span>
          </button>
        </div>

        {/* Navigation */}
        {navItems.length > 0 && (
          <nav className="max-w-4xl mx-auto px-4 flex gap-1 pb-2 overflow-x-auto scrollbar-none">
            {navItems.map(({ to, label, icon }) => {
              const active = location.pathname.startsWith(to)
              const isReservationsNav = to === '/business/reservations'
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
                  {isReservationsNav && businessId && (
                    <PendingBadge businessId={businessId} />
                  )}
                  {to === '/msw/reservations' && hospitalId && (
                    <MswPendingBadge hospitalId={hospitalId} />
                  )}
                  {to === '/admin/approvals' && role === 'admin' && (
                    <AdminPendingBadge />
                  )}
                  {to === '/admin/reservations' && role === 'admin' && (
                    <AdminReservationsBadge />
                  )}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      {/* Main */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-6 animate-fade-up">
        {children}
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-slate-400 py-4" style={{ borderTop: '1px solid rgba(13,148,136,0.08)' }}>
        © 2026 せとむすび
      </footer>
    </div>
  )
}

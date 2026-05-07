import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import OnboardingModal from './OnboardingModal'

type NavItem = { to: string; label: string; icon: string }

const NAV_BUSINESS: NavItem[] = [
  { to: '/business/calendar', label: 'カレンダー', icon: '📅' },
  { to: '/business/reservations', label: '予約管理', icon: '✅' },
  { to: '/business/introduction', label: '紹介・PR', icon: '📝' },
  { to: '/business/profile', label: '設定', icon: '⚙️' },
]

const NAV_MSW: NavItem[] = [
  { to: '/msw/search', label: '空き検索', icon: '🔍' },
  { to: '/msw/reservations', label: '予約一覧', icon: '📋' },
  { to: '/msw/businesses', label: '事業所一覧', icon: '🏢' },
  { to: '/msw/favorites', label: 'お気に入り', icon: '⭐' },
  { to: '/msw/contacts', label: '担当者管理', icon: '👤' },
  { to: '/msw/profile', label: '病院情報', icon: '🏥' },
]

const NAV_ADMIN: NavItem[] = [
  { to: '/admin/approvals', label: '事業所承認', icon: '🛡️' },
  { to: '/admin/reservations', label: '予約一覧', icon: '📋' },
  { to: '/admin/stats', label: '統計', icon: '📊' },
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
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  if (count === 0) return null
  return (
    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
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
      .channel(`pending-badge-${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `business_id=eq.${businessId}`,
        },
        load,
      )
      .subscribe()
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [businessId])

  if (count === 0) return null
  return (
    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

function OfflineBanner() {
  const [offline, setOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="bg-amber-500 px-4 py-1.5 text-center text-xs font-medium text-white">
      オフライン中です。通信が復旧すると自動で最新状態に更新されます。
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
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [])

  if (count === 0) return null
  return (
    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white animate-pulse">
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
      .channel(`msw-pending-badge-${hospitalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'reservations',
          filter: `hospital_id=eq.${hospitalId}`,
        },
        load,
      )
      .subscribe()
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [hospitalId])

  if (count === 0) return null
  return (
    <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white animate-pulse">
      {count > 9 ? '9+' : count}
    </span>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, role, businessId, businessName, hospitalId, hospitalName, loading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)

  const navItems = role === 'business' ? NAV_BUSINESS
    : role === 'msw' ? NAV_MSW
    : role === 'admin' ? NAV_ADMIN
    : []

  const roleLabel = role === 'business' ? '事業所'
    : role === 'msw' ? 'MSW'
    : role === 'admin' ? '管理者'
    : ''

  const roleBgClass = role === 'business'
    ? 'bg-teal-600 text-white'
    : role === 'msw'
      ? 'bg-sky-600 text-white'
      : role === 'admin'
        ? 'bg-violet-600 text-white'
        : 'bg-slate-100 text-slate-600'

  const onboardingRole = role === 'business' || role === 'msw' ? role : null
  const onboardingStorageKey = onboardingRole && user
    ? `setomusubi:onboarding-dismissed:${user.id}`
    : null

  useEffect(() => {
    if (loading) return

    if (!user || !onboardingRole || !onboardingStorageKey) {
      setShowOnboarding(false)
      return
    }

    const dismissed = window.localStorage.getItem(onboardingStorageKey)
    setShowOnboarding(!dismissed)
  }, [loading, onboardingRole, onboardingStorageKey, user])

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const handleCloseOnboarding = () => {
    if (onboardingStorageKey) {
      window.localStorage.setItem(onboardingStorageKey, '1')
    }
    setShowOnboarding(false)
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: 'linear-gradient(135deg, #f0f9f8 0%, #e8f5f3 50%, #f0f4ff 100%)' }}
    >
      <OfflineBanner />

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
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-sm font-black text-white shadow-sm">
              結
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-lg font-black tracking-tight text-teal-700 leading-none">せとむすび</span>
              {(businessName || hospitalName) && (
                <span className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5 truncate max-w-[140px]">
                  {businessName ?? hospitalName}
                </span>
              )}
            </div>
            {roleLabel && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide ${roleBgClass}`}>
                {roleLabel}
              </span>
            )}
          </Link>

          <div className="flex items-center gap-2">
            {onboardingRole && (
              <button
                type="button"
                onClick={() => setShowOnboarding(true)}
                className="flex items-center gap-1 rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-100"
              >
                <span>❔</span>
                <span>使い方</span>
              </button>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <span>↗</span>
              <span>ログアウト</span>
            </button>
          </div>
        </div>

        {navItems.length > 0 && (
          <nav className="mx-auto flex max-w-4xl gap-1 overflow-x-auto px-4 pb-2 scrollbar-none">
            {navItems.map(({ to, label, icon }) => {
              const active = location.pathname.startsWith(to)
              const isReservationsNav = to === '/business/reservations'

              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                    active
                      ? 'bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-sm'
                      : 'text-slate-500 hover:bg-teal-50 hover:text-teal-700'
                  }`}
                >
                  <span className="text-base leading-none">{icon}</span>
                  <span>{label}</span>
                  {isReservationsNav && businessId && <PendingBadge businessId={businessId} />}
                  {to === '/msw/reservations' && hospitalId && <MswPendingBadge hospitalId={hospitalId} />}
                  {to === '/admin/approvals' && role === 'admin' && <AdminPendingBadge />}
                  {to === '/admin/reservations' && role === 'admin' && <AdminReservationsBadge />}
                </Link>
              )
            })}
          </nav>
        )}
      </header>

      <main className="mx-auto flex-1 w-full max-w-4xl px-4 py-6 animate-fade-up">
        {children}
      </main>

      {showOnboarding && onboardingRole && (
        <OnboardingModal role={onboardingRole} onClose={handleCloseOnboarding} />
      )}

      <footer
        className="py-4 text-center text-xs text-slate-400"
        style={{ borderTop: '1px solid rgba(13,148,136,0.08)' }}
      >
        © 2026 せとむすび
      </footer>
    </div>
  )
}

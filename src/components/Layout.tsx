import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import OnboardingModal from './OnboardingModal'

type NavItem = { to: string; label: string; icon: string }
type AppNotif = { title: string; body: string; type: 'new_reservation' | 'approved' | 'rejected' }

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
    <span className="relative ml-1 inline-flex items-center justify-center">
      <span className="absolute h-5 w-5 rounded-full bg-red-400 animate-ping opacity-60" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        {count > 9 ? '9+' : count}
      </span>
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
    <span className="relative ml-1 inline-flex items-center justify-center">
      <span className="absolute h-5 w-5 rounded-full bg-red-400 animate-ping opacity-60" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        {count > 9 ? '9+' : count}
      </span>
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
    <span className="relative ml-1 inline-flex items-center justify-center">
      <span className="absolute h-5 w-5 rounded-full bg-red-400 animate-ping opacity-60" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
        {count > 9 ? '9+' : count}
      </span>
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
    <span className="relative ml-1 inline-flex items-center justify-center">
      <span className="absolute h-5 w-5 rounded-full bg-amber-400 animate-ping opacity-60" />
      <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
        {count > 9 ? '9+' : count}
      </span>
    </span>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, role, businessId, businessName, hospitalId, hospitalName, loading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [notif, setNotif] = useState<AppNotif | null>(null)
  const [notifVisible, setNotifVisible] = useState(false)
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNotif = useCallback((n: AppNotif) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    setNotif(n)
    setNotifVisible(false)
    requestAnimationFrame(() => requestAnimationFrame(() => setNotifVisible(true)))
    notifTimerRef.current = setTimeout(() => {
      setNotifVisible(false)
      setTimeout(() => setNotif(null), 350)
    }, 6000)
  }, [])

  const closeNotif = useCallback(() => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    setNotifVisible(false)
    setTimeout(() => setNotif(null), 350)
  }, [])

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

  useEffect(() => {
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!businessId || role !== 'business') return
    let isInitialLoad = true
    const timer = setTimeout(() => { isInitialLoad = false }, 1500)
    const channel = supabase
      .channel('notif-business-' + businessId)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'reservations',
          filter: 'business_id=eq.' + businessId,
        },
        (payload: Record<string, unknown>) => {
          if (isInitialLoad) return
          const row = payload.new as Record<string, unknown>
          showNotif({
            title: '新しい予約申請が届きました',
            body: String(row.patient_name ?? '患者') + '様からの予約申請',
            type: 'new_reservation',
          })
        },
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [businessId, role, showNotif])

  useEffect(() => {
    if (!hospitalId || role !== 'msw') return
    let isInitialLoad = true
    const timer = setTimeout(() => { isInitialLoad = false }, 1500)
    const channel = supabase
      .channel('notif-msw-' + hospitalId)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reservations',
          filter: 'hospital_id=eq.' + hospitalId,
        },
        (payload: Record<string, unknown>) => {
          if (isInitialLoad) return
          const row = payload.new as Record<string, unknown>
          const name = String(row.patient_name ?? '患者')
          if (row.status === 'confirmed') {
            showNotif({ title: '予約が承認されました', body: name + '様の予約が確定しました', type: 'approved' })
          } else if (row.status === 'rejected') {
            showNotif({ title: '予約が却下されました', body: name + '様の予約申請が却下されました', type: 'rejected' })
          }
        },
      )
      .subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [hospitalId, role, showNotif])

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
      {notif && (
        <div
          className={'fixed top-4 left-1/2 z-[100] w-80 max-w-[calc(100vw-2rem)] transition-all duration-300 ' + (notifVisible ? 'opacity-100 -translate-x-1/2 translate-y-0' : 'opacity-0 -translate-x-1/2 -translate-y-3 pointer-events-none')}
          style={{ left: '50%' }}
        >
          <div className={'overflow-hidden rounded-2xl border shadow-xl ' + (notif.type === 'new_reservation' ? 'border-teal-200 bg-teal-50' : notif.type === 'approved' ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50')}>
            <div className={'h-1 w-full ' + (notif.type === 'new_reservation' ? 'bg-teal-500' : notif.type === 'approved' ? 'bg-emerald-500' : 'bg-amber-500')} />
            <div className="flex items-start gap-3 p-4">
              <span className="mt-0.5 text-2xl leading-none">{notif.type === 'new_reservation' ? '🔔' : notif.type === 'approved' ? '✅' : '⚠️'}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold leading-snug text-slate-800">{notif.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{notif.body}</p>
              </div>
              <button type="button" onClick={closeNotif} className="-mt-0.5 text-xl leading-none text-slate-400 hover:text-slate-600">×</button>
            </div>
          </div>
        </div>
      )}

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
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold tracking-tight text-teal-600">せとむすび</span>
              {(businessName || hospitalName) && (
                <>
                  <span className="text-slate-300 text-xs">|</span>
                  <span className="text-lg font-black text-slate-800 truncate max-w-[200px]">
                    {businessName ?? hospitalName}
                  </span>
                </>
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

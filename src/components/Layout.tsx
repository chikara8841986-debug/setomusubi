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
  { to: '/business/billing', label: 'ご請求', icon: '💳' },
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
  { to: '/admin/billing', label: '課金管理', icon: '💰' },
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

function PendingBadge({
  businessId,
  onNew,
  onMount,
}: {
  businessId: string
  onNew?: (name: string) => void
  onMount?: (count: number) => void
}) {
  const [count, setCount] = useState(0)
  const didMount = useRef(false)
  const onMountRef = useRef(onMount)
  useEffect(() => { onMountRef.current = onMount }, [onMount])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const { count: c } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'pending')
      if (mounted) {
        setCount(c ?? 0)
        if (!didMount.current) {
          didMount.current = true
          if ((c ?? 0) > 0) onMountRef.current?.(c ?? 0)
        }
      }
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
        (payload) => {
          const p = payload as { eventType?: string; new?: Record<string, unknown> }
          if (p.eventType === 'INSERT') {
            onNew?.(String(p.new?.patient_name ?? '患者'))
          }
          load()
        },
      )
      .subscribe()
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [businessId, onNew])

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

function MswPendingBadge({
  hospitalId,
  onStatusChange,
  onMount,
  confirmedSince,
}: {
  hospitalId: string
  onStatusChange?: (status: 'confirmed' | 'rejected', name: string) => void
  onMount?: (pendingCount: number, confirmedCount: number, rejectedCount: number) => void
  confirmedSince: string
}) {
  const [count, setCount] = useState(0)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const didMount = useRef(false)
  const onMountRef = useRef(onMount)
  useEffect(() => { onMountRef.current = onMount }, [onMount])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      const since = confirmedSince || '1970-01-01T00:00:00.000Z'
      const [{ count: pending }, { count: confirmed }, { count: rejected }] = await Promise.all([
        supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('hospital_id', hospitalId)
          .eq('status', 'pending'),
        supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('hospital_id', hospitalId)
          .eq('status', 'confirmed')
          .gt('updated_at', since),
        supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('hospital_id', hospitalId)
          .eq('status', 'rejected')
          .gt('updated_at', since),
      ])
      if (mounted) {
        setCount(pending ?? 0)
        setConfirmedCount(confirmed ?? 0)
        setRejectedCount(rejected ?? 0)
        if (!didMount.current) {
          didMount.current = true
          onMountRef.current?.(pending ?? 0, confirmed ?? 0, rejected ?? 0)
        }
      }
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
        (payload) => {
          const p = payload as {
            eventType?: string
            new?: Record<string, unknown>
            old?: Record<string, unknown>
          }
          if (p.eventType === 'UPDATE') {
            const ns = String(p.new?.status ?? '')
            const os = String(p.old?.status ?? '')
            // REPLICA IDENTITY FULL により old.status が取れる
            // 万一 old が空でも confirmed/rejected なら通知する
            const wasStatusChange = os === 'pending' || os === ''
            if (wasStatusChange && (ns === 'confirmed' || ns === 'rejected')) {
              onStatusChange?.(ns as 'confirmed' | 'rejected', String(p.new?.patient_name ?? '患者'))
              if (ns === 'confirmed') setConfirmedCount((prev) => prev + 1)
              if (ns === 'rejected') setRejectedCount((prev) => prev + 1)
            }
          }
          load()
        },
      )
      .subscribe()
    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [hospitalId, onStatusChange, confirmedSince])

  if (count === 0 && confirmedCount === 0 && rejectedCount === 0) return null
  return (
    <>
      {count > 0 && (
        <span className="relative ml-1 inline-flex items-center justify-center">
          <span className="absolute h-5 w-5 rounded-full bg-amber-400 animate-ping opacity-60" />
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
            {count > 9 ? '9+' : count}
          </span>
        </span>
      )}
      {confirmedCount > 0 && (
        <span className="relative ml-1 inline-flex items-center justify-center">
          <span className="absolute h-5 w-5 rounded-full bg-emerald-400 animate-ping opacity-60" />
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
            {confirmedCount > 9 ? '9+' : confirmedCount}
          </span>
        </span>
      )}
      {rejectedCount > 0 && (
        <span className="relative ml-1 inline-flex items-center justify-center">
          <span className="absolute h-5 w-5 rounded-full bg-red-400 animate-ping opacity-60" />
          <span className="relative inline-flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {rejectedCount > 9 ? '9+' : rejectedCount}
          </span>
        </span>
      )}
    </>
  )
}

/** 事業所向け: サブスク未登録・支払い遅延のとき上部に警告バナーを表示 */
function BillingBanner({ businessId }: { businessId: string }) {
  const [status, setStatus] = useState<string>('none')
  const location = useLocation()

  useEffect(() => {
    let mounted = true
    supabase
      .from('businesses')
      .select('subscription_status')
      .eq('id', businessId)
      .single()
      .then(({ data }) => {
        if (mounted && data) setStatus(data.subscription_status ?? 'none')
      })
    return () => { mounted = false }
  }, [businessId])

  // 請求ページ自体では表示しない
  if (location.pathname.startsWith('/business/billing')) return null
  if (status === 'active' || status === 'trialing') return null

  const isPastDue = status === 'past_due'
  return (
    <div className={`px-3 py-2 text-[13px] leading-5 flex items-center justify-between gap-3 border-b ${
      isPastDue
        ? 'bg-rose-50 text-rose-900 border-rose-100'
        : 'bg-amber-50 text-amber-900 border-amber-100'
    }`}>
      <span>{isPastDue ? '⚠️ お支払いが確認できていません。' : '📢 プランに未登録のため、検索結果に掲載されていません。'}</span>
      <Link to="/business/billing" className="whitespace-nowrap underline font-semibold hover:opacity-80 shrink-0">
        {isPastDue ? '支払い方法を確認する' : '掲載を開始する'}
      </Link>
    </div>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, role, businessId, businessName, hospitalId, hospitalName, loading, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [notif, setNotif] = useState<AppNotif | null>(null)
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notifTypeRef = useRef<string | null>(null)

  // MSW承認通知の「既読」管理: localStorage に最終確認時刻を保存
  const [mswConfirmedSince, setMswConfirmedSince] = useState('')
  useEffect(() => {
    if (!hospitalId) return
    const key = `setomusubi:msw:confirmed_seen:${hospitalId}`
    setMswConfirmedSince(localStorage.getItem(key) ?? '')
  }, [hospitalId])

  const markApprovedSeen = useCallback(() => {
    if (!hospitalId) return
    const key = `setomusubi:msw:confirmed_seen:${hospitalId}`
    const now = new Date().toISOString()
    localStorage.setItem(key, now)
    setMswConfirmedSince(now)
  }, [hospitalId])

  const showNotif = useCallback((n: AppNotif) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    notifTypeRef.current = n.type
    setNotif(n)
    notifTimerRef.current = setTimeout(() => {
      // 承認・却下どちらのポップアップも閉じたら「既読」にする
      if (notifTypeRef.current === 'approved' || notifTypeRef.current === 'rejected') markApprovedSeen()
      notifTypeRef.current = null
      setNotif(null)
    }, 6000)
  }, [markApprovedSeen])

  const closeNotif = useCallback(() => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current)
    if (notifTypeRef.current === 'approved' || notifTypeRef.current === 'rejected') markApprovedSeen()
    notifTypeRef.current = null
    setNotif(null)
  }, [markApprovedSeen])

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
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-80 max-w-[calc(100vw-2rem)] animate-slide-down">
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
      {role === 'business' && businessId && <BillingBanner businessId={businessId} />}

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
                  {isReservationsNav && businessId && (
                    <PendingBadge
                      businessId={businessId}
                      onNew={(name) => showNotif({ title: '新しい予約申請が届きました', body: name + '様からの予約申請が入りました', type: 'new_reservation' })}
                      onMount={(c) => showNotif({ title: `未承認の予約申請が${c}件あります`, body: '予約管理から確認・承認してください', type: 'new_reservation' })}
                    />
                  )}
                  {to === '/msw/reservations' && hospitalId && (
                    <MswPendingBadge
                      hospitalId={hospitalId}
                      confirmedSince={mswConfirmedSince}
                      onStatusChange={(status, name) =>
                        showNotif({
                          title: status === 'confirmed' ? '予約が承認されました' : '予約が承認されませんでした',
                          body: name + '様の予約が' + (status === 'confirmed' ? '承認' : '非承認') + 'になりました',
                          type: status === 'confirmed' ? 'approved' : 'rejected',
                        })
                      }
                      onMount={(pending, confirmed, rejected) => {
                        if (confirmed > 0 && rejected > 0) {
                          showNotif({ title: `${confirmed}件承認・${rejected}件非承認があります`, body: '予約一覧から内容を確認してください', type: 'approved' })
                        } else if (confirmed > 0) {
                          showNotif({ title: `${confirmed}件の予約が承認されています`, body: '予約一覧から確認してください', type: 'approved' })
                        } else if (rejected > 0) {
                          showNotif({ title: `${rejected}件の予約が承認されませんでした`, body: '予約一覧から内容を確認してください', type: 'rejected' })
                        } else if (pending > 0) {
                          showNotif({ title: `${pending}件の申請が審査中です`, body: '予約一覧から進捗を確認してください', type: 'new_reservation' })
                        }
                      }}
                    />
                  )}
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

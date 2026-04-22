import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { jstMonthRange, jstMonthLabel, jstTodayStr } from '../../lib/jst'

type StatBlock = {
  label: string
  value: number | string
  sub?: string
  icon: string
  bg: string
  iconBg: string
  valueColor: string
  href?: string
}

function LoadingCard() {
  return (
    <div className="rounded-2xl p-5 bg-white border border-slate-100">
      <div className="skeleton h-8 w-8 rounded-xl mb-3" />
      <div className="skeleton h-3 w-16 rounded mb-2" />
      <div className="skeleton h-8 w-12 rounded" />
    </div>
  )
}

export default function AdminStats() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [stats, setStats] = useState({
    totalApproved: 0,
    totalPending: 0,
    totalHospitals: 0,
    totalReservationsThisMonth: 0,
    totalReservationsLastMonth: 0,
    totalReservationsAllTime: 0,
    completedThisMonth: 0,
    cancelledThisMonth: 0,
    pendingRequestsNow: 0,
    confirmedToday: 0,
  })

  const load = async () => {
    setLoadError(false)
    const { start: thisMonthStart, end: thisMonthEnd } = jstMonthRange(0)
    const { start: lastMonthStart, end: lastMonthEnd } = jstMonthRange(-1)

    const results = await Promise.all([
      supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('approved', true),
      supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('approved', false),
      supabase.from('hospitals').select('*', { count: 'exact', head: true }),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .gte('reservation_date', thisMonthStart).lte('reservation_date', thisMonthEnd),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .gte('reservation_date', lastMonthStart).lte('reservation_date', lastMonthEnd),
      supabase.from('reservations').select('*', { count: 'exact', head: true }),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('reservation_date', thisMonthStart).lte('reservation_date', thisMonthEnd),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('status', 'cancelled')
        .gte('reservation_date', thisMonthStart).lte('reservation_date', thisMonthEnd),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('status', 'pending'),
      supabase.from('reservations').select('*', { count: 'exact', head: true })
        .eq('status', 'confirmed')
        .eq('reservation_date', jstTodayStr()),
    ])

    if (results.some(r => r.error)) { setLoadError(true); setLoading(false); return }

    const [
      { count: approved }, { count: pending }, { count: hospitals },
      { count: resThisMonth }, { count: resLastMonth }, { count: resAll },
      { count: completed }, { count: cancelled }, { count: pendingRequests },
      { count: confirmedTodayCount },
    ] = results

    setStats({
      totalApproved: approved ?? 0,
      totalPending: pending ?? 0,
      totalHospitals: hospitals ?? 0,
      totalReservationsThisMonth: resThisMonth ?? 0,
      totalReservationsLastMonth: resLastMonth ?? 0,
      totalReservationsAllTime: resAll ?? 0,
      completedThisMonth: completed ?? 0,
      cancelledThisMonth: cancelled ?? 0,
      pendingRequestsNow: pendingRequests ?? 0,
      confirmedToday: confirmedTodayCount ?? 0,
    })
    setLastUpdated(new Date())
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    load()
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const thisMonth = jstMonthLabel(0)
  const lastMonth = jstMonthLabel(-1)

  const blocks: StatBlock[] = [
    {
      label: '承認済み事業所', value: stats.totalApproved, sub: '社',
      icon: '🚗',
      bg: 'from-teal-50 to-white', iconBg: 'bg-teal-100', valueColor: 'text-teal-700',
      href: '/admin/approvals',
    },
    {
      label: '承認待ち事業所', value: stats.totalPending, sub: '社',
      icon: '⏳',
      bg: stats.totalPending > 0 ? 'from-amber-50 to-white' : 'from-slate-50 to-white',
      iconBg: stats.totalPending > 0 ? 'bg-amber-100' : 'bg-slate-100',
      valueColor: stats.totalPending > 0 ? 'text-amber-600' : 'text-slate-400',
      href: '/admin/approvals',
    },
    {
      label: '病院・MSW', value: stats.totalHospitals, sub: '病院',
      icon: '🏥',
      bg: 'from-sky-50 to-white', iconBg: 'bg-sky-100', valueColor: 'text-sky-700',
    },
    {
      label: `${thisMonth}の予約`, value: stats.totalReservationsThisMonth, sub: '件',
      icon: '📅',
      bg: 'from-violet-50 to-white', iconBg: 'bg-violet-100', valueColor: 'text-violet-700',
      href: '/admin/reservations',
    },
    {
      label: `${lastMonth}の予約`, value: stats.totalReservationsLastMonth, sub: '件',
      icon: '📆',
      bg: 'from-slate-50 to-white', iconBg: 'bg-slate-100', valueColor: 'text-slate-500',
      href: '/admin/reservations',
    },
    {
      label: '累計予約', value: stats.totalReservationsAllTime, sub: '件',
      icon: '🏆',
      bg: 'from-indigo-50 to-white', iconBg: 'bg-indigo-100', valueColor: 'text-indigo-700',
      href: '/admin/reservations',
    },
    {
      label: `${thisMonth}完了`, value: stats.completedThisMonth, sub: '件',
      icon: '✅',
      bg: 'from-emerald-50 to-white', iconBg: 'bg-emerald-100', valueColor: 'text-emerald-700',
      href: '/admin/reservations',
    },
    {
      label: `${thisMonth}キャンセル`, value: stats.cancelledThisMonth, sub: '件',
      icon: '🔄',
      bg: stats.cancelledThisMonth > 0 ? 'from-orange-50 to-white' : 'from-slate-50 to-white',
      iconBg: stats.cancelledThisMonth > 0 ? 'bg-orange-100' : 'bg-slate-100',
      valueColor: stats.cancelledThisMonth > 0 ? 'text-orange-600' : 'text-slate-400',
      href: '/admin/reservations',
    },
    {
      label: '仮予約申請中', value: stats.pendingRequestsNow, sub: '件',
      icon: '🔔',
      bg: stats.pendingRequestsNow > 0 ? 'from-red-50 to-white' : 'from-slate-50 to-white',
      iconBg: stats.pendingRequestsNow > 0 ? 'bg-red-100' : 'bg-slate-100',
      valueColor: stats.pendingRequestsNow > 0 ? 'text-red-600' : 'text-slate-400',
      href: '/admin/reservations',
    },
    {
      label: '今日の確定予約', value: stats.confirmedToday, sub: '件',
      icon: '🎯',
      bg: stats.confirmedToday > 0 ? 'from-teal-50 to-white' : 'from-slate-50 to-white',
      iconBg: stats.confirmedToday > 0 ? 'bg-teal-100' : 'bg-slate-100',
      valueColor: stats.confirmedToday > 0 ? 'text-teal-700' : 'text-slate-400',
      href: '/admin/reservations',
    },
  ]

  if (loadError) return (
    <div className="card text-center py-12">
      <div className="text-4xl mb-3">😵</div>
      <p className="text-gray-500 text-sm mb-4">データの取得に失敗しました</p>
      <button onClick={load} className="btn-secondary text-sm">再試行する</button>
    </div>
  )

  return (
    <div>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-xl font-black text-slate-800">📊 統計ダッシュボード</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            プラットフォーム全体の利用状況
            {lastUpdated && (
              <span className="ml-2 text-teal-500">
                · {lastUpdated.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })} 更新
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); load() }}
          disabled={refreshing}
          className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
            refreshing
              ? 'text-slate-400 cursor-not-allowed'
              : 'text-teal-600 hover:text-teal-800 hover:bg-teal-50'
          }`}
        >
          {refreshing ? <span className="spinner" /> : '↻ 更新'}
        </button>
      </div>

      {/* アクションアラート */}
      {(stats.totalPending > 0 || stats.pendingRequestsNow > 0) && (
        <div className="space-y-2 my-4">
          {stats.totalPending > 0 && (
            <button
              onClick={() => navigate('/admin/approvals')}
              className="w-full flex items-center justify-between bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl px-4 py-3 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">⏳</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">事業所の承認申請が {stats.totalPending}件 あります</p>
                  <p className="text-xs text-amber-600 mt-0.5">登録申請を審査してください</p>
                </div>
              </div>
              <span className="text-amber-500 font-bold text-xl group-hover:translate-x-1 transition-transform">›</span>
            </button>
          )}
          {stats.pendingRequestsNow > 0 && (
            <button
              onClick={() => navigate('/admin/reservations')}
              className="w-full flex items-center justify-between bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-xl px-4 py-3 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔔</span>
                <div>
                  <p className="text-sm font-semibold text-red-800">未対応の仮予約申請が {stats.pendingRequestsNow}件 あります</p>
                  <p className="text-xs text-red-600 mt-0.5">事業所に確認を促してください</p>
                </div>
              </div>
              <span className="text-red-500 font-bold text-xl group-hover:translate-x-1 transition-transform">›</span>
            </button>
          )}
        </div>
      )}

      {/* 統計カードグリッド */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-5">
        {loading
          ? Array.from({ length: 10 }).map((_, i) => <LoadingCard key={i} />)
          : blocks.map(b => {
            const Tag = b.href ? 'button' : 'div'
            return (
              <Tag
                key={b.label}
                onClick={b.href ? () => navigate(b.href!) : undefined}
                className={`rounded-2xl p-4 text-center bg-gradient-to-br ${b.bg} border border-white/80 transition-all duration-200 ${
                  b.href ? 'cursor-pointer hover:-translate-y-1 hover:shadow-md active:translate-y-0' : ''
                }`}
                style={{ boxShadow: '0 1px 4px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)' }}
              >
                <div className={`w-9 h-9 ${b.iconBg} rounded-xl flex items-center justify-center text-xl mx-auto mb-2`}>
                  {b.icon}
                </div>
                <p className="text-[11px] text-slate-500 font-medium leading-tight mb-1">{b.label}</p>
                <p className={`text-3xl font-black ${b.valueColor} leading-none`}>{b.value}</p>
                {b.sub && <p className="text-[10px] text-slate-400 mt-0.5">{b.sub}</p>}
              </Tag>
            )
          })
        }
      </div>

      {/* 前月比バー */}
      {!loading && stats.totalReservationsThisMonth > 0 && stats.totalReservationsLastMonth > 0 && (
        <div className="card mt-2">
          <h2 className="text-sm font-bold text-slate-700 mb-3">📉 前月比</h2>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-teal-400 to-teal-600 h-2.5 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, (stats.totalReservationsThisMonth / Math.max(stats.totalReservationsLastMonth, 1)) * 100)}%`
                }}
              />
            </div>
            <span className={`text-sm font-black ${
              stats.totalReservationsThisMonth >= stats.totalReservationsLastMonth
                ? 'text-emerald-600' : 'text-red-500'
            }`}>
              {stats.totalReservationsLastMonth > 0
                ? `${stats.totalReservationsThisMonth >= stats.totalReservationsLastMonth ? '+' : ''}${Math.round(
                    ((stats.totalReservationsThisMonth - stats.totalReservationsLastMonth) / stats.totalReservationsLastMonth) * 100
                  )}%`
                : '—'
              }
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1.5">
            {lastMonth}: <span className="font-semibold text-slate-500">{stats.totalReservationsLastMonth}件</span>
            {' → '}
            {thisMonth}: <span className="font-semibold text-teal-600">{stats.totalReservationsThisMonth}件</span>
          </p>
        </div>
      )}

      {/* 完了・キャンセル率 */}
      {!loading && (stats.completedThisMonth > 0 || stats.cancelledThisMonth > 0) && (
        <div className="card mt-3">
          <h2 className="text-sm font-bold text-slate-700 mb-3">🎯 {thisMonth} 完了・キャンセル率</h2>
          {(() => {
            const total = stats.completedThisMonth + stats.cancelledThisMonth
            const completedPct = total > 0 ? Math.round((stats.completedThisMonth / total) * 100) : 0
            const cancelledPct = total > 0 ? Math.round((stats.cancelledThisMonth / total) * 100) : 0
            return (
              <>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 mb-3">
                  <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 h-2.5 transition-all duration-700" style={{ width: `${completedPct}%` }} />
                  <div className="bg-gradient-to-r from-amber-300 to-amber-400 h-2.5 transition-all duration-700" style={{ width: `${cancelledPct}%` }} />
                </div>
                <div className="flex gap-5 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span>完了 <strong className="text-emerald-700">{stats.completedThisMonth}件</strong> ({completedPct}%)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                    <span>キャンセル <strong className="text-amber-700">{stats.cancelledThisMonth}件</strong> ({cancelledPct}%)</span>
                  </span>
                </div>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}

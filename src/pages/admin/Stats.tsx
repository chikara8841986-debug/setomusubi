import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { jstMonthRange, jstMonthLabel } from '../../lib/jst'

type StatBlock = {
  label: string
  value: number | string
  sub?: string
  color: string
  href?: string
}

export default function AdminStats() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
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
  })

  const load = async () => {
    setLoadError(false)
    // JST基準で月の範囲を計算
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
    ])

    if (results.some(r => r.error)) { setLoadError(true); setLoading(false); return }

    const [
      { count: approved }, { count: pending }, { count: hospitals },
      { count: resThisMonth }, { count: resLastMonth }, { count: resAll },
      { count: completed }, { count: cancelled }, { count: pendingRequests },
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
    })
    setLastUpdated(new Date())
    setLoading(false)
  }

  useEffect(() => {
    load()
    // 5分おきに自動更新
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const thisMonth = jstMonthLabel(0)
  const lastMonth = jstMonthLabel(-1)

  const blocks: StatBlock[] = [
    { label: '承認済み事業所', value: stats.totalApproved, sub: '件', color: 'text-teal-600', href: '/admin/approvals' },
    { label: '承認待ち事業所', value: stats.totalPending, sub: '件', color: stats.totalPending > 0 ? 'text-red-500' : 'text-gray-500', href: '/admin/approvals' },
    { label: '病院・MSW', value: stats.totalHospitals, sub: '病院', color: 'text-green-600' },
    { label: `${thisMonth}の予約`, value: stats.totalReservationsThisMonth, sub: '件', color: 'text-teal-600', href: '/admin/reservations' },
    { label: `${lastMonth}の予約`, value: stats.totalReservationsLastMonth, sub: '件', color: 'text-gray-500', href: '/admin/reservations' },
    { label: '累計予約', value: stats.totalReservationsAllTime, sub: '件', color: 'text-indigo-600', href: '/admin/reservations' },
    { label: `${thisMonth}完了`, value: stats.completedThisMonth, sub: '件', color: 'text-green-600', href: '/admin/reservations' },
    { label: `${thisMonth}キャンセル`, value: stats.cancelledThisMonth, sub: '件', color: stats.cancelledThisMonth > 0 ? 'text-amber-600' : 'text-gray-400', href: '/admin/reservations' },
    { label: '仮予約申請中', value: stats.pendingRequestsNow, sub: '件', color: stats.pendingRequestsNow > 0 ? 'text-red-500' : 'text-gray-400', href: '/admin/reservations' },
  ]

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={load} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900">統計ダッシュボード</h1>
        <button onClick={load} className="text-xs text-teal-600 hover:text-teal-800 px-3 py-1.5 rounded-lg hover:bg-teal-50 transition-colors">↻ 更新</button>
      </div>
      <p className="text-xs text-gray-400 mb-6">
        プラットフォーム全体の利用状況
        {lastUpdated && (
          <span className="ml-2">
            ・最終更新: {lastUpdated.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </p>

      {/* Action alerts */}
      {(stats.totalPending > 0 || stats.pendingRequestsNow > 0) && (
        <div className="space-y-2 mb-5">
          {stats.totalPending > 0 && (
            <button
              onClick={() => navigate('/admin/approvals')}
              className="w-full flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 hover:bg-amber-100 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-amber-800">事業所の承認申請が{stats.totalPending}件あります</p>
                <p className="text-xs text-amber-600 mt-0.5">登録申請を審査してください</p>
              </div>
              <span className="text-amber-600 font-bold text-lg flex-shrink-0">›</span>
            </button>
          )}
          {stats.pendingRequestsNow > 0 && (
            <button
              onClick={() => navigate('/admin/reservations')}
              className="w-full flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3 hover:bg-red-100 transition-colors text-left"
            >
              <div>
                <p className="text-sm font-semibold text-red-800">未対応の仮予約申請が{stats.pendingRequestsNow}件あります</p>
                <p className="text-xs text-red-600 mt-0.5">事業所に確認を促してください</p>
              </div>
              <span className="text-red-600 font-bold text-lg flex-shrink-0">›</span>
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {blocks.map(b => b.href ? (
          <button key={b.label} onClick={() => navigate(b.href!)}
            className="card text-center py-5 hover:shadow-md hover:border-teal-200 transition-all cursor-pointer">
            <p className="text-xs text-gray-500 mb-1">{b.label}</p>
            <p className={`text-3xl font-bold ${b.color}`}>{b.value}</p>
            {b.sub && <p className="text-xs text-gray-400 mt-0.5">{b.sub}</p>}
          </button>
        ) : (
          <div key={b.label} className="card text-center py-5">
            <p className="text-xs text-gray-500 mb-1">{b.label}</p>
            <p className={`text-3xl font-bold ${b.color}`}>{b.value}</p>
            {b.sub && <p className="text-xs text-gray-400 mt-0.5">{b.sub}</p>}
          </div>
        ))}
      </div>

      {stats.totalReservationsThisMonth > 0 && stats.totalReservationsLastMonth > 0 && (
        <div className="card mt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">前月比</h2>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div
                className="bg-teal-500 h-3 rounded-full transition-all"
                style={{
                  width: `${Math.min(100, (stats.totalReservationsThisMonth / Math.max(stats.totalReservationsLastMonth, 1)) * 100)}%`
                }}
              />
            </div>
            <span className={`text-sm font-semibold ${
              stats.totalReservationsThisMonth >= stats.totalReservationsLastMonth
                ? 'text-green-600' : 'text-red-500'
            }`}>
              {stats.totalReservationsLastMonth > 0
                ? `${stats.totalReservationsThisMonth >= stats.totalReservationsLastMonth ? '+' : ''}${Math.round(
                    ((stats.totalReservationsThisMonth - stats.totalReservationsLastMonth) / stats.totalReservationsLastMonth) * 100
                  )}%`
                : '—'
              }
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {lastMonth}: {stats.totalReservationsLastMonth}件 → {thisMonth}: {stats.totalReservationsThisMonth}件
          </p>
        </div>
      )}

      {(stats.completedThisMonth > 0 || stats.cancelledThisMonth > 0) && (
        <div className="card mt-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{thisMonth} 完了・キャンセル率</h2>
          {(() => {
            const total = stats.completedThisMonth + stats.cancelledThisMonth
            const completedPct = total > 0 ? Math.round((stats.completedThisMonth / total) * 100) : 0
            const cancelledPct = total > 0 ? Math.round((stats.cancelledThisMonth / total) * 100) : 0
            return (
              <>
                <div className="flex h-3 rounded-full overflow-hidden bg-gray-100 mb-2">
                  <div className="bg-green-500 h-3 transition-all" style={{ width: `${completedPct}%` }} />
                  <div className="bg-amber-400 h-3 transition-all" style={{ width: `${cancelledPct}%` }} />
                </div>
                <div className="flex gap-4 text-xs text-gray-600">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
                    完了 {stats.completedThisMonth}件 ({completedPct}%)
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
                    キャンセル {stats.cancelledThisMonth}件 ({cancelledPct}%)
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

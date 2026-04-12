import { useState, useEffect } from 'react'
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'

type StatBlock = {
  label: string
  value: number | string
  sub?: string
  color: string
}

export default function AdminStats() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
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
    const now = new Date()
    const thisMonthStart = format(startOfMonth(now), 'yyyy-MM-dd')
    const thisMonthEnd = format(endOfMonth(now), 'yyyy-MM-dd')
    const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')
    const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd')

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
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const thisMonth = format(new Date(), 'M月', { locale: ja })
  const lastMonth = format(subMonths(new Date(), 1), 'M月', { locale: ja })

  const blocks: StatBlock[] = [
    { label: '承認済み事業所', value: stats.totalApproved, sub: '件', color: 'text-teal-600' },
    { label: '承認待ち事業所', value: stats.totalPending, sub: '件', color: stats.totalPending > 0 ? 'text-red-500' : 'text-gray-500' },
    { label: '病院・MSW', value: stats.totalHospitals, sub: '病院', color: 'text-green-600' },
    { label: `${thisMonth}の予約`, value: stats.totalReservationsThisMonth, sub: '件', color: 'text-teal-600' },
    { label: `${lastMonth}の予約`, value: stats.totalReservationsLastMonth, sub: '件', color: 'text-gray-500' },
    { label: '累計予約', value: stats.totalReservationsAllTime, sub: '件', color: 'text-indigo-600' },
    { label: `${thisMonth}完了`, value: stats.completedThisMonth, sub: '件', color: 'text-green-600' },
    { label: `${thisMonth}キャンセル`, value: stats.cancelledThisMonth, sub: '件', color: stats.cancelledThisMonth > 0 ? 'text-amber-600' : 'text-gray-400' },
    { label: '仮予約申請中', value: stats.pendingRequestsNow, sub: '件', color: stats.pendingRequestsNow > 0 ? 'text-red-500' : 'text-gray-400' },
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
      <p className="text-xs text-gray-400 mb-6">プラットフォーム全体の利用状況</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {blocks.map(b => (
          <div key={b.label} className="card text-center py-5">
            <p className="text-xs text-gray-500 mb-1">{b.label}</p>
            <p className={`text-3xl font-bold ${b.color}`}>{b.value}</p>
            {b.sub && <p className="text-xs text-gray-400 mt-0.5">{b.sub}</p>}
          </div>
        ))}
      </div>

      {stats.totalReservationsThisMonth > 0 && stats.totalReservationsLastMonth > 0 && (
        <div className="card">
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
    </div>
  )
}

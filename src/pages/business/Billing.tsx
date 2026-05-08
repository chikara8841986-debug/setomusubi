import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { SubscriptionStatus } from '../../types/database'

// ── 料金設定 ──────────────────────────────────────────
const MONTHLY_FEE   = 5_500  // 月額基本料（税込）
const PER_RES_FEE   =   300  // 予約1件あたり（税込）
const TRIAL_DAYS    =    30  // 無料トライアル日数

// ── ステータス表示定義 ────────────────────────────────
const STATUS_CONFIG: Record<
  SubscriptionStatus,
  { label: string; pill: string }
> = {
  none:     { label: '未登録',          pill: 'bg-slate-100 text-slate-600'    },
  trialing: { label: '無料トライアル中', pill: 'bg-blue-100 text-blue-700'     },
  active:   { label: '掲載中',          pill: 'bg-emerald-100 text-emerald-700'},
  past_due: { label: '支払い遅延',       pill: 'bg-red-100 text-red-700'       },
  canceled: { label: '解約済み',         pill: 'bg-orange-100 text-orange-700' },
}

type BillingRow = {
  id: string
  event_type: 'reservation_fee' | 'subscription'
  amount: number
  status: 'pending' | 'paid' | 'failed' | 'waived'
  created_at: string
  patient_name: string | null
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

function fmtYen(n: number) {
  return `¥${n.toLocaleString()}`
}

export default function Billing() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [businessId,   setBusinessId]   = useState<string | null>(null)
  const [status,       setStatus]       = useState<SubscriptionStatus>('none')
  const [periodEnd,    setPeriodEnd]    = useState<string | null>(null)
  const [trialEnd,     setTrialEnd]     = useState<string | null>(null)
  const [hasCustomer,  setHasCustomer]  = useState(false)
  const [events,       setEvents]       = useState<BillingRow[]>([])
  const [monthCount,   setMonthCount]   = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [portalBusy,   setPortalBusy]   = useState(false)

  // ─── Load ─────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    try {
      const { data: biz } = await supabase
        .from('businesses')
        .select(
          'id, stripe_customer_id, subscription_status, subscription_period_end, trial_ends_at'
        )
        .eq('user_id', user.id)
        .single()

      if (!biz) return
      setBusinessId(biz.id)
      setStatus((biz.subscription_status ?? 'none') as SubscriptionStatus)
      setPeriodEnd(biz.subscription_period_end ?? null)
      setTrialEnd(biz.trial_ends_at ?? null)
      setHasCustomer(!!biz.stripe_customer_id)

      // 直近20件の billing_events
      const { data: evtRaw } = await supabase
        .from('billing_events')
        .select(`
          id, event_type, amount, status, created_at,
          reservations ( patient_name )
        `)
        .eq('business_id', biz.id)
        .order('created_at', { ascending: false })
        .limit(20)

      setEvents(
        (evtRaw ?? []).map((e: any) => ({
          id: e.id,
          event_type: e.event_type,
          amount: e.amount,
          status: e.status,
          created_at: e.created_at,
          patient_name: e.reservations?.patient_name ?? null,
        }))
      )

      // 今月の確認済み予約件数（従量分の見積もり）
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .slice(0, 10)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString()
        .slice(0, 10)
      const { count } = await supabase
        .from('reservations')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('status', 'confirmed')
        .gte('reservation_date', from)
        .lte('reservation_date', to)
      setMonthCount(count ?? 0)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => { load() }, [load])

  // ─── Query param feedback ──────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') === 'success') {
      showToast('登録が完了しました！プランが有効になるまで少々お待ちください。', 'success')
      window.history.replaceState({}, '', window.location.pathname)
      load()
    } else if (params.get('billing') === 'canceled') {
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stripe Checkout ──────────────────────────────
  const handleCheckout = async () => {
    if (!businessId) return
    setCheckoutBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke(
        'create-checkout-session',
        { body: { business_id: businessId } }
      )
      if (error || !data?.url) throw error ?? new Error('URLが取得できませんでした')
      window.location.href = data.url
    } catch (e: any) {
      showToast(e?.message ?? '決済ページを開けませんでした', 'error')
      setCheckoutBusy(false)
    }
  }

  // ─── Stripe Portal ────────────────────────────────
  const handlePortal = async () => {
    if (!businessId) return
    setPortalBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke(
        'create-billing-portal-session',
        { body: { business_id: businessId } }
      )
      if (error || !data?.url) throw error ?? new Error('URLが取得できませんでした')
      window.location.href = data.url
    } catch (e: any) {
      showToast(e?.message ?? '管理ページを開けませんでした', 'error')
      setPortalBusy(false)
    }
  }

  // ─── Derived ──────────────────────────────────────
  const cfg = STATUS_CONFIG[status]
  const isSubscribed   = status === 'active' || status === 'trialing'
  const needsRegister  = status === 'none' || status === 'canceled'
  const isPastDue      = status === 'past_due'
  const canOpenPortal  = (isSubscribed || isPastDue) && hasCustomer

  const now = new Date()
  const monthLabel = `${now.getFullYear()}年${now.getMonth() + 1}月`
  const estimatedTotal = MONTHLY_FEE + monthCount * PER_RES_FEE

  // ─── Render ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <span className="spinner" />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 sm:py-8 space-y-5">
      <h1 className="text-xl font-bold text-slate-800">ご請求・プラン管理</h1>

      {/* ── プラン状態カード ── */}
      <div className="card space-y-5">

        {/* 状態ヘッダ */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">現在の状態</p>
              <h2 className="text-lg font-semibold text-slate-900">{cfg.label}</h2>
            </div>
            <span className={`shrink-0 text-xs font-bold px-3 py-1 rounded-full ${cfg.pill}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            {status === 'none' &&
              `まだ掲載は開始されていません。登録後すぐに検索結果に掲載されます。最初の${TRIAL_DAYS}日間は無料です。`}
            {status === 'trialing' && trialEnd &&
              `無料トライアル中です。終了日は ${fmtDate(trialEnd)} です。終了後は自動的に有料プランへ移行します。`}
            {status === 'active' && periodEnd &&
              `掲載中です。次回更新日は ${fmtDate(periodEnd)} です。`}
            {status === 'past_due' &&
              'お支払いの確認が必要です。下のボタンから支払い方法を確認・更新してください。確認後も掲載状態は維持されます。'}
            {status === 'canceled' &&
              '掲載は停止中です。再登録後すぐに検索結果への掲載が再開されます。'}
          </p>
        </div>

        {/* CTA */}
        {needsRegister && (
          <div className="space-y-2">
            <button
              onClick={handleCheckout}
              disabled={checkoutBusy}
              className="btn-primary w-full"
            >
              {checkoutBusy
                ? 'Stripeへ移動しています…'
                : `${TRIAL_DAYS}日間無料で掲載を始める`}
            </button>
            <p className="text-xs text-slate-400 text-center">
              外部の決済画面 Stripe に移動します。せとむすびがカード情報を保持することはありません。
            </p>
          </div>
        )}
        {canOpenPortal && (
          <div className="space-y-2">
            <button
              onClick={handlePortal}
              disabled={portalBusy}
              className="btn-secondary w-full"
            >
              {portalBusy
                ? '管理画面を開いています…'
                : '支払い方法・請求情報を確認する'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              Stripe の安全な管理画面に移動します。プランの解約もこちらから行えます。
            </p>
          </div>
        )}
        {isPastDue && !hasCustomer && (
          <div className="space-y-2">
            <button
              onClick={handleCheckout}
              disabled={checkoutBusy}
              className="btn-primary w-full"
            >
              {checkoutBusy ? 'Stripeへ移動しています…' : '支払い方法を更新する'}
            </button>
            <p className="text-xs text-slate-400 text-center">
              外部の決済画面 Stripe に移動します。
            </p>
          </div>
        )}

        {/* 料金表 */}
        <div className="rounded-xl bg-slate-50 p-4 space-y-2.5">
          <p className="text-sm font-semibold text-slate-700">せとむすび 標準プラン</p>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 text-sm text-slate-600 items-baseline">
            <span>月額基本料</span>
            <span className="font-medium text-slate-800 text-right">
              {fmtYen(MONTHLY_FEE)}<span className="text-xs text-slate-400 ml-0.5">/月</span>
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 text-sm text-slate-600 items-baseline">
            <span>予約承認1件あたり（従量）</span>
            <span className="font-medium text-slate-800 text-right">
              {fmtYen(PER_RES_FEE)}<span className="text-xs text-slate-400 ml-0.5">/件</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 pt-1">※ 価格はすべて税込です</p>
        </div>
      </div>

      {/* ── 今月の利用状況 ── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-700">{monthLabel}の利用状況（推定）</h2>
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 border-b border-slate-100 text-sm items-baseline">
            <span className="text-slate-600">月額基本料</span>
            <span className="font-medium text-slate-800 text-right">{fmtYen(MONTHLY_FEE)}</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 py-2.5 border-b border-slate-100 text-sm items-baseline">
            <span className="text-slate-600">
              予約承認 {monthCount}件 × {fmtYen(PER_RES_FEE)}
            </span>
            <span className="font-medium text-slate-800 text-right">
              {fmtYen(monthCount * PER_RES_FEE)}
            </span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 py-3 text-base font-bold items-baseline">
            <span className="text-slate-700">合計（推定）</span>
            <span className="text-teal-700 text-lg text-right">{fmtYen(estimatedTotal)}</span>
          </div>
        </div>
        {!isSubscribed && (
          <p className="text-xs text-slate-400">
            ※ プランに登録後、請求が開始されます。トライアル期間中は課金されません。
          </p>
        )}
        <p className="text-xs text-slate-400">
          ※ 上記は当月の確認済み予約件数による推定です。実際の請求は Stripe 発行の請求書が正となります。
        </p>
      </div>

      {/* ── 請求履歴 ── */}
      {events.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">請求履歴</h2>
          <div className="divide-y divide-slate-100">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="py-3 text-sm sm:flex sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <p className="text-slate-700">
                    {evt.event_type === 'subscription'
                      ? '月額基本料'
                      : `予約料${evt.patient_name ? `（${evt.patient_name} 様）` : ''}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(evt.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="mt-1 sm:mt-0 flex items-center gap-3 sm:flex-col sm:items-end sm:gap-0.5">
                  <p className="font-medium text-slate-800">{fmtYen(evt.amount)}</p>
                  <span className={`text-xs font-medium ${
                    evt.status === 'paid'    ? 'text-emerald-600' :
                    evt.status === 'failed'  ? 'text-red-500'     :
                    evt.status === 'waived'  ? 'text-slate-400'   :
                    'text-amber-600'
                  }`}>
                    {evt.status === 'paid'   ? '支払済'  :
                     evt.status === 'failed' ? '失敗'    :
                     evt.status === 'waived' ? '免除'    : '処理中'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── フッター ── */}
      <div className="text-center space-y-1 pt-2">
        <p className="text-xs text-slate-400">
          ご請求・解約に関するお問い合わせは{' '}
          <a href="mailto:support@setomusubi.jp" className="text-teal-600 hover:underline">
            support@setomusubi.jp
          </a>{' '}
          までご連絡ください。
        </p>
        <p className="text-xs text-slate-400">
          決済はすべて{' '}
          <a
            href="https://stripe.com/jp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:underline"
          >
            Stripe
          </a>{' '}
          によって安全に処理されます。
        </p>
      </div>

      {/* ── 管理者リンク ── */}
      <div className="text-center">
        <Link to="/business/profile" className="text-xs text-slate-400 hover:text-slate-600">
          ← プロフィール設定に戻る
        </Link>
      </div>
    </div>
  )
}

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
  { label: string; pill: string; banner?: string }
> = {
  none: {
    label: '未登録',
    pill: 'bg-slate-100 text-slate-600',
    banner: '検索結果への掲載にはプランへの登録が必要です。',
  },
  trialing: {
    label: '無料トライアル中',
    pill: 'bg-blue-100 text-blue-700',
  },
  active: {
    label: '有効',
    pill: 'bg-emerald-100 text-emerald-700',
  },
  past_due: {
    label: '支払い遅延',
    pill: 'bg-red-100 text-red-700',
    banner: 'お支払いが確認できていません。Stripeポータルでご確認ください。',
  },
  canceled: {
    label: '解約済み',
    pill: 'bg-orange-100 text-orange-700',
    banner: 'プランが解約されています。再登録すると検索結果に再掲載されます。',
  },
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
      showToast({ type: 'success', message: '登録が完了しました！プランが有効になるまで少々お待ちください。' })
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
        { body: { business_id: businessId, return_url: window.location.href } }
      )
      if (error || !data?.url) throw error ?? new Error('URLが取得できませんでした')
      window.location.href = data.url
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message ?? '決済ページを開けませんでした' })
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
        { body: { business_id: businessId, return_url: window.location.href } }
      )
      if (error || !data?.url) throw error ?? new Error('URLが取得できませんでした')
      window.location.href = data.url
    } catch (e: any) {
      showToast({ type: 'error', message: e?.message ?? '管理ページを開けませんでした' })
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
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-xl font-bold text-slate-800">ご請求・プラン管理</h1>

      {/* ── ステータスバナー ── */}
      {cfg.banner && (
        <div className={`rounded-xl px-4 py-3 text-sm font-medium flex items-start gap-2 ${
          isPastDue
            ? 'bg-red-50 border border-red-200 text-red-700'
            : 'bg-amber-50 border border-amber-200 text-amber-800'
        }`}>
          <span className="text-base mt-0.5">{isPastDue ? '⚠️' : '📢'}</span>
          <span>{cfg.banner}</span>
        </div>
      )}

      {/* ── プラン情報カード ── */}
      <div className="card space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">現在のプラン</h2>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.pill}`}>
            {cfg.label}
          </span>
        </div>

        {/* 料金表 */}
        <div className="rounded-xl bg-slate-50 p-4 space-y-2.5">
          <p className="text-sm font-semibold text-slate-700">せとむすび 標準プラン</p>
          <div className="flex justify-between text-sm text-slate-600">
            <span>月額基本料</span>
            <span className="font-medium text-slate-800">
              {fmtYen(MONTHLY_FEE)}<span className="text-xs text-slate-400 ml-0.5">/月</span>
            </span>
          </div>
          <div className="flex justify-between text-sm text-slate-600">
            <span>予約承認1件あたり（従量）</span>
            <span className="font-medium text-slate-800">
              {fmtYen(PER_RES_FEE)}<span className="text-xs text-slate-400 ml-0.5">/件</span>
            </span>
          </div>
          <p className="text-xs text-slate-400 pt-1">※ 価格はすべて税込です</p>
        </div>

        {/* ステータス別メッセージ */}
        {status === 'trialing' && trialEnd && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
            🎉 無料トライアル中です。終了日：<strong>{fmtDate(trialEnd)}</strong>
            <br />
            <span className="text-xs">トライアル終了後は自動的に有料プランへ移行します。</span>
          </div>
        )}
        {status === 'active' && periodEnd && (
          <p className="text-sm text-slate-500">
            次回更新日：<strong className="text-slate-700">{fmtDate(periodEnd)}</strong>
          </p>
        )}
        {status === 'none' && (
          <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-sm text-sky-700">
            プランに登録すると、MSWの検索結果に掲載されます。
            <strong> 今すぐ登録で{TRIAL_DAYS}日間は無料</strong>でお試しいただけます。
          </div>
        )}
        {status === 'canceled' && (
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-sm text-orange-700">
            プランが解約されています。再登録後、検索結果への掲載が再開されます。
          </div>
        )}

        {/* CTA */}
        {needsRegister && (
          <button
            onClick={handleCheckout}
            disabled={checkoutBusy}
            className="btn-primary w-full"
          >
            {checkoutBusy
              ? <span className="spinner-sm" />
              : `${TRIAL_DAYS}日間無料トライアルを始める →`}
          </button>
        )}
        {canOpenPortal && (
          <button
            onClick={handlePortal}
            disabled={portalBusy}
            className="btn-secondary w-full"
          >
            {portalBusy
              ? <span className="spinner-sm" />
              : 'プランを管理・解約する（Stripe ポータル）'}
          </button>
        )}
        {isPastDue && !hasCustomer && (
          <button
            onClick={handleCheckout}
            disabled={checkoutBusy}
            className="btn-primary w-full"
          >
            {checkoutBusy ? <span className="spinner-sm" /> : '支払い方法を登録する →'}
          </button>
        )}
      </div>

      {/* ── 今月の利用状況 ── */}
      <div className="card space-y-4">
        <h2 className="font-semibold text-slate-700">{monthLabel}の利用状況（推定）</h2>
        <div className="space-y-1">
          <div className="flex justify-between py-2.5 border-b border-slate-100 text-sm">
            <span className="text-slate-600">月額基本料</span>
            <span className="font-medium text-slate-800">{fmtYen(MONTHLY_FEE)}</span>
          </div>
          <div className="flex justify-between py-2.5 border-b border-slate-100 text-sm">
            <span className="text-slate-600">
              予約承認件数 {monthCount}件 × {fmtYen(PER_RES_FEE)}
            </span>
            <span className="font-medium text-slate-800">
              {fmtYen(monthCount * PER_RES_FEE)}
            </span>
          </div>
          <div className="flex justify-between py-3 text-base font-bold">
            <span className="text-slate-700">合計（推定）</span>
            <span className="text-teal-700 text-lg">{fmtYen(estimatedTotal)}</span>
          </div>
        </div>
        {!isSubscribed && (
          <p className="text-xs text-slate-400">
            ※ プランに登録後、請求が開始されます。トライアル期間中は課金されません。
          </p>
        )}
      </div>

      {/* ── 請求履歴 ── */}
      {events.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">請求履歴</h2>
          <div className="divide-y divide-slate-100">
            {events.map((evt) => (
              <div key={evt.id} className="flex items-center justify-between py-3 text-sm">
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
                <div className="text-right space-y-0.5">
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
      <div className="text-center space-y-1">
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

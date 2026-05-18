import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { SubscriptionStatus } from '../../types/database'

const DEFAULT_BASE_FEE = 3_850
const DEFAULT_PER_VEHICLE_FEE = 1_650
const FREE_VEHICLES = 2

const STATUS_CONFIG: Record<SubscriptionStatus, { label: string; pill: string }> = {
  none: { label: '未登録', pill: 'bg-slate-100 text-slate-600' },
  trialing: { label: 'ご利用開始済み（初月）', pill: 'bg-blue-100 text-blue-700' },
  active: { label: '利用中', pill: 'bg-emerald-100 text-emerald-700' },
  past_due: { label: '支払い失敗', pill: 'bg-red-100 text-red-700' },
  canceled: { label: '解約済み', pill: 'bg-orange-100 text-orange-700' },
}

type BillingRow = {
  id: string
  event_type: 'reservation_fee' | 'subscription'
  amount: number
  status: 'pending' | 'paid' | 'failed' | 'waived'
  created_at: string
}

type BillingBusiness = {
  id: string
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: SubscriptionStatus | null
  subscription_period_end: string | null
  trial_ends_at: string | null
  custom_base_price: number | null
  custom_per_vehicle_price: number | null
}

type BusinessRow = BillingBusiness

function fmtDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('ja-JP')
}

function fmtYen(value: number) {
  return `¥${value.toLocaleString()}`
}

export default function Billing() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const [business, setBusiness] = useState<BillingBusiness | null>(null)
  const [activeVehicles, setActiveVehicles] = useState(0)
  const [events, setEvents] = useState<BillingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [checkoutBusy, setCheckoutBusy] = useState(false)
  const [portalBusy, setPortalBusy] = useState(false)
  const [syncBusy, setSyncBusy] = useState(false)

  const load = useCallback(async () => {
    if (!user) return

    setLoading(true)
    try {
      const { data: biz, error: bizErr } = await supabase
        .from('businesses')
        .select(
          'id, stripe_customer_id, stripe_subscription_id, subscription_status,' +
            'subscription_period_end, trial_ends_at, custom_base_price, custom_per_vehicle_price',
        )
        .eq('user_id', user.id)
        .single()

      if (bizErr) throw bizErr
      if (!biz) {
        setBusiness(null)
        setEvents([])
        setActiveVehicles(0)
        return
      }

      const businessRow = biz as unknown as BusinessRow
      setBusiness(businessRow)

      const { count: vehicleCount, error: vehicleCountErr } = await supabase
        .from('vehicles')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessRow.id)
        .eq('active', true)

      if (vehicleCountErr) throw vehicleCountErr
      setActiveVehicles(vehicleCount ?? 0)

      const { data: eventRows, error: eventErr } = await supabase
        .from('billing_events')
        .select('id, event_type, amount, status, created_at')
        .eq('business_id', businessRow.id)
        .eq('event_type', 'subscription')
        .order('created_at', { ascending: false })
        .limit(20)

      if (eventErr) throw eventErr
      setEvents((eventRows ?? []) as BillingRow[])
    } catch (e: any) {
      showToast(e?.message ?? '課金情報の読み込みに失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }, [showToast, user])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const billing = params.get('billing')
    if (!billing) return

    if (billing === 'success') {
      showToast('決済画面から戻りました。Webhook反映後に状態が更新されます。', 'success')
      load()
    }

    if (billing === 'canceled') {
      showToast('決済はキャンセルされました。', 'info')
    }

    window.history.replaceState({}, '', window.location.pathname)
  }, [load, showToast])

  const handleCheckout = async () => {
    if (!business) return

    setCheckoutBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: { business_id: business.id },
      })
      if (error || !data?.url) {
        throw error ?? new Error('決済URLを取得できませんでした')
      }
      window.location.href = data.url
    } catch (e: any) {
      showToast(e?.message ?? '決済画面を開けませんでした', 'error')
      setCheckoutBusy(false)
    }
  }

  const handlePortal = async () => {
    if (!business) return

    setPortalBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-billing-portal-session', {
        body: { business_id: business.id },
      })
      if (error || !data?.url) {
        throw error ?? new Error('ポータルURLを取得できませんでした')
      }
      window.location.href = data.url
    } catch (e: any) {
      showToast(e?.message ?? '請求ポータルを開けませんでした', 'error')
      setPortalBusy(false)
    }
  }

  const handleSync = async () => {
    if (!business) return

    setSyncBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('sync-vehicle-billing', {
        body: { business_id: business.id },
      })
      if (error) throw error

      if (data?.synced) {
        showToast(
          `車両数を反映しました。稼働車両 ${data.active_vehicles} 台、追加課金 ${data.addon_qty} 台分です。`,
          'success',
        )
      } else {
        showToast(`同期対象がありません: ${data?.reason ?? 'unknown'}`, 'info')
      }

      await load()
    } catch (e: any) {
      showToast(e?.message ?? '車両課金の同期に失敗しました', 'error')
    } finally {
      setSyncBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span className="spinner" />
      </div>
    )
  }

  if (!business) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <div className="card space-y-3">
          <h1 className="text-xl font-bold text-slate-800">課金・プラン</h1>
          <p className="text-sm text-slate-600">事業所情報が見つかりませんでした。</p>
        </div>
      </div>
    )
  }

  const status = (business.subscription_status ?? 'none') as SubscriptionStatus
  const cfg = STATUS_CONFIG[status]
  const isSubscribed = status === 'active' || status === 'trialing'
  const needsCheckout = status === 'none' || status === 'canceled'
  const canOpenPortal =
    Boolean(business.stripe_customer_id) &&
    (status === 'active' || status === 'trialing' || status === 'past_due')

  const baseFee = business.custom_base_price ?? DEFAULT_BASE_FEE
  const perVehicleFee = business.custom_per_vehicle_price ?? DEFAULT_PER_VEHICLE_FEE
  const addonQty = Math.max(0, activeVehicles - FREE_VEHICLES)
  const estimatedFee = baseFee + addonQty * perVehicleFee
  const hasCustomPrice =
    business.custom_base_price != null || business.custom_per_vehicle_price != null

  const jstDay = Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      day: '2-digit',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'day')?.value ?? '1',
  )
  const isHalfMonth = jstDay > 15
  const initialCharge = isHalfMonth ? Math.floor(estimatedFee / 2) : estimatedFee

  return (
    <div className="mx-auto max-w-xl space-y-5 px-4 py-6 sm:py-8">
      <h1 className="text-xl font-bold text-slate-800">課金・プラン</h1>

      <div className="card space-y-5">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">現在の状態</p>
              <h2 className="text-lg font-semibold text-slate-900">{cfg.label}</h2>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${cfg.pill}`}>
              {cfg.label}
            </span>
          </div>

          <p className="text-sm leading-relaxed text-slate-600">
            {status === 'none' &&
              '契約はまだ開始されていません。1日〜15日のご登録は当月1か月分、16日〜月末のご登録は当月の半額を即時請求します。翌月1日から通常の月額が請求されます。'}
            {status === 'trialing' &&
              `初期費用のお支払いが完了し、ご利用を開始しています。翌月1日から月額の自動引き落としが始まります（次回更新基準日: ${fmtDate(
                business.subscription_period_end,
              )}）。`}
            {status === 'active' &&
              (business.stripe_subscription_id
                ? `利用中です。次回更新基準日は ${fmtDate(business.subscription_period_end)} です。`
                : '無料契約で継続中です。')}
            {status === 'past_due' &&
              '支払いに失敗しています。請求ポータルでカード情報や支払い状況を確認してください。'}
            {status === 'canceled' &&
              'サブスクリプションは解約済みです。再開する場合はもう一度決済画面へ進んでください。'}
          </p>
        </div>

        {needsCheckout && (
          <div className="space-y-2">
            <button
              onClick={handleCheckout}
              disabled={checkoutBusy}
              className="btn-primary w-full"
            >
              {checkoutBusy ? 'Stripeへ移動中...' : '決済画面へ進む'}
            </button>
            <p className="text-center text-xs text-slate-400">
              今日（{jstDay}日）は
              {isHalfMonth ? '16日以降のため当月半額' : '15日以内のため当月1か月分'}
              を即時請求します。翌月1日から通常の月額が請求されます。
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
              {portalBusy ? '請求ポータルを開いています...' : '請求ポータルを開く'}
            </button>
            <p className="text-center text-xs text-slate-400">
              支払い方法の変更、請求書確認、解約は Stripe ポータルで行えます。
            </p>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-4 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-700">現在の料金設定</p>
            {hasCustomPrice && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                個別料金
              </span>
            )}
          </div>
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-sm text-slate-600">
            <span>基本料（{FREE_VEHICLES}台まで）</span>
            <span className="font-medium text-slate-800">{fmtYen(baseFee)}/月</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-sm text-slate-600">
            <span>{FREE_VEHICLES + 1}台目以降の追加料金</span>
            <span className="font-medium text-slate-800">{fmtYen(perVehicleFee)}/台・月</span>
          </div>
        </div>
      </div>

      <div className="card space-y-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-slate-700">今月の見込み請求額</h2>
          <p className="text-xs text-slate-400">
            Stripe に反映される車両台数は同期ボタン実行時点の稼働車両数です。
          </p>
        </div>

        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-slate-100 py-2.5 text-sm">
            <span className="text-slate-600">
              基本料（稼働車両 {activeVehicles} 台 / {FREE_VEHICLES} 台まで）
            </span>
            <span className="font-medium text-slate-800">{fmtYen(baseFee)}</span>
          </div>
          {addonQty > 0 && (
            <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-slate-100 py-2.5 text-sm">
              <span className="text-slate-600">
                追加車両 {addonQty} 台 × {fmtYen(perVehicleFee)}
              </span>
              <span className="font-medium text-slate-800">
                {fmtYen(addonQty * perVehicleFee)}
              </span>
            </div>
          )}
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 py-3 text-base font-bold">
            <span className="text-slate-700">月額見込み</span>
            <span className="text-lg text-teal-700">{fmtYen(estimatedFee)}</span>
          </div>
          {needsCheckout && (
            <div className="rounded-lg border border-teal-100 bg-teal-50 p-3">
              <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 text-sm">
                <span className="text-teal-700">
                  今日登録した場合の初回請求（{isHalfMonth ? '当月半額' : '当月1か月分'}）
                </span>
                <span className="font-bold text-teal-800">{fmtYen(initialCharge)}</span>
              </div>
              <p className="mt-1 text-xs text-teal-600">
                翌月1日から {fmtYen(estimatedFee)}/月 が自動請求されます。
              </p>
            </div>
          )}
        </div>

        {isSubscribed && business.stripe_subscription_id && (
          <div className="space-y-2">
            <button
              onClick={handleSync}
              disabled={syncBusy}
              className="w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              {syncBusy ? '同期中...' : '車両台数を Stripe に反映する'}
            </button>
            <p className="text-xs text-slate-400">
              車両の追加・停止後はこの操作で追加課金台数を更新してください。
            </p>
            {/* TODO: 車両更新時の自動同期は未実装。現在は手動同期に依存している。 */}
          </div>
        )}
      </div>

      {events.length > 0 && (
        <div className="card space-y-3">
          <h2 className="font-semibold text-slate-700">請求履歴</h2>
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <div
                key={event.id}
                className="py-3 text-sm sm:flex sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-slate-700">月額プラン</p>
                  <p className="text-xs text-slate-400">
                    {new Date(event.created_at).toLocaleDateString('ja-JP')}
                  </p>
                </div>
                <div className="mt-1 flex items-center gap-3 sm:mt-0 sm:flex-col sm:items-end sm:gap-0.5">
                  <p className="font-medium text-slate-800">{fmtYen(event.amount)}</p>
                  <span
                    className={`text-xs font-medium ${
                      event.status === 'paid'
                        ? 'text-emerald-600'
                        : event.status === 'failed'
                          ? 'text-red-500'
                          : event.status === 'waived'
                            ? 'text-slate-400'
                            : 'text-amber-600'
                    }`}
                  >
                    {event.status === 'paid'
                      ? '支払い済み'
                      : event.status === 'failed'
                        ? '失敗'
                        : event.status === 'waived'
                          ? '免除'
                          : '処理中'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1 pt-2 text-center">
        <p className="text-xs text-slate-400">
          不明点は{' '}
          <a href="mailto:support@setomusubi.jp" className="text-teal-600 hover:underline">
            support@setomusubi.jp
          </a>{' '}
          まで連絡してください。
        </p>
        <p className="text-xs text-slate-400">
          決済は{' '}
          <a
            href="https://stripe.com/jp"
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-600 hover:underline"
          >
            Stripe
          </a>{' '}
          を利用しています。
        </p>
      </div>

      <div className="text-center">
        <Link to="/business/profile" className="text-xs text-slate-400 hover:text-slate-600">
          プロフィール設定に戻る
        </Link>
      </div>
    </div>
  )
}

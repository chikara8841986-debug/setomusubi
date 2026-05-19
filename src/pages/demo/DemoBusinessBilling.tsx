import { useMemo, useState } from 'react'
import DemoLayout from './DemoLayout'
import {
  DEMO_PRICING,
  DEMO_OWN_BUSINESS_BILLING,
  DEMO_SUBSCRIPTION_STATUS_LABEL,
  type DemoSubscriptionStatus,
} from './demoData'

function fmtYen(value: number) {
  return `¥${value.toLocaleString()}`
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

export default function DemoBusinessBilling() {
  const [vehicleCount, setVehicleCount] = useState(DEMO_OWN_BUSINESS_BILLING.vehicle_count)
  const [status, setStatus] = useState<DemoSubscriptionStatus>(DEMO_OWN_BUSINESS_BILLING.subscription_status)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const cfg = DEMO_SUBSCRIPTION_STATUS_LABEL[status]
  const baseFee = DEMO_PRICING.baseFee
  const perVehicleFee = DEMO_PRICING.perVehicleFee
  const addonQty = Math.max(0, vehicleCount - DEMO_PRICING.freeVehicles)
  const monthlyFee = baseFee + addonQty * perVehicleFee

  const periodEnd = useMemo(() => DEMO_OWN_BUSINESS_BILLING.subscription_period_end_iso, [])

  return (
    <DemoLayout role="business">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-xl font-bold text-slate-800 mb-1">料金・契約</h1>
      <p className="text-xs text-slate-400 mb-4">ご契約状況・月額料金の内訳・支払い方法の管理を行います。</p>

      {/* 現在のステータス */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs text-slate-400">現在のステータス</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${cfg.pill}`}>{cfg.label}</span>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">月額（来月以降）</p>
            <p className="text-2xl font-black text-teal-700">{fmtYen(monthlyFee)}</p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-slate-600 mt-3 border-t pt-3">
          {status === 'trialing' && (
            <>初期費用のお支払いが完了し、ご利用を開始しています。翌月1日から月額の自動引き落としが始まります（次回更新基準日: {fmtDate(periodEnd)}）。</>
          )}
          {status === 'active' && (
            <>利用中です。次回更新基準日は {fmtDate(periodEnd)} です。</>
          )}
          {status === 'past_due' && (
            <>支払いに失敗しています。請求ポータルでカード情報や支払い状況を確認してください。</>
          )}
        </p>
      </div>

      {/* 料金内訳 */}
      <div className="card mb-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-700">月額料金の内訳</h2>
        <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-600">基本プラン（{DEMO_PRICING.freeVehicles}台まで無料枠）</span>
            <span className="font-semibold text-slate-800">{fmtYen(baseFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-600">
              追加車両 {addonQty}台 × {fmtYen(perVehicleFee)}
            </span>
            <span className="font-semibold text-slate-800">{fmtYen(addonQty * perVehicleFee)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2 mt-2">
            <span className="font-bold text-slate-700">合計（税込）</span>
            <span className="font-black text-teal-700 text-lg">{fmtYen(monthlyFee)}</span>
          </div>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          ※ プロフィール → 車両管理から車両を追加・削除すると、料金が自動で調整されます。
          {DEMO_PRICING.freeVehicles}台までは追加料金がかかりません。
        </p>
      </div>

      {/* 車両数シミュレーション */}
      <div className="card mb-4 space-y-3 border-2 border-dashed border-amber-200 bg-amber-50/30">
        <div>
          <h2 className="text-sm font-semibold text-amber-800">⚡ デモ：車両数による料金変化を試す</h2>
          <p className="text-xs text-amber-700 mt-1">
            実際の画面では車両管理から追加しますが、ここではスライダーで車両数を変えて料金変化を確認できます。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setVehicleCount(v => Math.max(1, v - 1))}
            className="w-10 h-10 rounded-lg bg-white border border-amber-300 text-amber-700 text-xl font-bold hover:bg-amber-100"
          >
            −
          </button>
          <div className="flex-1 text-center">
            <p className="text-3xl font-black text-amber-700">{vehicleCount}</p>
            <p className="text-xs text-amber-600">稼働車両</p>
          </div>
          <button
            onClick={() => setVehicleCount(v => Math.min(20, v + 1))}
            className="w-10 h-10 rounded-lg bg-white border border-amber-300 text-amber-700 text-xl font-bold hover:bg-amber-100"
          >
            ＋
          </button>
        </div>
      </div>

      {/* 操作ボタン */}
      <div className="space-y-2">
        <button
          onClick={() => showToast('Stripe ポータルを開きます（デモのため実際は開きません）')}
          className="btn-secondary w-full"
          disabled={!DEMO_OWN_BUSINESS_BILLING.has_stripe_subscription}
        >
          💳 支払い方法・解約は請求ポータルから
        </button>

        <button
          onClick={() => {
            setStatus(s => s === 'past_due' ? 'active' : 'past_due')
            showToast('ステータス切替（デモ）：past_due ⇄ active')
          }}
          className="text-xs text-slate-400 hover:text-slate-600 underline w-full"
        >
          （デモ用）ステータスを past_due に切り替える
        </button>
      </div>

      <p className="mt-6 text-center text-xs text-slate-400">
        支払い方法の変更、請求書確認、解約は Stripe ポータルで行えます。
      </p>
    </DemoLayout>
  )
}

import { useState } from 'react'
import DemoLayout from './DemoLayout'
import {
  DEMO_PRICING,
  DEMO_SUBSCRIPTION_STATUS_LABEL,
  INITIAL_DEMO_BILLING_BUSINESSES,
  calcMonthlyFee,
  type DemoBillingBusiness,
  type DemoSubscriptionStatus,
} from './demoData'

type EditState = {
  bizId: string
  bizName: string
  basePrice: string
  perVehiclePrice: string
} | null

function fmtYen(value: number) {
  return `¥${value.toLocaleString()}`
}

export default function DemoAdminBilling() {
  const [businesses, setBusinesses] = useState<DemoBillingBusiness[]>(INITIAL_DEMO_BILLING_BUSINESSES)
  const [filter, setFilter] = useState<DemoSubscriptionStatus | 'all'>('all')
  const [search, setSearch] = useState('')
  const [editState, setEditState] = useState<EditState>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const handleSave = (e: EditState) => {
    if (!e) return
    const baseVal = e.basePrice.trim() ? Number(e.basePrice) : null
    const perVehicleVal = e.perVehiclePrice.trim() ? Number(e.perVehiclePrice) : null
    if (
      (baseVal != null && (!Number.isInteger(baseVal) || baseVal < 0)) ||
      (perVehicleVal != null && (!Number.isInteger(perVehicleVal) || perVehicleVal < 0))
    ) {
      showToast('料金は0以上の整数で入力してください')
      return
    }
    setBusinesses(prev => prev.map(b => b.id === e.bizId
      ? { ...b, custom_base_price: baseVal, custom_per_vehicle_price: perVehicleVal }
      : b
    ))
    setEditState(null)
    showToast('料金設定を保存し、Stripe へ反映しました（デモ）')
  }

  const handleActivate = (biz: DemoBillingBusiness) => {
    const baseFee = biz.custom_base_price ?? DEMO_PRICING.baseFee
    const perVehicleFee = biz.custom_per_vehicle_price ?? DEMO_PRICING.perVehicleFee
    if (baseFee !== 0 || perVehicleFee !== 0) {
      showToast('アクティベートする前に、基本料と追加単価の両方を ¥0 に設定してください（無料契約専用）')
      return
    }
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, subscription_status: 'active' } : b))
    showToast('アクティベートしました（Stripe契約なし・無料プラン）')
  }

  const filtered = businesses.filter(b => {
    if (filter !== 'all' && b.subscription_status !== filter) return false
    if (search && !b.name.includes(search)) return false
    return true
  })

  return (
    <DemoLayout role="admin">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg max-w-md text-center">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-1">課金管理</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">事業所ごとの契約状況・料金設定・特別契約の管理を行います。</p>

      <div className="card mb-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            className="input-base flex-1"
            placeholder="事業所名で検索"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="input-base sm:w-44"
            value={filter}
            onChange={e => setFilter(e.target.value as typeof filter)}
          >
            <option value="all">すべて</option>
            <option value="active">利用中</option>
            <option value="trialing">ご利用開始済み（初月）</option>
            <option value="past_due">支払い失敗</option>
            <option value="none">未登録</option>
            <option value="canceled">解約済み</option>
          </select>
        </div>
        <p className="text-sm text-slate-600 leading-relaxed">
          価格 override を保存すると、契約中の事業所はそのまま Stripe の subscription item まで同期します。
        </p>
      </div>

      {filtered.length === 0 ? (
        <div className="card py-8 text-center text-sm text-slate-400">対象の事業所はありません</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(biz => {
            const monthly = calcMonthlyFee(biz)
            const addon = Math.max(0, biz.vehicle_count - DEMO_PRICING.freeVehicles)
            const statusCfg = DEMO_SUBSCRIPTION_STATUS_LABEL[biz.subscription_status]
            const canActivate = biz.subscription_status === 'none' || biz.subscription_status === 'canceled'

            return (
              <div key={biz.id} className="card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xl font-bold text-slate-800">{biz.name}</p>
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${statusCfg.pill}`}>
                        {statusCfg.label}
                      </span>
                      {!biz.has_stripe_subscription && (
                        <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[10px] font-bold">
                          Stripe契約なし
                        </span>
                      )}
                    </div>
                    <p className="text-base font-medium text-slate-600">
                      稼働車両 {biz.vehicle_count} 台
                      {addon > 0 ? ` / 追加課金 ${addon} 台` : ''}
                      {' / '}
                      見込み月額 {fmtYen(monthly)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-sm">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    基本料 {fmtYen(biz.custom_base_price ?? DEMO_PRICING.baseFee)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    追加単価 {fmtYen(biz.custom_per_vehicle_price ?? DEMO_PRICING.perVehicleFee)}
                  </span>
                  {biz.custom_base_price === 0 && biz.custom_per_vehicle_price === 0 && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 font-bold">
                      無料契約
                    </span>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button
                    className="flex-1 min-w-[120px] rounded-lg border border-slate-200 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={() => setEditState({
                      bizId: biz.id,
                      bizName: biz.name,
                      basePrice: biz.custom_base_price != null ? String(biz.custom_base_price) : '',
                      perVehiclePrice: biz.custom_per_vehicle_price != null ? String(biz.custom_per_vehicle_price) : '',
                    })}
                  >
                    料金設定を編集
                  </button>

                  {biz.has_stripe_subscription && (
                    <button
                      className="flex-1 min-w-[120px] rounded-lg border border-teal-200 py-2 text-sm text-teal-700 hover:bg-teal-50"
                      onClick={() => showToast(`Stripe同期完了: 稼働車両 ${biz.vehicle_count} 台、追加課金 ${addon} 台分`)}
                    >
                      Stripe 同期
                    </button>
                  )}

                  {canActivate && (
                    <button
                      className="flex-1 min-w-[120px] rounded-lg border border-emerald-200 py-2 text-sm text-emerald-700 hover:bg-emerald-50"
                      onClick={() => handleActivate(biz)}
                      title="基本料・追加単価がともに ¥0 のときのみ有効（無料契約専用）"
                    >
                      アクティベート（無料契約）
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editState && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 sm:items-center"
          onClick={() => setEditState(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-slate-900">{editState.bizName}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                保存後、契約中の事業所には Stripe 同期を自動で実行します。
              </p>
            </div>

            <div className="mt-5 space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-600">
                  基本料 override（空欄で {fmtYen(DEMO_PRICING.baseFee)}）
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-base"
                  value={editState.basePrice}
                  onChange={e => setEditState(s => s ? { ...s, basePrice: e.target.value } : s)}
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-600">
                  追加車両単価 override（空欄で {fmtYen(DEMO_PRICING.perVehicleFee)}）
                </label>
                <input
                  type="number"
                  min="0"
                  className="input-base"
                  value={editState.perVehiclePrice}
                  onChange={e => setEditState(s => s ? { ...s, perVehiclePrice: e.target.value } : s)}
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2">
              <button className="btn-secondary flex-1" onClick={() => setEditState(null)}>
                キャンセル
              </button>
              <button className="btn-primary flex-1" onClick={() => handleSave(editState)}>
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </DemoLayout>
  )
}

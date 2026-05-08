import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import type { SubscriptionStatus } from '../../types/database'

const DEFAULT_BASE_FEE = 3_850
const DEFAULT_PER_VEHICLE_FEE = 1_650
const FREE_VEHICLES = 2

type BizRow = {
  id: string
  name: string
  subscription_status: SubscriptionStatus
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_vehicle_item_id: string | null
  custom_base_price: number | null
  custom_per_vehicle_price: number | null
  stripe_coupon_id: string | null
  vehicle_count: number
}

type BusinessListRow = Omit<BizRow, 'vehicle_count'>

type EditState = {
  bizId: string
  bizName: string
  coupon: string
  basePrice: string
  perVehiclePrice: string
  hasLiveSubscription: boolean
}

const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  none: '未登録',
  trialing: '開始待ち',
  active: '利用中',
  past_due: '支払い失敗',
  canceled: '解約済み',
}

const STATUS_COLOR: Record<SubscriptionStatus, string> = {
  none: 'bg-slate-100 text-slate-600',
  trialing: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  past_due: 'bg-red-100 text-red-700',
  canceled: 'bg-orange-100 text-orange-700',
}

function fmtYen(value: number) {
  return `¥${value.toLocaleString()}`
}

function calcMonthlyFee(row: BizRow) {
  const base = row.custom_base_price ?? DEFAULT_BASE_FEE
  const perVehicle = row.custom_per_vehicle_price ?? DEFAULT_PER_VEHICLE_FEE
  const addon = Math.max(0, row.vehicle_count - FREE_VEHICLES)
  return base + addon * perVehicle
}

function EditModal({
  state,
  onClose,
  onSave,
}: {
  state: EditState
  onClose: () => void
  onSave: (value: EditState) => Promise<void>
}) {
  const [form, setForm] = useState(state)
  const [busy, setBusy] = useState(false)

  const handleSave = async () => {
    setBusy(true)
    try {
      await onSave(form)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900">{form.bizName}</h2>
          <p className="text-xs text-slate-400">
            保存後、契約中の事業所には Stripe 同期を自動で実行します。
          </p>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">
              Stripe Coupon ID
            </label>
            <input
              type="text"
              className="input w-full"
              placeholder="未設定なら空欄"
              value={form.coupon}
              onChange={(event) =>
                setForm((current) => ({ ...current, coupon: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">
              基本料 override（空欄で {fmtYen(DEFAULT_BASE_FEE)}）
            </label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={form.basePrice}
              onChange={(event) =>
                setForm((current) => ({ ...current, basePrice: event.target.value }))
              }
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600">
              追加車両単価 override（空欄で {fmtYen(DEFAULT_PER_VEHICLE_FEE)}）
            </label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={form.perVehiclePrice}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  perVehiclePrice: event.target.value,
                }))
              }
            />
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button className="btn-secondary flex-1" onClick={onClose} disabled={busy}>
            キャンセル
          </button>
          <button className="btn-primary flex-1" onClick={handleSave} disabled={busy}>
            {busy ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function BillingAdmin() {
  const { showToast } = useToast()

  const [rows, setRows] = useState<BizRow[]>([])
  const [loading, setLoading] = useState(true)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [syncBusy, setSyncBusy] = useState<string | null>(null)
  const [filter, setFilter] = useState<SubscriptionStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('businesses')
      .select(
        'id, name, subscription_status, stripe_customer_id, stripe_subscription_id,' +
          'stripe_vehicle_item_id, custom_base_price, custom_per_vehicle_price, stripe_coupon_id',
      )
      .order('name')

    if (error) {
      showToast('課金一覧の読み込みに失敗しました', 'error')
      setLoading(false)
      return
    }

    const businessRows = (data ?? []) as unknown as BusinessListRow[]

    // TODO: vehicle_count は一覧件数が増えると N+1 になる。集計 view / RPC に寄せたい。
    const withVehicleCount = await Promise.all(
      businessRows.map(async (biz) => {
        const { count } = await supabase
          .from('vehicles')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', biz.id)
          .eq('active', true)

        return {
          ...biz,
          vehicle_count: count ?? 0,
        } as BizRow
      }),
    )

    setRows(withVehicleCount)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const handleSync = async (bizId: string) => {
    setSyncBusy(bizId)
    try {
      const { data, error } = await supabase.functions.invoke('sync-vehicle-billing', {
        body: { business_id: bizId },
      })
      if (error) throw error

      if (data?.synced) {
        showToast(
          `Stripe同期完了: 稼働車両 ${data.active_vehicles} 台、追加課金 ${data.addon_qty} 台分`,
          'success',
        )
      } else {
        showToast(`同期対象なし: ${data?.reason ?? 'unknown'}`, 'info')
      }

      await load()
    } catch (e: any) {
      showToast(e?.message ?? 'Stripe同期に失敗しました', 'error')
    } finally {
      setSyncBusy(null)
    }
  }

  const handleSave = async (form: EditState) => {
    const couponVal = form.coupon.trim() || null
    const baseVal = form.basePrice.trim() ? Number(form.basePrice) : null
    const perVehicleVal = form.perVehiclePrice.trim() ? Number(form.perVehiclePrice) : null

    if (
      (baseVal != null && (!Number.isInteger(baseVal) || baseVal < 0)) ||
      (perVehicleVal != null && (!Number.isInteger(perVehicleVal) || perVehicleVal < 0))
    ) {
      showToast('料金は0以上の整数で入力してください', 'error')
      return
    }

    const { error } = await supabase
      .from('businesses')
      .update({
        stripe_coupon_id: couponVal,
        custom_base_price: baseVal,
        custom_per_vehicle_price: perVehicleVal,
      })
      .eq('id', form.bizId)

    if (error) {
      showToast(`保存に失敗しました: ${error.message}`, 'error')
      return
    }

    if (form.hasLiveSubscription) {
      try {
        const { error: syncErr } = await supabase.functions.invoke('sync-vehicle-billing', {
          body: { business_id: form.bizId },
        })
        if (syncErr) throw syncErr
      } catch (e: any) {
        showToast(
          `保存は完了しましたが Stripe 同期に失敗しました: ${e?.message ?? 'unknown'}`,
          'error',
        )
        await load()
        setEditState(null)
        return
      }
    }

    showToast(
      form.hasLiveSubscription
        ? '料金設定を保存し、Stripe へ反映しました'
        : '料金設定を保存しました',
      'success',
    )
    setEditState(null)
    await load()
  }

  const filtered = rows.filter((row) => {
    if (filter !== 'all' && row.subscription_status !== filter) return false
    if (search && !row.name.includes(search)) return false
    return true
  })

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
      <h1 className="text-xl font-bold text-slate-800">課金管理</h1>

      <div className="card space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            className="input flex-1"
            placeholder="事業所名で検索"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="input sm:w-44"
            value={filter}
            onChange={(event) => setFilter(event.target.value as typeof filter)}
          >
            <option value="all">すべて</option>
            <option value="active">利用中</option>
            <option value="trialing">開始待ち</option>
            <option value="past_due">支払い失敗</option>
            <option value="none">未登録</option>
            <option value="canceled">解約済み</option>
          </select>
        </div>
        <p className="text-xs text-slate-400">
          価格 override を保存すると、契約中の事業所はそのまま Stripe の subscription item まで同期します。
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <span className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-8 text-center text-sm text-slate-400">
          対象の事業所はありません
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((biz) => {
            const monthly = calcMonthlyFee(biz)
            const addon = Math.max(0, biz.vehicle_count - FREE_VEHICLES)
            const hasLiveSubscription =
              Boolean(biz.stripe_subscription_id) &&
              (biz.subscription_status === 'active' || biz.subscription_status === 'trialing')

            return (
              <div key={biz.id} className="card space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-800">{biz.name}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_COLOR[biz.subscription_status]}`}
                      >
                        {STATUS_LABEL[biz.subscription_status]}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">
                      稼働車両 {biz.vehicle_count} 台
                      {addon > 0 ? ` / 追加課金 ${addon} 台` : ''}
                      {' / '}
                      見込み月額 {fmtYen(monthly)}
                    </p>
                    <p className="text-xs text-slate-400">
                      customer: {biz.stripe_customer_id ?? '-'}
                    </p>
                    <p className="text-xs text-slate-400">
                      subscription: {biz.stripe_subscription_id ?? '-'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    基本料 {fmtYen(biz.custom_base_price ?? DEFAULT_BASE_FEE)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    追加単価 {fmtYen(biz.custom_per_vehicle_price ?? DEFAULT_PER_VEHICLE_FEE)}
                  </span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                    coupon {biz.stripe_coupon_id ?? '-'}
                  </span>
                  {biz.stripe_vehicle_item_id && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                      vehicle item {biz.stripe_vehicle_item_id}
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    className="flex-1 rounded-lg border border-slate-200 py-2 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() =>
                      setEditState({
                        bizId: biz.id,
                        bizName: biz.name,
                        coupon: biz.stripe_coupon_id ?? '',
                        basePrice:
                          biz.custom_base_price != null ? String(biz.custom_base_price) : '',
                        perVehiclePrice:
                          biz.custom_per_vehicle_price != null
                            ? String(biz.custom_per_vehicle_price)
                            : '',
                        hasLiveSubscription,
                      })
                    }
                  >
                    料金設定を編集
                  </button>

                  {biz.stripe_subscription_id && (
                    <button
                      className="flex-1 rounded-lg border border-teal-200 py-2 text-sm text-teal-700 transition-colors hover:bg-teal-50 disabled:opacity-50"
                      disabled={syncBusy === biz.id}
                      onClick={() => handleSync(biz.id)}
                    >
                      {syncBusy === biz.id ? '同期中...' : 'Stripe 同期'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {editState && (
        <EditModal
          state={editState}
          onClose={() => setEditState(null)}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

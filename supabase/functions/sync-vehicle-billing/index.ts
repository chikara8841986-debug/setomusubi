// deno-lint-ignore-file no-explicit-any
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_BASE_FEE = 3_850
const DEFAULT_PER_VEHICLE_FEE = 1_650
const FREE_VEHICLES = 2

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function getJstDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit',
  }).formatToParts(now)

  return Number(parts.find((part) => part.type === 'day')?.value ?? '1')
}

function buildRecurringPriceData(
  amount: number,
  name: string,
  billingType: 'base_monthly' | 'per_vehicle',
): Stripe.SubscriptionItemCreateParams.PriceData {
  return {
    currency: 'jpy',
    product_data: {
      name,
      metadata: { billing_type: billingType },
    },
    unit_amount: amount,
    recurring: { interval: 'month' },
  }
}

function getPriceMeta(item: Stripe.SubscriptionItem) {
  return (item.price as any).metadata ?? {}
}

function getUnitAmount(item: Stripe.SubscriptionItem) {
  return (item.price as any).unit_amount ?? null
}

function isVehicleItem(item: Stripe.SubscriptionItem, vehiclePriceId: string) {
  const price = item.price as any
  const meta = getPriceMeta(item)
  return (
    price.id === vehiclePriceId ||
    meta.billing_type === 'per_vehicle' ||
    price.nickname === 'per_vehicle'
  )
}

function isBaseItem(
  item: Stripe.SubscriptionItem,
  basePriceId: string,
  vehiclePriceId: string,
) {
  const price = item.price as any
  const meta = getPriceMeta(item)
  if (price.id === basePriceId || meta.billing_type === 'base_monthly') {
    return true
  }
  return !isVehicleItem(item, vehiclePriceId)
}

async function replaceItemPrice(
  itemId: string,
  quantity: number,
  priceId: string | null,
  priceData: Stripe.SubscriptionItemCreateParams.PriceData | null,
  prorationBehavior: Stripe.SubscriptionItemUpdateParams.ProrationBehavior,
) {
  const params: Stripe.SubscriptionItemUpdateParams = {
    quantity,
    proration_behavior: prorationBehavior,
    payment_behavior: 'allow_incomplete',
  }

  if (priceId) {
    params.price = priceId
  } else if (priceData) {
    params.price_data = priceData
  }

  return await stripe.subscriptionItems.update(itemId, params)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(token)

    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { business_id } = await req.json()
    if (!business_id) return json({ error: 'business_id is required' }, 400)

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileErr) throw profileErr
    const isAdmin = profile?.role === 'admin'

    const bizQuery = supabase
      .from('businesses')
      .select(
        'id, subscription_status, stripe_subscription_id, stripe_vehicle_item_id,' +
          'custom_base_price, custom_per_vehicle_price',
      )
      .eq('id', business_id)

    if (!isAdmin) bizQuery.eq('user_id', user.id)

    const { data: biz, error: bizErr } = await bizQuery.single()
    if (bizErr || !biz) return json({ error: 'Business not found' }, 404)

    if (!biz.stripe_subscription_id) {
      return json({ synced: false, reason: 'no_subscription' })
    }
    if (biz.subscription_status === 'canceled' || biz.subscription_status === 'none') {
      return json({ synced: false, reason: 'subscription_not_active' })
    }

    const { count: vehicleCount, error: vehicleCountErr } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .eq('active', true)

    if (vehicleCountErr) throw vehicleCountErr

    const activeVehicles = vehicleCount ?? 0
    const addonQty = Math.max(0, activeVehicles - FREE_VEHICLES)
    const prorationBehavior =
      getJstDay() <= 15 ? 'always_invoice' : 'none'

    const baseFee = biz.custom_base_price ?? DEFAULT_BASE_FEE
    const perVehicleFee = biz.custom_per_vehicle_price ?? DEFAULT_PER_VEHICLE_FEE
    const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID') ?? ''
    const vehiclePriceId = Deno.env.get('STRIPE_PER_VEHICLE_PRICE_ID') ?? ''
    const useCustomBasePrice = biz.custom_base_price != null
    const useCustomVehiclePrice = biz.custom_per_vehicle_price != null

    // ¥0 ハンドリング（粒度別）:
    //  - 両方 0: Stripe には何も送らない（完全無料プラン）
    //  - 基本料のみ 0: 基本料 item は更新しない（既存価格維持）。車両のみ同期。
    //  - 追加単価のみ 0: 車両 item を削除（実質 addonQty=0 扱い）。基本料は同期。
    // Stripe の price_data は unit_amount:0 を JPY で受け付けないため、
    // ¥0 にしたい場合は item 自体を作らない／消す方針で扱う。
    const baseIsFree = baseFee === 0
    const vehicleIsFree = perVehicleFee === 0

    if (baseIsFree && vehicleIsFree) {
      return json({ synced: false, reason: 'free_plan_full' })
    }

    const subscription = await stripe.subscriptions.retrieve(biz.stripe_subscription_id, {
      expand: ['items.data.price'],
    })
    const baseItem = subscription.items.data.find((item) =>
      isBaseItem(item, basePriceId, vehiclePriceId),
    )
    const liveVehicleItem =
      subscription.items.data.find((item) => isVehicleItem(item, vehiclePriceId)) ?? null

    // ── 基本料アイテム同期 ──
    if (baseItem && !baseIsFree) {
      const baseNeedsPriceUpdate = useCustomBasePrice
        ? getUnitAmount(baseItem) !== baseFee || getPriceMeta(baseItem).billing_type !== 'base_monthly'
        : basePriceId
          ? (baseItem.price as any).id !== basePriceId
          : getUnitAmount(baseItem) !== baseFee || getPriceMeta(baseItem).billing_type !== 'base_monthly'

      if (baseNeedsPriceUpdate || baseItem.quantity !== 1) {
        await replaceItemPrice(
          baseItem.id,
          1,
          !useCustomBasePrice && basePriceId ? basePriceId : null,
          useCustomBasePrice || !basePriceId
            ? buildRecurringPriceData(baseFee, 'せとむすび 基本プラン', 'base_monthly')
            : null,
          prorationBehavior,
        )
      }
    }
    // baseIsFree && baseItem あり: 既存 item は触らない（手動でStripeダッシュボードから削除推奨）

    // ── 車両アイテム同期 ──
    let vehicleItemId = liveVehicleItem?.id ?? biz.stripe_vehicle_item_id ?? null

    // ¥0 追加単価 OR 車両0台: 既存の車両 item を削除して終わり
    const effectiveAddonQty = vehicleIsFree ? 0 : addonQty

    if (effectiveAddonQty > 0) {
      if (liveVehicleItem) {
        const vehicleNeedsPriceUpdate = useCustomVehiclePrice
          ? getUnitAmount(liveVehicleItem) !== perVehicleFee ||
            getPriceMeta(liveVehicleItem).billing_type !== 'per_vehicle'
          : vehiclePriceId
            ? (liveVehicleItem.price as any).id !== vehiclePriceId
            : getUnitAmount(liveVehicleItem) !== perVehicleFee ||
              getPriceMeta(liveVehicleItem).billing_type !== 'per_vehicle'

        if (vehicleNeedsPriceUpdate || liveVehicleItem.quantity !== effectiveAddonQty) {
          const updated = await replaceItemPrice(
            liveVehicleItem.id,
            effectiveAddonQty,
            !useCustomVehiclePrice && vehiclePriceId ? vehiclePriceId : null,
            useCustomVehiclePrice || !vehiclePriceId
              ? buildRecurringPriceData(
                  perVehicleFee,
                  'せとむすび 追加車両オプション',
                  'per_vehicle',
                )
              : null,
            prorationBehavior,
          )
          vehicleItemId = updated.id
        }
      } else {
        const createParams: Stripe.SubscriptionItemCreateParams = {
          subscription: biz.stripe_subscription_id,
          quantity: effectiveAddonQty,
          proration_behavior: prorationBehavior,
          payment_behavior: 'allow_incomplete',
        }

        if (!useCustomVehiclePrice && vehiclePriceId) {
          createParams.price = vehiclePriceId
        } else {
          createParams.price_data = buildRecurringPriceData(
            perVehicleFee,
            'せとむすび 追加車両オプション',
            'per_vehicle',
          )
        }

        const created = await stripe.subscriptionItems.create(createParams)
        vehicleItemId = created.id
      }
    } else if (liveVehicleItem) {
      // 0台 or vehicleIsFree → 既存 item を削除
      await stripe.subscriptionItems.del(liveVehicleItem.id, {
        proration_behavior: prorationBehavior,
      })
      vehicleItemId = null
    }

    const { error: bizUpdateErr } = await supabase
      .from('businesses')
      .update({ stripe_vehicle_item_id: vehicleItemId })
      .eq('id', biz.id)

    if (bizUpdateErr) throw bizUpdateErr

    return json({
      synced: true,
      active_vehicles: activeVehicles,
      addon_qty: addonQty,
      vehicle_item_id: vehicleItemId,
      proration: prorationBehavior,
    })
  } catch (e: any) {
    console.error('[sync-vehicle-billing]', e)
    return json({ error: e.message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

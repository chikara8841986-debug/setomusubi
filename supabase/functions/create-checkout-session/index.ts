// deno-lint-ignore-file no-explicit-any
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_BASE_FEE = 3_850
const DEFAULT_PER_VEHICLE_FEE = 2_200
const FREE_VEHICLES = 2

// ------------------------------------------------------------------ //
// 2ヶ月無料キャンペーン（チラシ「今年かぎり」対応）
// この日付（JST・当日を含む）までの申込を無料キャンペーン対象とする。
// 延長・終了はこの1行を書き換えるだけでよい。
// ------------------------------------------------------------------ //
const CAMPAIGN_END_JST = '2026-12-31'

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

function getJstDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)

  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? ''

  return {
    year: Number(pick('year')),
    month: Number(pick('month')),
    day: Number(pick('day')),
  }
}

// monthsAhead ヶ月後の「1日 0:00 JST」の Unix timestamp を返す共通ヘルパー。
function addMonthsJstStartUnix(monthsAhead: number, now = new Date()) {
  const { year, month } = getJstDateParts(now)
  const totalMonths = year * 12 + (month - 1) + monthsAhead
  const targetYear = Math.floor(totalMonths / 12)
  const targetMonth = (totalMonths % 12) + 1
  const mm = String(targetMonth).padStart(2, '0')
  return Math.floor(new Date(`${targetYear}-${mm}-01T00:00:00+09:00`).getTime() / 1000)
}

function getNextMonthStartUnix(now = new Date()) {
  return addMonthsJstStartUnix(1, now)
}

// キャンペーン: 「申込の翌月から2ヶ月無料、その次の月の1日から課金開始」
// = 申込月の3ヶ月後の1日 0:00 JST。
// 例: 8月22日申込 → 9・10月が無料 → 11月1日に初回請求。
// 「ちょうど2ヶ月後」にしない（月の途中になり請求日を月初に揃える設計と噛み合わなくなるため）。
function getCampaignTrialEndUnix(now = new Date()) {
  return addMonthsJstStartUnix(3, now)
}

// 申込日（JST）がキャンペーン終了日以前かどうか。
function isCampaignActive(now = new Date()) {
  const { year, month, day } = getJstDateParts(now)
  const todayJst =
    String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
  return todayJst <= CAMPAIGN_END_JST
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

    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { business_id } = await req.json()
    if (!business_id) {
      return json({ error: 'business_id is required' }, 400)
    }

    const appUrl = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    const allowSet = new Set(
      [appUrl, ...(Deno.env.get('ALLOWED_RETURN_ORIGINS') ?? '').split(',')]
        .map((value) => value.trim())
        .filter(Boolean),
    )
    const clientOrigin = (() => {
      const origin = req.headers.get('origin')
      if (origin) return origin
      const referer = req.headers.get('referer')
      if (!referer) return null
      try {
        return new URL(referer).origin
      } catch {
        return null
      }
    })()
    const resolvedOrigin =
      clientOrigin && allowSet.has(clientOrigin) ? clientOrigin : appUrl || null

    if (!resolvedOrigin) {
      return json({ error: 'APP_URL is not configured on the server' }, 500)
    }

    const billingUrl = new URL('/business/billing', resolvedOrigin).toString()

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select(
        'id, name, stripe_customer_id, stripe_subscription_id, subscription_status,' +
          'custom_base_price, custom_per_vehicle_price, stripe_coupon_id',
      )
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (bizErr || !biz) return json({ error: 'Business not found' }, 404)

    if (
      biz.stripe_subscription_id &&
      biz.subscription_status !== 'none' &&
      biz.subscription_status !== 'canceled'
    ) {
      return json(
        { error: 'Subscription already exists. Please use the billing portal.' },
        409,
      )
    }

    const { count: vehicleCount, error: vehicleCountErr } = await supabase
      .from('vehicles')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', biz.id)
      .eq('active', true)

    if (vehicleCountErr) {
      throw vehicleCountErr
    }

    const activeVehicles = vehicleCount ?? 0
    const addonQty = Math.max(0, activeVehicles - FREE_VEHICLES)

    let customerId = biz.stripe_customer_id ?? ''
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: biz.name,
        metadata: { business_id: biz.id, user_id: user.id },
      })
      customerId = customer.id

      const { error: customerUpdateErr } = await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', biz.id)

      if (customerUpdateErr) {
        throw customerUpdateErr
      }
    }

    const baseFee = biz.custom_base_price ?? DEFAULT_BASE_FEE
    const perVehicleFee = biz.custom_per_vehicle_price ?? DEFAULT_PER_VEHICLE_FEE
    const hasCustomBase = biz.custom_base_price != null
    const hasCustomVehicle = biz.custom_per_vehicle_price != null

    // ------------------------------------------------------------------ //
    // ¥0 ハンドリング
    // Stripe は JPY で unit_amount:0 を受け付けないため、0円の項目は Stripe に
    // 送らない（sync-vehicle-billing と同じ方針）。ここでガードしないと、管理者が
    // 個別料金を0円に設定した事業所は「決済画面へ進む」でStripeエラーになり申し込めない。
    //
    // 安全性: custom_base_price / custom_per_vehicle_price は
    // guard_business_owner_immutable により事業所オーナーからは変更できず、管理者しか
    // 設定できない。よって事業所が自分で無料プランを作ることはできない。
    // ------------------------------------------------------------------ //
    const baseIsFree = baseFee === 0
    const vehicleIsFree = perVehicleFee === 0
    const billableAddonQty = vehicleIsFree ? 0 : addonQty
    const monthlyTotal = (baseIsFree ? 0 : baseFee) + billableAddonQty * perVehicleFee

    if (monthlyTotal === 0) {
      // 完全無料プラン。請求する項目が無いのでStripeにサブスクリプションを作れない。
      // 決済を経由せず「無料契約」として有効化する（Billing.tsx は
      // status='active' かつ stripe_subscription_id なし を「無料契約で継続中」と表示する）。
      const { error: freeErr } = await supabase
        .from('businesses')
        .update({ subscription_status: 'active' })
        .eq('id', biz.id)
      if (freeErr) throw freeErr
      return json({
        free_plan: true,
        message: '個別料金の設定により、お支払いなしでご利用いただけます。',
      })
    }

    const campaignActive = isCampaignActive()

    let sessionParams: Stripe.Checkout.SessionCreateParams

    if (campaignActive) {
      // 2ヶ月無料キャンペーン: mode: 'subscription' で Checkout を作り、
      // trial_end で無料期間を指定する。申込時点では一切課金しない。
      // カードは Stripe が Checkout で保存し（payment_method_collection: 'always'）、
      // trial 終了後に自動で初回請求される（billing_cycle_anchor は trial_end に自動で揃う）。
      const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID') ?? ''
      const perVehiclePriceId = Deno.env.get('STRIPE_PER_VEHICLE_PRICE_ID') ?? ''
      // 個別価格が設定されている事業所は、カタログ価格を使わずインライン price_data にする
      // （既存の stripe-webhook 側の custom price 上書きロジックと同じ考え方）。
      const effectiveBasePriceId = hasCustomBase ? '' : basePriceId
      const effectiveVehiclePriceId = hasCustomVehicle ? '' : perVehiclePriceId

      const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

      // 基本料が0円の事業所は基本料の項目自体を作らない（JPYでunit_amount:0は不可）
      if (baseIsFree) {
        // 何も追加しない
      } else if (effectiveBasePriceId) {
        lineItems.push({ price: effectiveBasePriceId, quantity: 1 })
      } else {
        lineItems.push({
          price_data: {
            currency: 'jpy',
            product_data: {
              name: '基本料金（月額）',
              metadata: { billing_type: 'base_monthly' },
            },
            unit_amount: baseFee,
            recurring: { interval: 'month' },
          },
          quantity: 1,
        })
      }

      // 追加単価が0円、または追加台数0のときは車両の項目を作らない
      if (billableAddonQty > 0) {
        if (effectiveVehiclePriceId) {
          lineItems.push({ price: effectiveVehiclePriceId, quantity: billableAddonQty })
        } else {
          lineItems.push({
            price_data: {
              currency: 'jpy',
              product_data: {
                name: '車両追加料金（3台目以降・月額）',
                metadata: { billing_type: 'per_vehicle' },
              },
              unit_amount: perVehicleFee,
              recurring: { interval: 'month' },
            },
            quantity: billableAddonQty,
          })
        }
      }

      const trialEnd = getCampaignTrialEndUnix()

      sessionParams = {
        customer: customerId,
        client_reference_id: biz.id,
        mode: 'subscription',
        payment_method_types: ['card'],
        // trial 中で当日の請求額が0円でも、必ずカードを登録させる。
        payment_method_collection: 'always',
        line_items: lineItems,
        subscription_data: {
          trial_end: trialEnd,
          metadata: {
            business_id: biz.id,
            campaign: 'free_2month_until_' + CAMPAIGN_END_JST,
          },
        },
        metadata: {
          business_id: biz.id,
          base_fee: String(baseFee),
          per_vehicle_fee: String(perVehicleFee),
          addon_qty: String(addonQty),
          custom_base_price: biz.custom_base_price != null ? String(biz.custom_base_price) : '',
          custom_per_vehicle_price:
            biz.custom_per_vehicle_price != null ? String(biz.custom_per_vehicle_price) : '',
          campaign: 'free_2month_until_' + CAMPAIGN_END_JST,
          campaign_trial_end: String(trialEnd),
        },
        success_url: `${billingUrl}?billing=success`,
        cancel_url: `${billingUrl}?billing=canceled`,
        locale: 'ja',
      }
    } else {
      // キャンペーン終了後: 従来どおりの即時決済フロー（初月分/半額を即時決済し、
      // stripe-webhook の checkout.session.completed / mode === 'payment' 分岐で
      // 翌月1日を trial_end としたサブスクを作成する）。
      const { day: jstDay } = getJstDateParts()
      const billingCycleAnchor = getNextMonthStartUnix()
      const isHalfMonth = jstDay > 15
      // 0円の項目は含めない（monthlyTotal は上で 0 でないことを確認済み）
      const totalMonthlyFee = monthlyTotal
      const initialCharge = Math.max(1, isHalfMonth ? Math.floor(totalMonthlyFee / 2) : totalMonthlyFee)

      sessionParams = {
        customer: customerId,
        client_reference_id: biz.id,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'jpy',
              product_data: {
                name: isHalfMonth ? '初月利用料（半額）' : '初月利用料（当月分）',
                metadata: {
                  billing_type: 'initial_registration_fee',
                  charge_timing: 'immediate',
                },
              },
              unit_amount: initialCharge,
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          setup_future_usage: 'off_session',
        },
        metadata: {
          business_id: biz.id,
          billing_cycle_anchor: String(billingCycleAnchor),
          base_fee: String(baseFee),
          per_vehicle_fee: String(perVehicleFee),
          addon_qty: String(addonQty),
          custom_base_price: biz.custom_base_price != null ? String(biz.custom_base_price) : '',
          custom_per_vehicle_price:
            biz.custom_per_vehicle_price != null ? String(biz.custom_per_vehicle_price) : '',
          initial_charge: String(initialCharge),
          initial_charge_rule: isHalfMonth ? 'half_month_after_15th' : 'full_month_1_to_15',
        },
        /*
         * Webhook requirement for checkout.session.completed:
         * - Read session.customer and the saved payment method from the completed payment.
         * - Create the recurring subscription in the webhook, not in this function.
         * - Use billing_cycle_anchor = metadata.billing_cycle_anchor for the 1st of next month.
         * - Set trial_end = billing_cycle_anchor so the subscription does not charge again today.
         * - Create the standard 3,850 JPY/month subscription by default, or apply the
         *   business-specific base/add-on pricing if the webhook already supports that.
         * - Attach the saved payment method for off-session renewals.
         */
        success_url: `${billingUrl}?billing=success`,
        cancel_url: `${billingUrl}?billing=canceled`,
        locale: 'ja',
      }
    }

    if (biz.stripe_coupon_id) {
      sessionParams.discounts = [{ coupon: biz.stripe_coupon_id }]
    }

    const session = await stripe.checkout.sessions.create(sessionParams)
    return json({ url: session.url })
  } catch (e: any) {
    console.error('[create-checkout-session]', e)
    return json({ error: e.message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

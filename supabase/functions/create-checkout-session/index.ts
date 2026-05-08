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

function getNextMonthStartUnix(now = new Date()) {
  const { year, month } = getJstDateParts(now)
  const nextMonthYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return Math.floor(Date.UTC(nextMonthYear, nextMonth - 1, 1, 0, 0, 0) / 1000)
}

function buildRecurringLineItem(
  amount: number,
  name: string,
  billingType: 'base_monthly' | 'per_vehicle',
  quantity: number,
): Stripe.Checkout.SessionCreateParams.LineItem {
  return {
    price_data: {
      currency: 'jpy',
      product_data: {
        name,
        metadata: { billing_type: billingType },
      },
      unit_amount: amount,
      recurring: { interval: 'month' },
    },
    quantity,
  }
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
    const useCustomBasePrice = biz.custom_base_price != null
    const useCustomVehiclePrice = biz.custom_per_vehicle_price != null

    const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID') ?? ''
    const perVehiclePriceId = Deno.env.get('STRIPE_PER_VEHICLE_PRICE_ID') ?? ''

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []

    if (basePriceId && !useCustomBasePrice) {
      lineItems.push({ price: basePriceId, quantity: 1 })
    } else {
      lineItems.push(
        buildRecurringLineItem(baseFee, 'せとむすび 基本プラン', 'base_monthly', 1),
      )
    }

    if (addonQty > 0) {
      if (perVehiclePriceId && !useCustomVehiclePrice) {
        lineItems.push({ price: perVehiclePriceId, quantity: addonQty })
      } else {
        lineItems.push(
          buildRecurringLineItem(
            perVehicleFee,
            'せとむすび 追加車両オプション',
            'per_vehicle',
            addonQty,
          ),
        )
      }
    }

    const prorationBehavior =
      getJstDateParts().day <= 15 ? 'always_invoice' : 'none'
    const billingCycleAnchor = getNextMonthStartUnix()

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      client_reference_id: biz.id,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: lineItems,
      subscription_data: {
        billing_cycle_anchor: billingCycleAnchor,
        proration_behavior: prorationBehavior,
        metadata: { business_id: biz.id },
      },
      success_url: `${billingUrl}?billing=success`,
      cancel_url: `${billingUrl}?billing=canceled`,
      locale: 'ja',
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

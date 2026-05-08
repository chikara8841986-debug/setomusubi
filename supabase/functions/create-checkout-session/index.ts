/**
 * Supabase Edge Function: create-checkout-session
 *
 * Stripe Checkout セッションを作成して URL を返す。
 * 事業所がプランに登録するときフロントから呼ぶ。
 *
 * 環境変数（Supabase Dashboard > Edge Functions > Secrets）:
 *   STRIPE_SECRET_KEY           sk_live_... or sk_test_...
 *   STRIPE_MONTHLY_PRICE_ID     price_xxx （月額固定: ¥5,500）
 *   STRIPE_PER_RES_PRICE_ID     price_xxx （従量メタード: ¥300/件）
 *   SUPABASE_URL                自動注入
 *   SUPABASE_SERVICE_ROLE_KEY   自動注入
 */

// deno-lint-ignore-file no-explicit-any
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    // ── 認証確認 ──────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''
    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401)
    }

    const { business_id } = await req.json()
    if (!business_id) {
      return json({ error: 'business_id is required' }, 400)
    }

    // return_url: APP_URL（canonical）を正とし、クライアント Origin は allowlist 検証後のみ採用
    const appUrl   = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')
    const allowSet = new Set(
      [appUrl, ...(Deno.env.get('ALLOWED_RETURN_ORIGINS') ?? '').split(',')]
        .map(s => s.trim()).filter(Boolean)
    )
    const clientOrigin = (() => {
      const o = req.headers.get('origin')
      if (o) return o
      const r = req.headers.get('referer')
      if (!r) return null
      try { return new URL(r).origin } catch { return null }
    })()
    const resolvedOrigin = (clientOrigin && allowSet.has(clientOrigin))
      ? clientOrigin
      : (appUrl || null)
    if (!resolvedOrigin) {
      return json({ error: 'APP_URL is not configured on the server' }, 500)
    }
    const billingUrl = new URL('/business/billing', resolvedOrigin).toString()

    // ── 所有権確認 ─────────────────────────────────────
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, stripe_customer_id, subscription_status')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (bizErr || !biz) return json({ error: 'Business not found' }, 404)

    // 有効なサブスクがあれば Checkout 不要
    if (biz.subscription_status === 'active' || biz.subscription_status === 'trialing') {
      return json({ error: 'Already subscribed' }, 409)
    }

    // ── Stripe Customer ────────────────────────────────
    let customerId: string = biz.stripe_customer_id ?? ''
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name:  biz.name,
        metadata: { business_id: biz.id, user_id: user.id },
      })
      customerId = customer.id
      // service role で書き込み（guard trigger を回避）
      await supabase
        .from('businesses')
        .update({ stripe_customer_id: customerId })
        .eq('id', biz.id)
    }

    // ── Stripe Checkout Session ────────────────────────
    const monthlyPriceId = Deno.env.get('STRIPE_MONTHLY_PRICE_ID') ?? ''
    const perResPriceId  = Deno.env.get('STRIPE_PER_RES_PRICE_ID')  ?? ''

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = []
    if (monthlyPriceId) lineItems.push({ price: monthlyPriceId, quantity: 1 })
    if (perResPriceId)  lineItems.push({ price: perResPriceId })  // metered: no quantity

    if (lineItems.length === 0) {
      // 環境変数未設定時はデモ用固定料金でセッション作成
      console.warn('[billing] STRIPE_MONTHLY_PRICE_ID not set — using ad-hoc price')
      lineItems.push({
        price_data: {
          currency: 'jpy',
          product_data: { name: 'せとむすび 標準プラン（月額）' },
          recurring: { interval: 'month' },
          unit_amount: 5500,
        },
        quantity: 1,
      })
    }

    const session = await stripe.checkout.sessions.create({
      customer:              customerId,
      mode:                  'subscription',
      payment_method_types:  ['card'],
      line_items:            lineItems,
      subscription_data: {
        trial_period_days: 30,
        metadata: { business_id: biz.id },
      },
      success_url: `${billingUrl}?billing=success`,
      cancel_url:  `${billingUrl}?billing=canceled`,
      locale:      'ja',
    })

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

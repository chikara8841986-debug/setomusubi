/**
 * Supabase Edge Function: create-billing-portal-session
 *
 * Stripe Customer Portal セッションを作成して URL を返す。
 * 事業所がプランの管理・解約・支払い方法変更をするときに使う。
 *
 * 環境変数:
 *   STRIPE_SECRET_KEY                     sk_live_... or sk_test_...
 *   STRIPE_BILLING_PORTAL_CONFIGURATION   （省略可: Stripe ダッシュボードでデフォルト設定済みなら不要）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  自動注入
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
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { business_id, return_url } = await req.json()
    if (!business_id || !return_url) {
      return json({ error: 'business_id and return_url are required' }, 400)
    }

    // ── 所有権確認 + Stripe Customer ID 取得 ────────────
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, stripe_customer_id')
      .eq('id', business_id)
      .eq('user_id', user.id)
      .single()

    if (bizErr || !biz) return json({ error: 'Business not found' }, 404)
    if (!biz.stripe_customer_id) {
      return json({ error: 'No Stripe customer found. Please subscribe first.' }, 400)
    }

    // ── Billing Portal Session ──────────────────────────
    const params: Stripe.BillingPortal.SessionCreateParams = {
      customer:   biz.stripe_customer_id,
      return_url: return_url,
    }

    const configId = Deno.env.get('STRIPE_BILLING_PORTAL_CONFIGURATION')
    if (configId) params.configuration = configId

    const session = await stripe.billingPortal.sessions.create(params)
    return json({ url: session.url })
  } catch (e: any) {
    console.error('[create-billing-portal-session]', e)
    return json({ error: e.message }, 500)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

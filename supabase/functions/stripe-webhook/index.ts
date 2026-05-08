/**
 * Supabase Edge Function: stripe-webhook
 *
 * Stripe からの Webhook イベントを受け取り、businesses テーブルの
 * subscription_status / subscription_period_end / trial_ends_at を更新する。
 * また invoice.paid イベント時に billing_events のステータスを 'paid' にする。
 *
 * Stripe Dashboard で設定する Webhook エンドポイント:
 *   https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook
 *
 * 購読するイベント:
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.paid
 *   invoice.payment_failed
 *
 * 環境変数:
 *   STRIPE_SECRET_KEY          sk_live_... or sk_test_...
 *   STRIPE_WEBHOOK_SECRET      whsec_...  （Stripe Webhook signing secret）
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  自動注入
 */

// deno-lint-ignore-file no-explicit-any
import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

// Stripe status → アプリの subscription_status にマッピング
function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':            return 'trialing'
    case 'active':              return 'active'
    case 'past_due':            return 'past_due'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':  return 'canceled'
    default:                    return 'none'
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  // ── 署名検証 ─────────────────────────────────────────
  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET)
  } catch (e: any) {
    console.error('[stripe-webhook] signature verification failed:', e.message)
    return new Response(`Webhook Error: ${e.message}`, { status: 400 })
  }

  console.log('[stripe-webhook] event:', event.type)

  try {
    switch (event.type) {
      // ── サブスクリプション作成・更新 ──────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const businessId = sub.metadata?.business_id
        if (!businessId) break

        const newStatus = mapStatus(sub.status)
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString()
        const trialEnd  = sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null

        await supabase
          .from('businesses')
          .update({
            subscription_status:     newStatus,
            subscription_period_end: periodEnd,
            trial_ends_at:           trialEnd,
          })
          .eq('id', businessId)

        console.log(`[stripe-webhook] business ${businessId} → ${newStatus}`)
        break
      }

      // ── サブスクリプション解約 ───────────────────────
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const businessId = sub.metadata?.business_id
        if (!businessId) break

        await supabase
          .from('businesses')
          .update({
            subscription_status:     'canceled',
            subscription_period_end: null,
            trial_ends_at:           null,
          })
          .eq('id', businessId)

        console.log(`[stripe-webhook] business ${businessId} → canceled`)
        break
      }

      // ── 請求支払い完了 ──────────────────────────────
      case 'invoice.paid': {
        const invoice  = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        // stripe_customer_id から business_id を逆引き
        const { data: biz } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (biz) {
          // pending の billing_events を paid に更新
          // （実装: 今月分のすべての pending を一括更新）
          const from = new Date(invoice.period_start * 1000).toISOString()
          const to   = new Date(invoice.period_end   * 1000).toISOString()

          await supabase
            .from('billing_events')
            .update({
              status:           'paid',
              stripe_invoice_id: invoice.id,
            })
            .eq('business_id', biz.id)
            .eq('status', 'pending')
            .gte('created_at', from)
            .lte('created_at', to)

          console.log(`[stripe-webhook] marked billing_events paid for business ${biz.id}`)
        }
        break
      }

      // ── 請求支払い失敗 ──────────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice
        const customerId = invoice.customer as string

        const { data: biz } = await supabase
          .from('businesses')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (biz) {
          await supabase
            .from('businesses')
            .update({ subscription_status: 'past_due' })
            .eq('id', biz.id)

          console.log(`[stripe-webhook] business ${biz.id} → past_due (payment failed)`)
        }
        break
      }

      default:
        console.log(`[stripe-webhook] unhandled event: ${event.type}`)
    }
  } catch (e: any) {
    console.error('[stripe-webhook] handler error:', e.message)
    // 500 を返すことで Stripe が自動再試行する
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

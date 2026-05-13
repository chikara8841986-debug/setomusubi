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

function getPriceMeta(item: Stripe.SubscriptionItem) {
  return (item.price as any).metadata ?? {}
}

function isVehicleItem(item: Stripe.SubscriptionItem, vehiclePriceId: string) {
  const price = item.price as any
  const priceMeta = getPriceMeta(item)
  return (
    price.id === vehiclePriceId ||
    priceMeta.billing_type === 'per_vehicle' ||
    price.nickname === 'per_vehicle'
  )
}

function findVehicleItemId(
  items: Stripe.SubscriptionItem[],
  vehiclePriceId: string,
): string | null {
  return items.find((item) => isVehicleItem(item, vehiclePriceId))?.id ?? null
}

function mapStatus(stripeStatus: string): string {
  switch (stripeStatus) {
    case 'trialing':
      return 'trialing'
    case 'active':
      return 'active'
    case 'past_due':
    case 'incomplete':
    case 'unpaid':
      return 'past_due'
    case 'canceled':
    case 'incomplete_expired':
      return 'canceled'
    default:
      return 'none'
  }
}

function buildSubscriptionItems(input: {
  baseFee: number
  perVehicleFee: number
  addonQty: number
  basePriceId: string
  perVehiclePriceId: string
}): Stripe.SubscriptionCreateParams.Item[] {
  const items: Stripe.SubscriptionCreateParams.Item[] = []

  if (input.basePriceId) {
    items.push({ price: input.basePriceId, quantity: 1 })
  } else {
    items.push({
      price_data: {
        currency: 'jpy',
        product_data: {
          name: '基本利用料',
          metadata: { billing_type: 'base_monthly' },
        },
        unit_amount: input.baseFee,
        recurring: { interval: 'month' },
      },
      quantity: 1,
    })
  }

  if (input.addonQty > 0) {
    if (input.perVehiclePriceId) {
      items.push({ price: input.perVehiclePriceId, quantity: input.addonQty })
    } else {
      items.push({
        price_data: {
          currency: 'jpy',
          product_data: {
            name: '追加車両利用料',
            metadata: { billing_type: 'per_vehicle' },
          },
          unit_amount: input.perVehicleFee,
          recurring: { interval: 'month' },
        },
        quantity: input.addonQty,
      })
    }
  }

  return items
}

async function resolveBusinessId(input: {
  metadataBusinessId?: string | null
  subscriptionId?: string | null
  customerId?: string | null
}) {
  if (input.metadataBusinessId) {
    return input.metadataBusinessId
  }

  if (input.subscriptionId) {
    const { data: bySubscription, error } = await supabase
      .from('businesses')
      .select('id')
      .eq('stripe_subscription_id', input.subscriptionId)
      .maybeSingle()

    if (error) throw error
    if (bySubscription?.id) return bySubscription.id
  }

  if (input.customerId) {
    const { data: byCustomer, error } = await supabase
      .from('businesses')
      .select('id')
      .eq('stripe_customer_id', input.customerId)
      .maybeSingle()

    if (error) throw error
    if (byCustomer?.id) return byCustomer.id
  }

  return null
}

async function updateBusiness(
  businessId: string,
  patch: Record<string, unknown>,
) {
  const { error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', businessId)

  if (error) throw error
}

async function upsertSubscriptionBillingEvent(input: {
  businessId: string
  invoiceId: string
  amount: number
  status: 'paid' | 'failed'
  createdAt: string
}) {
  const { error } = await supabase
    .from('billing_events')
    .upsert(
      {
        business_id: input.businessId,
        event_type: 'subscription',
        amount: input.amount,
        status: input.status,
        stripe_invoice_id: input.invoiceId,
        created_at: input.createdAt,
      },
      {
        onConflict: 'stripe_invoice_id',
        ignoreDuplicates: false,
      },
    )

  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET)
  } catch (e: any) {
    console.error('[stripe-webhook] signature verification failed:', e.message)
    return new Response(`Webhook Error: ${e.message}`, { status: 400 })
  }

  const vehiclePriceId = Deno.env.get('STRIPE_PER_VEHICLE_PRICE_ID') ?? ''
  const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID') ?? ''

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (session.mode === 'subscription') {
          const subscriptionId = session.subscription as string | null
          const customerId = session.customer as string | null
          const businessId = await resolveBusinessId({
            metadataBusinessId:
              session.client_reference_id ?? (session as any).metadata?.business_id,
            subscriptionId,
            customerId,
          })

          if (!businessId || !subscriptionId) break

          const sub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price'],
          })
          const vehicleItemId = findVehicleItemId(sub.items.data, vehiclePriceId)

          await updateBusiness(businessId, {
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_vehicle_item_id: vehicleItemId,
          })
        } else if (session.mode === 'payment') {
          const meta = (session.metadata ?? {}) as Record<string, string>
          const businessId = meta.business_id
          const paymentIntentId = session.payment_intent as string | null

          if (!businessId || !paymentIntentId) break

          const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
          const paymentMethodId = pi.payment_method as string | null

          if (!paymentMethodId) break

          const baseFee = meta.custom_base_price
            ? Number(meta.custom_base_price)
            : Number(meta.base_fee)
          const perVehicleFee = meta.custom_per_vehicle_price
            ? Number(meta.custom_per_vehicle_price)
            : Number(meta.per_vehicle_fee)
          const addonQty = Number(meta.addon_qty)
          const billingCycleAnchor = Number(meta.billing_cycle_anchor)
          const subscriptionItems = buildSubscriptionItems({
            baseFee,
            perVehicleFee,
            addonQty,
            basePriceId,
            perVehiclePriceId: vehiclePriceId,
          })

          const sub = await stripe.subscriptions.create({
            customer: session.customer as string,
            default_payment_method: paymentMethodId,
            items: subscriptionItems,
            billing_cycle_anchor: billingCycleAnchor,
            proration_behavior: 'none',
            metadata: { business_id: businessId },
          })
          const vehicleItemId = findVehicleItemId(sub.items.data, vehiclePriceId)

          await updateBusiness(businessId, {
            stripe_customer_id: session.customer as string | null,
            stripe_subscription_id: sub.id,
            subscription_status: mapStatus(sub.status),
            stripe_vehicle_item_id: vehicleItemId,
          })
        }
        break
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription
        const businessId = await resolveBusinessId({
          metadataBusinessId: sub.metadata?.business_id,
          subscriptionId: sub.id,
          customerId: sub.customer as string | null,
        })
        if (!businessId) break

        const vehicleItemId = findVehicleItemId(sub.items.data, vehiclePriceId)
        const trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null

        await updateBusiness(businessId, {
          stripe_customer_id: sub.customer as string | null,
          stripe_subscription_id: sub.id,
          subscription_status: mapStatus(sub.status),
          subscription_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          trial_ends_at: trialEnd,
          stripe_vehicle_item_id: vehicleItemId,
        })
        break
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        const businessId = await resolveBusinessId({
          metadataBusinessId: sub.metadata?.business_id,
          subscriptionId: sub.id,
          customerId: sub.customer as string | null,
        })
        if (!businessId) break

        await updateBusiness(businessId, {
          subscription_status: 'canceled',
          subscription_period_end: null,
          trial_ends_at: null,
          stripe_subscription_id: null,
          stripe_vehicle_item_id: null,
        })
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const businessId = await resolveBusinessId({
          subscriptionId: invoice.subscription as string | null,
          customerId: invoice.customer as string | null,
        })
        if (!businessId || !invoice.id) break

        await upsertSubscriptionBillingEvent({
          businessId,
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          status: 'paid',
          createdAt: new Date(invoice.created * 1000).toISOString(),
        })

        if (invoice.subscription) {
          await updateBusiness(businessId, {
            stripe_subscription_id: invoice.subscription as string,
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const businessId = await resolveBusinessId({
          subscriptionId: invoice.subscription as string | null,
          customerId: invoice.customer as string | null,
        })
        if (!businessId || !invoice.id) break

        await upsertSubscriptionBillingEvent({
          businessId,
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          status: 'failed',
          createdAt: new Date(invoice.created * 1000).toISOString(),
        })

        await updateBusiness(businessId, {
          subscription_status: 'past_due',
          stripe_subscription_id: invoice.subscription as string | null,
        })
        break
      }

      default:
        console.log(`[stripe-webhook] unhandled event: ${event.type}`)
    }
  } catch (e: any) {
    console.error('[stripe-webhook] handler error:', e.message)
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

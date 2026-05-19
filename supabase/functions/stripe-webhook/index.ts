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

/**
 * Identify the vehicle item ID from a subscription's item list.
 * Primary: match by catalog price ID / price metadata / nickname.
 * Fallback: when addonQty > 0 and inline prices were used (custom pricing),
 * the vehicle item is always the last item (buildSubscriptionItems appends it second).
 */
function resolveVehicleItemId(
  items: Stripe.SubscriptionItem[],
  vehiclePriceId: string,
  addonQty: number,
): string | null {
  const byMeta = findVehicleItemId(items, vehiclePriceId)
  if (byMeta) return byMeta
  // Fallback for inline price_data items (no metadata on the Price object)
  if (addonQty > 0 && items.length > 1) return items[items.length - 1].id
  return null
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

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const stripeError = error as { message?: string; raw?: { message?: string } }
    return stripeError.message ?? stripeError.raw?.message ?? 'Unknown error'
  }
  return String(error)
}

function parseRequiredJpyAmount(rawValue: string | undefined, fieldName: string): number {
  const amount = Number(rawValue)
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 0) {
    throw new Error(fieldName + ' must be a non-negative integer JPY amount')
  }
  return amount
}

function parseAddonQuantity(rawValue: string | undefined): number {
  const quantity = Number(rawValue ?? '0')
  if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) {
    throw new Error('addon_qty must be a non-negative integer')
  }
  return quantity
}

/**
 * Parse billing_cycle_anchor from metadata.
 * On Stripe retries the anchor may be in the past — clamp to now+60 so
 * Stripe does not reject the trial_end value.
 */
function parseBillingCycleAnchor(rawValue: string | undefined): number {
  const timestamp = Number(rawValue)
  if (!Number.isFinite(timestamp) || !Number.isInteger(timestamp)) {
    throw new Error('billing_cycle_anchor must be a valid Unix timestamp')
  }
  const minSafe = Math.floor(Date.now() / 1000) + 60
  return Math.max(timestamp, minSafe)
}

// ------------------------------------------------------------------ //
// Fix 1: Event-level idempotency via webhook_processed_events table   //
// ------------------------------------------------------------------ //

async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('webhook_processed_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', eventId)
    .maybeSingle()
  if (error) {
    // Fail open: log clearly but don't block all webhooks if the table is broken.
    // Duplicate-execution risk is mitigated by Stripe idempotency keys.
    console.error('[stripe-webhook] isEventProcessed DB error (fail open):', error.message)
    return false
  }
  return !!data
}

async function markEventProcessed(eventId: string, eventType: string): Promise<void> {
  const { error } = await supabase
    .from('webhook_processed_events')
    .upsert(
      { stripe_event_id: eventId, event_type: eventType },
      { onConflict: 'stripe_event_id', ignoreDuplicates: true },
    )
  if (error) console.error('[webhook_processed_events] upsert failed:', error.message)
}

// NOTE: Stripe subscriptions.create does NOT support price_data.product_data (inline).
// You must pass price_data.product (an existing product ID).
// If no pre-configured price ID is set, we create ephemeral products on the fly.
async function buildSubscriptionItems(input: {
  baseFee: number
  perVehicleFee: number
  addonQty: number
  basePriceId: string
  perVehiclePriceId: string
}): Promise<Stripe.SubscriptionCreateParams.Item[]> {
  const items: Stripe.SubscriptionCreateParams.Item[] = []

  if (input.basePriceId) {
    items.push({ price: input.basePriceId, quantity: 1 })
  } else {
    const baseProduct = await stripe.products.create({
      name: 'Base monthly plan',
      metadata: { billing_type: 'base_monthly' },
    })
    items.push({
      price_data: {
        currency: 'jpy',
        product: baseProduct.id,
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
      const vehicleProduct = await stripe.products.create({
        name: 'Per vehicle add-on',
        metadata: { billing_type: 'per_vehicle' },
      })
      items.push({
        price_data: {
          currency: 'jpy',
          product: vehicleProduct.id,
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

// ------------------------------------------------------------------ //
// Fix 2: Atomic subscription slot claim                               //
// Only updates if stripe_subscription_id IS NULL to prevent races.   //
// Also checks that subId is not the tombstoned sub ID to prevent     //
// reinstatement of a just-cancelled subscription in a concurrent     //
// delivery scenario (atomic: no separate guard-then-write gap).      //
// Returns true if this process claimed the slot, false if taken.     //
// ------------------------------------------------------------------ //
async function claimSubscriptionSlot(
  businessId: string,
  subId: string,
  patch: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('businesses')
    .update(patch)
    .eq('id', businessId)
    .is('stripe_subscription_id', null)
    // Atomic tombstone guard: only claim if this sub was not recently cancelled.
    // PostgREST: (last_cancelled_subscription_id IS NULL OR last_cancelled_subscription_id != subId)
    .or('last_cancelled_subscription_id.is.null,last_cancelled_subscription_id.neq.' + subId)
    .select('id')

  if (error) throw error
  return !!(data && data.length > 0)
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

  // Fail-closed: reject all requests if the webhook secret is not configured.
  // A misconfigured secret means we cannot verify Stripe signatures — any
  // request would bypass authentication and could corrupt billing state.
  if (!WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is not set — rejecting request')
    return new Response('Internal configuration error', { status: 500 })
  }

  const body = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET)
  } catch (error: unknown) {
    const message = getErrorMessage(error)
    console.error('[stripe-webhook] signature verification failed:', message)
    return new Response('Webhook Error: ' + message, { status: 400 })
  }

  const vehiclePriceId = Deno.env.get('STRIPE_PER_VEHICLE_PRICE_ID') ?? ''
  const basePriceId = Deno.env.get('STRIPE_BASE_PRICE_ID') ?? ''

  try {
    // Fix 1: Skip duplicate Stripe deliveries
    if (await isEventProcessed(event.id)) {
      console.log('[stripe-webhook] duplicate event, skipping:', event.id)
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

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

          // Stale guard: skip if a different (newer) sub is already stored,
          // or if this sub was already cancelled (tombstone prevents resurrection).
          const { data: existingSub, error: existingSubErr } = await supabase
            .from('businesses')
            .select('stripe_subscription_id, last_cancelled_subscription_id')
            .eq('id', businessId)
            .maybeSingle()
          if (existingSubErr) throw existingSubErr

          if (existingSub?.stripe_subscription_id && existingSub.stripe_subscription_id !== subscriptionId) {
            console.log(
              '[stripe-webhook] skipping stale sub-mode checkout for sub:',
              subscriptionId,
              'stored:',
              existingSub.stripe_subscription_id,
            )
            break
          }
          if (!existingSub?.stripe_subscription_id && existingSub?.last_cancelled_subscription_id === subscriptionId) {
            console.log('[stripe-webhook] skipping sub-mode checkout for tombstoned sub:', subscriptionId)
            break
          }

          const sub = await stripe.subscriptions.retrieve(subscriptionId, {
            expand: ['items.data.price'],
          })
          const vehicleItemId = findVehicleItemId(sub.items.data, vehiclePriceId)

          // Atomic conditional write: guard against concurrent deletion race (TOCTOU).
          // The guard reads above are separate from this write, so a concurrent
          // customer.subscription.deleted could race in between. Apply the same
          // atomic conditional pattern as the subscription.created/updated handler.
          let subWriteQ = supabase.from('businesses').update({
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            stripe_vehicle_item_id: vehicleItemId,
          }).eq('id', businessId)

          if (existingSub?.stripe_subscription_id === subscriptionId) {
            // Sub already stored by subscription.created: only update while sub is still active.
            subWriteQ = subWriteQ.eq('stripe_subscription_id', subscriptionId)
          } else {
            // Slot is free: only write if slot still free and sub is not tombstoned.
            subWriteQ = subWriteQ
              .is('stripe_subscription_id', null)
              .or('last_cancelled_subscription_id.is.null,last_cancelled_subscription_id.neq.' + subscriptionId)
          }

          const { error: subWriteErr } = await subWriteQ
          if (subWriteErr) throw subWriteErr
        } else if (session.mode === 'payment') {
          const meta = (session.metadata ?? {}) as Record<string, string>
          const businessId = meta.business_id
          const paymentIntentId = session.payment_intent as string | null
          const customerId = typeof session.customer === 'string' ? session.customer : null

          console.log(
            '[stripe-webhook] payment mode - businessId:',
            businessId,
            'piId:',
            paymentIntentId,
            'customerId:',
            customerId,
          )

          if (!businessId || !paymentIntentId || !customerId) {
            console.log('[stripe-webhook] missing businessId, paymentIntentId, or customerId, skipping')
            break
          }

          // Check DB for existing subscription (fast-path guard before Stripe calls)
          const { data: existing, error: existingError } = await supabase
            .from('businesses')
            .select('stripe_subscription_id')
            .eq('id', businessId)
            .maybeSingle()
          if (existingError) throw existingError
          if (existing?.stripe_subscription_id) {
            console.log(
              '[stripe-webhook] subscription already exists, skipping:',
              existing.stripe_subscription_id,
            )
            break
          }

          const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
          const pmRaw = pi.payment_method
          const paymentMethodId = typeof pmRaw === 'string' ? pmRaw : (pmRaw as any)?.id ?? null

          console.log('[stripe-webhook] payment_method:', paymentMethodId, 'pi.status:', pi.status)

          if (!paymentMethodId) {
            throw new Error('No payment_method found on PaymentIntent ' + paymentIntentId)
          }

          const addonQty = parseAddonQuantity(meta.addon_qty)
          // Fix (retry robustness): clamp past anchors to now+60 so Stripe accepts trial_end
          const billingCycleAnchor = parseBillingCycleAnchor(meta.billing_cycle_anchor)

          // Fix 4: Re-read authoritative custom prices from DB, not session metadata.
          // Metadata is kept as a fallback only for environments without DB prices.
          const { data: bizPricing, error: bizPricingErr } = await supabase
            .from('businesses')
            .select('custom_base_price, custom_per_vehicle_price')
            .eq('id', businessId)
            .single()
          if (bizPricingErr) throw bizPricingErr

          const hasCustomBase = bizPricing.custom_base_price != null
          const hasCustomVehicle = bizPricing.custom_per_vehicle_price != null

          // Fix LOW: validate DB custom prices before use (Postgres check constraint already
          // enforces non-negative integer, but defend against unexpected null/NaN from DB cast)
          const baseFee = hasCustomBase
            ? parseRequiredJpyAmount(String(bizPricing.custom_base_price), 'custom_base_price')
            : (basePriceId ? 0 : parseRequiredJpyAmount(meta.base_fee, 'base_fee'))
          const perVehicleFee = hasCustomVehicle
            ? parseRequiredJpyAmount(String(bizPricing.custom_per_vehicle_price), 'custom_per_vehicle_price')
            : ((vehiclePriceId || addonQty === 0)
              ? 0
              : parseRequiredJpyAmount(meta.per_vehicle_fee, 'per_vehicle_fee'))

          // When a custom price is in effect, bypass the catalog price ID so
          // buildSubscriptionItems uses price_data with the correct unit_amount.
          const effectiveBasePriceId = hasCustomBase ? '' : basePriceId
          const effectiveVehiclePriceId = hasCustomVehicle ? '' : vehiclePriceId

          const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId)
          const attachedCustomerId = typeof paymentMethod.customer === 'string'
            ? paymentMethod.customer
            : (paymentMethod.customer as any)?.id ?? null

          if (!attachedCustomerId) {
            await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId })
          } else if (attachedCustomerId !== customerId) {
            throw new Error(
              'PaymentMethod ' + paymentMethodId + ' is attached to a different customer',
            )
          }

          const subscriptionItems = await buildSubscriptionItems({
            baseFee,
            perVehicleFee,
            addonQty,
            basePriceId: effectiveBasePriceId,
            perVehiclePriceId: effectiveVehiclePriceId,
          })

          console.log(
            '[stripe-webhook] creating subscription:',
            JSON.stringify({
              customerId,
              paymentMethodId,
              billingCycleAnchor,
              trialEnd: billingCycleAnchor,
              hasCustomBase,
              hasCustomVehicle,
              itemCount: subscriptionItems.length,
            }),
          )

          await supabase.from('webhook_debug').insert({
            event_type: 'checkout.session.completed',
            stage: 'pre_subscription_create',
            data: {
              customerId,
              paymentMethodId,
              billingCycleAnchor,
              baseFee,
              perVehicleFee,
              addonQty,
              hasCustomBase,
              hasCustomVehicle,
              itemCount: subscriptionItems.length,
            },
          }).then(({ error }) => {
            if (error) console.error('[webhook_debug insert pre]', error.message)
          })

          // Idempotency key: tie subscription creation to the PaymentIntent.
          // Stripe returns the same object on retries, preventing duplicate subscriptions.
          //
          // Design note: trial_end (not billing_cycle_anchor + proration_behavior) is used
          // deliberately. The initial fee was already collected via the one-time Checkout
          // payment. trial_end defers the first recurring charge to the 1st of next month
          // (JST) with zero proration. Using billing_cycle_anchor would cause Stripe to
          // issue an immediate prorated invoice, double-charging for the covered period.
          const sub = await stripe.subscriptions.create({
            customer: customerId,
            default_payment_method: paymentMethodId,
            items: subscriptionItems,
            trial_end: billingCycleAnchor,
            metadata: { business_id: businessId },
            expand: ['items.data.price'],
          }, {
            idempotencyKey: 'checkout_payment_' + paymentIntentId,
          })

          console.log('[stripe-webhook] subscription created:', sub.id, 'status:', sub.status)

          // Tombstone guard: Stripe's idempotency key can return the same sub object
          // from a prior call even if that sub was subsequently cancelled. Verify the
          // returned sub is not already tombstoned before reinstating it in the DB.
          const { data: bizLatest, error: bizLatestErr } = await supabase
            .from('businesses')
            .select('last_cancelled_subscription_id')
            .eq('id', businessId)
            .maybeSingle()
          if (bizLatestErr) throw bizLatestErr

          if (bizLatest?.last_cancelled_subscription_id === sub.id) {
            console.log('[stripe-webhook] subscriptions.create returned tombstoned sub, not reinstating:', sub.id)
            // Fall through to markEventProcessed without claiming the slot
          } else {
            // Fix HIGH: resolve vehicle item with index fallback for inline price_data
            const vehicleItemId = resolveVehicleItemId(sub.items.data, vehiclePriceId, addonQty)

            // Fix 2: Atomic claim -- only update if stripe_subscription_id is still NULL
            // AND this sub was not tombstoned (prevents reinstatement of a just-cancelled sub).
            const claimed = await claimSubscriptionSlot(businessId, sub.id, {
              stripe_customer_id: customerId,
              stripe_subscription_id: sub.id,
              subscription_status: mapStatus(sub.status),
              stripe_vehicle_item_id: vehicleItemId,
            })

            if (!claimed) {
              // Check whether the slot was taken by the SAME sub ID (normal race with
              // customer.subscription.created arriving first) or a genuinely different one.
              // Only cancel if it's a different subscription -- never cancel the current one.
              // Fail-safe: on DB error, do NOT cancel (preserve the subscription).
              const { data: raceCheck, error: raceCheckErr } = await supabase
                .from('businesses')
                .select('stripe_subscription_id')
                .eq('id', businessId)
                .maybeSingle()

              if (raceCheckErr) {
                console.error('[stripe-webhook] race check DB error, preserving sub:', sub.id, raceCheckErr.message)
              } else if (raceCheck?.stripe_subscription_id === sub.id) {
                console.log('[stripe-webhook] slot taken by same sub (sub.created race), ok:', sub.id)
              } else {
                console.log('[stripe-webhook] slot taken by different sub, cancelling race loser:', sub.id)
                await stripe.subscriptions.cancel(sub.id).catch((e) =>
                  console.error('[stripe-webhook] cancel failed:', getErrorMessage(e))
                )
              }
            }
          }
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

        // Stale guard: skip if a different active sub is stored, or if this sub
        // was already cancelled (tombstone prevents late-arriving events from
        // resurrecting a deleted subscription's state in the DB).
        const { data: storedBiz, error: storedBizErr } = await supabase
          .from('businesses')
          .select('stripe_subscription_id, last_cancelled_subscription_id')
          .eq('id', businessId)
          .maybeSingle()
        if (storedBizErr) throw storedBizErr

        if (storedBiz?.stripe_subscription_id && storedBiz.stripe_subscription_id !== sub.id) {
          console.log(
            '[stripe-webhook] skipping stale sub event, stored:',
            storedBiz.stripe_subscription_id,
            'event sub:',
            sub.id,
          )
          break
        }
        if (!storedBiz?.stripe_subscription_id && storedBiz?.last_cancelled_subscription_id === sub.id) {
          console.log('[stripe-webhook] skipping resurrection event for tombstoned sub:', sub.id)
          break
        }

        // Fix MEDIUM: use index fallback for inline price_data items (no metadata on Price)
        const vehicleItemId = resolveVehicleItemId(sub.items.data, vehiclePriceId, sub.items.data.length > 1 ? 1 : 0)
        const trialEnd = sub.trial_end
          ? new Date(sub.trial_end * 1000).toISOString()
          : null

        const subPatch = {
          stripe_customer_id: sub.customer as string | null,
          stripe_subscription_id: sub.id,
          subscription_status: mapStatus(sub.status),
          subscription_period_end: sub.current_period_end
            ? new Date(sub.current_period_end * 1000).toISOString()
            : null,
          trial_ends_at: trialEnd,
          stripe_vehicle_item_id: vehicleItemId,
        }

        // Sequential two-phase write -- does not rely on the stale guard read above
        // for the write condition, closing the TOCTOU between read and write.
        //
        // Phase A: slot already has this sub (handles subscription.updated after .created,
        //          and the race where checkout.session.completed claimed the slot first).
        //          Fires as a no-op if sub is not yet in the slot.
        const { data: phaseA, error: phaseAErr } = await supabase
          .from('businesses')
          .update(subPatch)
          .eq('id', businessId)
          .eq('stripe_subscription_id', sub.id)
          .select('id')
        if (phaseAErr) throw phaseAErr

        if (!phaseA || phaseA.length === 0) {
          // Phase B: slot is free -- only write if null and not tombstoned.
          // If checkout.session.completed concurrently claimed the slot between
          // Phase A and Phase B, Phase A would have succeeded on the next
          // subscription.updated event; Phase B here safely becomes a no-op.
          const { error: phaseBErr } = await supabase
            .from('businesses')
            .update(subPatch)
            .eq('id', businessId)
            .is('stripe_subscription_id', null)
            .or('last_cancelled_subscription_id.is.null,last_cancelled_subscription_id.neq.' + sub.id)
          if (phaseBErr) throw phaseBErr
        }
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

        // Fully atomic deletion: no pre-read. The WHERE clause enforces that
        // only the currently active sub is cleared. The pre-read + break pattern
        // has a TOCTOU window; a direct guarded write removes it entirely.
        // If 0 rows are affected: sub was not active (already cancelled or different
        // sub stored) -- log and skip rather than marking a ghost deletion.
        const { data: delData, error: delErr } = await supabase
          .from('businesses')
          .update({
            subscription_status: 'canceled',
            subscription_period_end: null,
            trial_ends_at: null,
            stripe_subscription_id: null,
            stripe_vehicle_item_id: null,
            // Tombstone: record the cancelled sub ID so late-arriving events
            // (subscription.updated, invoice.*) for this sub cannot resurrect
            // the cancelled state after stripe_subscription_id has been nulled.
            last_cancelled_subscription_id: sub.id,
          })
          .eq('id', businessId)
          .eq('stripe_subscription_id', sub.id)
          .select('id')
        if (delErr) throw delErr
        if (!delData || delData.length === 0) {
          console.log('[stripe-webhook] deletion no-op, sub not currently active:', sub.id)
        }
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const businessId = await resolveBusinessId({
          subscriptionId: invoice.subscription as string | null,
          customerId: invoice.customer as string | null,
        })
        if (!businessId || !invoice.id) break

        // Stale guard: skip invoices from non-current or tombstoned subscriptions.
        // Fail-closed on DB error to prevent stale writes.
        if (invoice.subscription) {
          const { data: storedBiz, error: storedBizErr } = await supabase
            .from('businesses')
            .select('stripe_subscription_id, last_cancelled_subscription_id')
            .eq('id', businessId)
            .maybeSingle()

          if (storedBizErr) throw storedBizErr

          if (
            storedBiz?.stripe_subscription_id &&
            invoice.subscription !== storedBiz.stripe_subscription_id
          ) {
            console.log('[stripe-webhook] skipping invoice.paid for non-current sub:', invoice.subscription)
            break
          }
          if (!storedBiz?.stripe_subscription_id && storedBiz?.last_cancelled_subscription_id === invoice.subscription) {
            console.log('[stripe-webhook] skipping invoice.paid for tombstoned sub:', invoice.subscription)
            break
          }
        }

        await upsertSubscriptionBillingEvent({
          businessId,
          invoiceId: invoice.id,
          amount: invoice.amount_paid,
          status: 'paid',
          createdAt: new Date(invoice.created * 1000).toISOString(),
        })
        // stripe_subscription_id is intentionally NOT updated here.
        // subscription.created/updated events handle the authoritative sub ID write.
        // Writing it from invoice.paid could resurrect a cancelled sub ID in a race.
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const businessId = await resolveBusinessId({
          subscriptionId: invoice.subscription as string | null,
          customerId: invoice.customer as string | null,
        })
        if (!businessId || !invoice.id) break

        // Stale guard: skip invoices from non-current or tombstoned subscriptions.
        // Fail-closed on DB error to prevent stale writes.
        if (invoice.subscription) {
          const { data: storedBiz, error: storedBizErr } = await supabase
            .from('businesses')
            .select('stripe_subscription_id, last_cancelled_subscription_id')
            .eq('id', businessId)
            .maybeSingle()

          if (storedBizErr) throw storedBizErr

          if (
            storedBiz?.stripe_subscription_id &&
            invoice.subscription !== storedBiz.stripe_subscription_id
          ) {
            console.log('[stripe-webhook] skipping invoice.payment_failed for non-current sub:', invoice.subscription)
            break
          }
          if (!storedBiz?.stripe_subscription_id && storedBiz?.last_cancelled_subscription_id === invoice.subscription) {
            console.log('[stripe-webhook] skipping invoice.payment_failed for tombstoned sub:', invoice.subscription)
            break
          }
        }

        await upsertSubscriptionBillingEvent({
          businessId,
          invoiceId: invoice.id,
          amount: invoice.amount_due,
          status: 'failed',
          createdAt: new Date(invoice.created * 1000).toISOString(),
        })

        // Conditional status update: only mark past_due if the subscription is still
        // actively stored (prevents resurrecting past_due status after cancellation).
        // stripe_subscription_id is intentionally NOT written here (same reason as invoice.paid).
        if (invoice.subscription) {
          const { error: pastDueErr } = await supabase
            .from('businesses')
            .update({ subscription_status: 'past_due' })
            .eq('id', businessId)
            .eq('stripe_subscription_id', invoice.subscription as string)
          if (pastDueErr) throw pastDueErr
        }
        break
      }

      default:
        console.log('[stripe-webhook] unhandled event: ' + event.type)
    }

    // Fix 1: Mark event as successfully processed (prevents Stripe retry re-execution)
    await markEventProcessed(event.id, event.type)

  } catch (error: unknown) {
    const message = getErrorMessage(error)
    const stack = error instanceof Error ? error.stack : undefined
    console.error('[stripe-webhook] handler error:', message)
    if (stack) {
      console.error('[stripe-webhook] handler stack:', stack)
    }
    await supabase.from('webhook_debug').insert({
      event_type: (event as any)?.type ?? 'unknown',
      stage: 'error',
      data: { message, stack: stack ?? null },
    }).then(({ error: dbErr }) => {
      if (dbErr) console.error('[webhook_debug insert error]', dbErr.message)
    })
    // Do NOT mark as processed — let Stripe retry on 500
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

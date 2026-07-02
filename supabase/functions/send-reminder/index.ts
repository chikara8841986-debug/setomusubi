// Supabase Edge Function: send-reminder
// Cron: "0 * * * *" (毎時0分・JST基準で判定)
// 1) 確定予約の1時間前リマインド
// 2) 期限切れ pending（乗車時刻を過ぎた申請）の自動失効＋MSWへ通知
// 3) 放置 pending（一定時間未対応）の事業者へのナッジ
// 4) notification_log の失敗分の再送（B1: outboxリトライ、最大3回・直近24時間）

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://setomusubi.vercel.app'

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

// ── JST ヘルパー（reservation_date / start_time は JST の壁時計で保存されている）──
function jstDate(d: Date): string {
  // 'YYYY-MM-DD'
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}
function jstTime(d: Date): string {
  // 'HH:MM:SS'
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(d)
}

// 通知ディスパッチ層(notify)へ委譲：ユーザーの有効チャネル(メール/LINE…)へ配信
async function dispatch(userId: string | null | undefined, subject: string, text: string) {
  if (!userId) return
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, subject, text }),
    })
  } catch (e) {
    console.error('[dispatch]', e)
  }
}

// ── 1) 確定予約の1時間前リマインド ──
async function sendConfirmedReminders(now: Date): Promise<number> {
  const ws = new Date(now.getTime() + 50 * 60 * 1000)
  const we = new Date(now.getTime() + 70 * 60 * 1000)
  const targetDate = jstDate(ws)
  const wsTime = jstTime(ws)
  const weTime = jstTime(we)

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select(`
      id, contact_name, patient_name, patient_address, destination,
      reservation_date, start_time, end_time,
      businesses!inner(name, cancel_phone, user_id),
      hospitals!inner(name, user_id)
    `)
    .eq('reservation_date', targetDate)
    .gte('start_time', wsTime)
    .lte('start_time', weTime)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)

  if (error) { console.error('reminder query error:', error); return 0 }
  if (!reservations || reservations.length === 0) return 0

  let sent = 0
  for (const res of reservations) {
    const biz = res.businesses as { name: string; cancel_phone: string | null; user_id: string }
    const hosp = res.hospitals as { name: string; user_id: string }
    const body = `【せとむすび】1時間前リマインド

まもなく予約の時間です。

━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${String(res.start_time).slice(0,5)}〜${String(res.end_time).slice(0,5)}
事業所: ${biz.name}
病院: ${hosp.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
━━━━━━━━━━━━━━━━

せとむすび
`
    await Promise.all([
      dispatch(biz.user_id, '【せとむすび】1時間前リマインド', body),
      dispatch(hosp.user_id, '【せとむすび】1時間前リマインド', body),
    ])
    await supabase.from('reservations').update({ reminder_sent: true }).eq('id', res.id)
    sent++
  }
  return sent
}

// ── 2) 期限切れ pending の自動失効（乗車終了時刻を過ぎても未承認のもの）──
async function expireStalePending(now: Date): Promise<number> {
  const nowDate = jstDate(now)
  const nowTime = jstTime(now)

  const { data: rows, error } = await supabase
    .from('reservations')
    .select(`
      id, contact_name, patient_name,
      reservation_date, start_time, end_time, equipment,
      businesses(name, cancel_phone),
      hospitals(name, user_id)
    `)
    .eq('status', 'pending')
    .or(`reservation_date.lt.${nowDate},and(reservation_date.eq.${nowDate},end_time.lt.${nowTime})`)

  if (error) { console.error('expire query error:', error); return 0 }
  if (!rows || rows.length === 0) return 0

  let expired = 0
  for (const res of rows) {
    // status を cancelled にすると auto_delete_occupied_slot で車両枠が解放される
    const { error: upErr } = await supabase
      .from('reservations').update({ status: 'cancelled' }).eq('id', res.id).eq('status', 'pending')
    if (upErr) { console.error('expire update error:', upErr); continue }

    const hosp = res.hospitals as { name: string; user_id: string } | null
    const biz = res.businesses as { name: string; cancel_phone: string | null } | null
    if (hosp?.user_id) {
      const body = `【せとむすび】申請が期限切れになりました

下記の仮予約申請は、事業所からの承認がないままご希望日時を過ぎたため、無効となりました。
お手数ですが、別の事業所をお探しのうえ改めてご申請ください。

━━━━━━━━━━━━━━━━
希望日時: ${res.reservation_date} ${String(res.start_time).slice(0,5)}〜${String(res.end_time).slice(0,5)}
事業所: ${biz?.name ?? ''}
担当者: ${res.contact_name ?? ''}
患者: ${res.patient_name ?? ''}
━━━━━━━━━━━━━━━━

▶ 別の事業所を検索する
${APP_URL}/msw/search

せとむすび
`
      await dispatch(hosp.user_id, '【せとむすび】申請が期限切れになりました', body)
    }
    expired++
  }
  return expired
}

// ── 3) 放置 pending の事業者へのナッジ（申請から3時間以上未対応・乗車はまだ先）──
async function nudgePendingBusiness(now: Date): Promise<number> {
  const nowDate = jstDate(now)
  const nowTime = jstTime(now)
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString()

  const { data: rows, error } = await supabase
    .from('reservations')
    .select(`
      id, contact_name, patient_name,
      reservation_date, start_time, end_time,
      businesses!inner(name, user_id),
      hospitals(name)
    `)
    .eq('status', 'pending')
    .eq('pending_reminder_sent', false)
    .lt('created_at', threeHoursAgo)
    .or(`reservation_date.gt.${nowDate},and(reservation_date.eq.${nowDate},end_time.gte.${nowTime})`)

  if (error) { console.error('nudge query error:', error); return 0 }
  if (!rows || rows.length === 0) return 0

  let nudged = 0
  for (const res of rows) {
    const biz = res.businesses as { name: string; user_id: string }
    const hosp = res.hospitals as { name: string } | null
    const body = `【せとむすび】未対応の仮予約申請があります

下記の申請が3時間以上、未対応のままです。
承認またはお断りのご対応をお願いします。承認されない間、この車両のこの時間帯は他のMSWからも予約できません。

━━━━━━━━━━━━━━━━
希望日時: ${res.reservation_date} ${String(res.start_time).slice(0,5)}〜${String(res.end_time).slice(0,5)}
病院: ${hosp?.name ?? ''}
担当者: ${res.contact_name ?? ''}
患者: ${res.patient_name ?? ''}
━━━━━━━━━━━━━━━━

▶ 申請を確認する
${APP_URL}/business/reservations

せとむすび
`
    await dispatch(biz.user_id, '【せとむすび】未対応の仮予約申請があります', body)
    await supabase.from('reservations').update({ pending_reminder_sent: true }).eq('id', res.id)
    nudged++
  }
  return nudged
}

// ── 4) notification_log の失敗分の再送 ──
async function retryFailedNotifications(): Promise<{ retried: number; succeeded: number }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ retry: true }),
    })
    if (!res.ok) { console.error('[retry] notify returned', res.status); return { retried: 0, succeeded: 0 } }
    const data = await res.json()
    return { retried: data.retried ?? 0, succeeded: data.succeeded ?? 0 }
  } catch (e) {
    console.error('[retry] request failed', e)
    return { retried: 0, succeeded: 0 }
  }
}

Deno.serve(async () => {
  const now = new Date()
  const result = { reminded: 0, expired: 0, nudged: 0, retried: 0, retrySucceeded: 0 }
  try { result.reminded = await sendConfirmedReminders(now) } catch (e) { console.error('reminder pass failed', e) }
  try { result.expired = await expireStalePending(now) } catch (e) { console.error('expire pass failed', e) }
  try { result.nudged = await nudgePendingBusiness(now) } catch (e) { console.error('nudge pass failed', e) }
  try {
    const retry = await retryFailedNotifications()
    result.retried = retry.retried
    result.retrySucceeded = retry.succeeded
  } catch (e) { console.error('retry pass failed', e) }
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
})

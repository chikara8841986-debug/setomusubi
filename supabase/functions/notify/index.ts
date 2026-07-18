// Supabase Edge Function: notify（通知ディスパッチ層）
// 「誰に(user_id)・何を(subject/text)」を受け取り、有効チャネルへ配信する。
// - メール: 既定ON（フォールバックの基本線）
// - LINE:   line_user_id があり notify_line=true、かつ LINE_CHANNEL_ACCESS_TOKEN 設定時のみ
// - SMS:    将来ここにアダプタを足すだけ
//
// 宛先解決:
//   1) user_id（=組織オーナーのauthアカウント）本人
//   2) そのオーナーが属する組織（事業所/病院）に登録された追加スタッフ宛先
//      （notification_recipients）— これによりオーナー＋スタッフ全員へ配信できる。
//   宛先はメールアドレス／LINE userId で重複排除する。
//
// 送信結果は notification_log に記録する（B1: outbox）。
// { retry: true } で呼ぶと、直近24時間以内の失敗分（retry_count<3）を再送する。
//
// 内部専用。呼び出し側は SERVICE_ROLE_KEY を Bearer に付けて叩く。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@send.hakobite-marugame.com'
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''

const MAX_RETRY = 3
const RETRY_WINDOW_HOURS = 24

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

type Endpoint = {
  email?: string | null
  lineUserId?: string | null
  notifyEmail: boolean
  notifyLine: boolean
}

type SendResult = { ok: boolean; error?: string }

async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!RESEND_API_KEY) {
    console.log('[notify/email DEV] to:', to, 'subject:', subject)
    return { ok: true }
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `せとむすび <${FROM_EMAIL}>`, to: [to], subject, text }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('[notify/email] Resend error:', errText)
    return { ok: false, error: errText.slice(0, 500) }
  }
  return { ok: true }
}

async function sendLinePush(lineUserId: string, _subject: string, text: string): Promise<SendResult> {
  if (!LINE_TOKEN) return { ok: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' }
  // textは呼び出し元(各send-*関数)が組み立てる時点ですでに「【せとむすび】〇〇」の見出し行を
  // 自身で含んでいる。ここでさらにsubjectを【】で囲んで前置すると見出しが二重表示になるため、
  // LINEにはtextをそのまま送る(subjectはメール件名としてのみ使う)。
  const message = text.trim().slice(0, 4900)
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] }),
  })
  if (!res.ok) {
    const errText = await res.text()
    console.error('[notify/line] push error:', errText)
    return { ok: false, error: errText.slice(0, 500) }
  }
  return { ok: true }
}

async function logSend(entry: {
  userId: string | null
  businessId: string | null
  hospitalId: string | null
  channel: 'email' | 'line'
  recipient: string
  subject: string
  message: string
  result: SendResult
}) {
  const { error } = await supabase.from('notification_log').insert({
    user_id: entry.userId,
    business_id: entry.businessId,
    hospital_id: entry.hospitalId,
    channel: entry.channel,
    recipient: entry.recipient,
    subject: entry.subject,
    message: entry.message,
    status: entry.result.ok ? 'sent' : 'failed',
    error: entry.result.error ?? null,
  })
  if (error) console.error('[notify/log] insert failed:', error.message)
}

// 直近失敗分の再送（cron から { retry: true } で呼ばれる）
async function retryFailed() {
  const since = new Date(Date.now() - RETRY_WINDOW_HOURS * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from('notification_log')
    .select('id, channel, recipient, subject, message, retry_count')
    .eq('status', 'failed')
    .lt('retry_count', MAX_RETRY)
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) { console.error('[notify/retry] query error:', error); return { retried: 0, succeeded: 0 } }
  if (!rows || rows.length === 0) return { retried: 0, succeeded: 0 }

  let succeeded = 0
  for (const row of rows) {
    const result = row.channel === 'email'
      ? await sendEmail(row.recipient, row.subject, row.message)
      : await sendLinePush(row.recipient, row.subject, row.message)

    await supabase.from('notification_log').update({
      status: result.ok ? 'sent' : 'failed',
      error: result.ok ? null : (result.error ?? null),
      retry_count: row.retry_count + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', row.id)

    if (result.ok) succeeded++
  }
  return { retried: rows.length, succeeded }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // 内部専用ガード：SERVICE_ROLE_KEY を持つ呼び出しのみ許可
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: 'forbidden' }, 403)

  try {
    const body = await req.json()

    if (body?.retry === true) {
      const result = await retryFailed()
      return json({ ok: true, ...result })
    }

    const { user_id, business_id, hospital_id, subject, text } = body
    if (!subject || !text || (!user_id && !business_id && !hospital_id)) {
      return json({ error: 'subject, text and one of user_id/business_id/hospital_id are required' }, 400)
    }

    const endpoints: Endpoint[] = []
    let orgBusinessId: string | null = business_id ?? null
    let orgHospitalId: string | null = hospital_id ?? null

    // 1) オーナー本人（user_id）
    if (user_id) {
      const [{ data: userData }, { data: profile }] = await Promise.all([
        supabase.auth.admin.getUserById(user_id),
        supabase.from('profiles').select('line_user_id, notify_line, notify_email').eq('id', user_id).maybeSingle(),
      ])
      endpoints.push({
        email: userData?.user?.email ?? null,
        lineUserId: profile?.line_user_id ?? null,
        notifyEmail: profile?.notify_email !== false,
        notifyLine: profile?.notify_line !== false,
      })

      // user_id から所属組織を導出（明示指定が無い場合）
      if (!orgBusinessId && !orgHospitalId) {
        const [{ data: biz }, { data: hosp }] = await Promise.all([
          supabase.from('businesses').select('id').eq('user_id', user_id).maybeSingle(),
          supabase.from('hospitals').select('id').eq('user_id', user_id).maybeSingle(),
        ])
        orgBusinessId = biz?.id ?? null
        orgHospitalId = hosp?.id ?? null
      }
    }

    // 2) 組織に登録された追加スタッフ宛先
    if (orgBusinessId || orgHospitalId) {
      const q = supabase
        .from('notification_recipients')
        .select('email, line_user_id, notify_email, notify_line')
        .eq('active', true)
      const { data: recipients } = orgBusinessId
        ? await q.eq('business_id', orgBusinessId)
        : await q.eq('hospital_id', orgHospitalId!)
      for (const r of recipients ?? []) {
        endpoints.push({
          email: r.email,
          lineUserId: r.line_user_id,
          notifyEmail: r.notify_email !== false,
          notifyLine: r.notify_line !== false,
        })
      }
    }

    // 重複排除しつつ配信・記録
    const sentEmails = new Set<string>()
    const sentLine = new Set<string>()
    const fired = { email: 0, line: 0 }

    for (const ep of endpoints) {
      if (ep.email && ep.notifyEmail && !sentEmails.has(ep.email)) {
        sentEmails.add(ep.email)
        const result = await sendEmail(ep.email, subject, text)
        if (result.ok) fired.email++
        await logSend({
          userId: user_id ?? null, businessId: orgBusinessId, hospitalId: orgHospitalId,
          channel: 'email', recipient: ep.email, subject, message: text, result,
        })
      }
      if (ep.lineUserId && ep.notifyLine && !sentLine.has(ep.lineUserId)) {
        sentLine.add(ep.lineUserId)
        const result = await sendLinePush(ep.lineUserId, subject, text)
        if (result.ok) fired.line++
        await logSend({
          userId: user_id ?? null, businessId: orgBusinessId, hospitalId: orgHospitalId,
          channel: 'line', recipient: ep.lineUserId, subject, message: text, result,
        })
      }
    }

    return json({ ok: true, fired })
  } catch (e: any) {
    console.error('[notify]', e)
    return json({ error: e.message }, 500)
  }
})

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
// 内部専用。呼び出し側は SERVICE_ROLE_KEY を Bearer に付けて叩く。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@send.hakobite-marugame.com'
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''

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

async function sendEmail(to: string, subject: string, text: string) {
  if (!RESEND_API_KEY) {
    console.log('[notify/email DEV] to:', to, 'subject:', subject)
    return true
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `せとむすび <${FROM_EMAIL}>`, to: [to], subject, text }),
  })
  if (!res.ok) { console.error('[notify/email] Resend error:', await res.text()); return false }
  return true
}

async function sendLinePush(lineUserId: string, subject: string, text: string) {
  if (!LINE_TOKEN) return false // トークン未設定なら送らない（メールのみで運用）
  const message = `【${subject}】\n\n${text}`.slice(0, 4900)
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: message }] }),
  })
  if (!res.ok) { console.error('[notify/line] push error:', await res.text()); return false }
  return true
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  // 内部専用ガード：SERVICE_ROLE_KEY を持つ呼び出しのみ許可
  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) return json({ error: 'forbidden' }, 403)

  try {
    const { user_id, business_id, hospital_id, subject, text } = await req.json()
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

    // 重複排除しつつ配信
    const sentEmails = new Set<string>()
    const sentLine = new Set<string>()
    const fired = { email: 0, line: 0 }

    for (const ep of endpoints) {
      if (ep.email && ep.notifyEmail && !sentEmails.has(ep.email)) {
        sentEmails.add(ep.email)
        if (await sendEmail(ep.email, subject, text)) fired.email++
      }
      if (ep.lineUserId && ep.notifyLine && !sentLine.has(ep.lineUserId)) {
        sentLine.add(ep.lineUserId)
        if (await sendLinePush(ep.lineUserId, subject, text)) fired.line++
      }
    }

    return json({ ok: true, fired })
  } catch (e: any) {
    console.error('[notify]', e)
    return json({ error: e.message }, 500)
  }
})

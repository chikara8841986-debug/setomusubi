// Supabase Edge Function: notify（通知ディスパッチ層）
// 「誰に(user_id)・何を(subject/text)」を受け取り、そのユーザーの有効チャネルへ配信する。
// - メール: 既定ON（フォールバックの基本線）
// - LINE:   profiles.line_user_id があり notify_line=true、かつ LINE_CHANNEL_ACCESS_TOKEN 設定時のみ
// - SMS:    将来ここにアダプタを足すだけ
//
// 内部専用。呼び出し側（各 send-* Edge Function / cron）は SERVICE_ROLE_KEY を Bearer に付けて叩く。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@send.hakobite-marugame.com'
const LINE_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
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
  // LINE の1メッセージは5000字まで。件名＋本文を1テキストに。
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
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ error: 'forbidden' }, 403)
  }

  try {
    const { user_id, subject, text } = await req.json()
    if (!user_id || !subject || !text) {
      return json({ error: 'user_id, subject, text are required' }, 400)
    }

    // チャネル解決
    const [{ data: userData }, { data: profile }] = await Promise.all([
      supabase.auth.admin.getUserById(user_id),
      supabase.from('profiles').select('line_user_id, notify_line, notify_email').eq('id', user_id).maybeSingle(),
    ])

    const email = userData?.user?.email ?? null
    const notifyEmail = profile?.notify_email !== false
    const lineUserId = profile?.line_user_id ?? null
    const notifyLine = profile?.notify_line !== false

    const fired: string[] = []

    if (email && notifyEmail) {
      if (await sendEmail(email, subject, text)) fired.push('email')
    }
    if (lineUserId && notifyLine) {
      if (await sendLinePush(lineUserId, subject, text)) fired.push('line')
    }

    return json({ ok: true, fired })
  } catch (e: any) {
    console.error('[notify]', e)
    return json({ error: e.message }, 500)
  }
})

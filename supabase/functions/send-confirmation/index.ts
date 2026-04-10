// Supabase Edge Function: send-confirmation
// 予約確定時にWebhookまたはDB Triggerから呼ばれる
// Resend等のメールサービスと連携して確定メールを送信する

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = 'noreply@setomusubi.jp'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://setomusubi.vercel.app'

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.log('[DEV] Email to:', to, '\nSubject:', subject)
    return
  }
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject,
      text: body,
    }),
  })
}

Deno.serve(async (req) => {
  const { reservation_id } = await req.json()
  if (!reservation_id) {
    return new Response('reservation_id required', { status: 400 })
  }

  const { data: res } = await supabase
    .from('reservations')
    .select(`
      *,
      businesses(name, cancel_phone, user_id),
      hospitals(name, user_id)
    `)
    .eq('id', reservation_id)
    .single()

  if (!res) return new Response('Not found', { status: 404 })

  const body = `
【せとむすび】予約確定のお知らせ

以下の内容で予約が確定しました。

━━━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
事業所: ${res.businesses?.name}
病院: ${res.hospitals?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
使用機材: ${EQUIPMENT_LABELS[res.equipment] ?? res.equipment}
機材貸出: ${res.equipment_rental ? 'あり' : 'なし'}
${res.notes ? `備考: ${res.notes}` : ''}
━━━━━━━━━━━━━━━━━━

キャンセルの場合は事業所へ直接ご連絡ください。
${res.businesses?.cancel_phone ? `キャンセル連絡先: ${res.businesses.cancel_phone}` : ''}

▶ 予約確認
${APP_URL}/msw/reservations

せとむすび
`

  // Get business email
  const { data: bizUser } = await supabase.auth.admin.getUserById(res.businesses?.user_id ?? '')
  const { data: hospUser } = await supabase.auth.admin.getUserById(res.hospitals?.user_id ?? '')

  const emailPromises = []
  if (bizUser?.user?.email) {
    emailPromises.push(sendEmail(bizUser.user.email, '【せとむすび】予約確定のお知らせ', body))
  }
  if (hospUser?.user?.email) {
    emailPromises.push(sendEmail(hospUser.user.email, '【せとむすび】予約確定のお知らせ', body))
  }

  await Promise.all(emailPromises)

  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } })
})

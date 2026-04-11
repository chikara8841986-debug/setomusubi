// Supabase Edge Function: send-rejection
// 事業所が仮予約を却下した際にMSW担当者へ通知メールを送る

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@setomusubi.jp'
const APP_URL = Deno.env.get('APP_URL') ?? 'https://setomusubi.vercel.app'

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.log('[DEV] Email to:', to, '\nSubject:', subject, '\n', body)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text: body }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
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
      businesses(name, cancel_phone),
      hospitals(name, user_id)
    `)
    .eq('id', reservation_id)
    .single()

  if (!res) return new Response('Not found', { status: 404 })

  const body = `
【せとむすび】仮予約が却下されました

申し訳ありませんが、以下の仮予約申請が事業所により却下されました。
別の事業所を検索してご利用ください。

━━━━━━━━━━━━━━━━━━
希望日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
事業所: ${res.businesses?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
━━━━━━━━━━━━━━━━━━

▶ 別の事業所を検索する
${APP_URL}/msw/search

せとむすび
`

  const { data: hospUser } = await supabase.auth.admin.getUserById(
    res.hospitals?.user_id ?? ''
  )

  if (hospUser?.user?.email) {
    await sendEmail(
      hospUser.user.email,
      '【せとむすび】仮予約が却下されました',
      body
    )
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

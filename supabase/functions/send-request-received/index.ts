// Supabase Edge Function: send-request-received
// 仮予約申請が届いた時に事業所へ通知メールを送る
// MSW側の申請フロー完了後に呼ばれる

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = 'noreply@setomusubi.jp'
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
      businesses(name, cancel_phone, user_id),
      hospitals(name, user_id)
    `)
    .eq('id', reservation_id)
    .single()

  if (!res) return new Response('Not found', { status: 404 })

  const EQUIPMENT_LABELS: Record<string, string> = {
    wheelchair: '車椅子',
    reclining_wheelchair: 'リクライニング車椅子',
    stretcher: 'ストレッチャー',
  }

  const businessBody = `
【せとむすび】新しい仮予約申請が届きました

${res.hospitals?.name} から仮予約の申請がありました。
内容を確認して承認または却下してください。

━━━━━━━━━━━━━━━━━━
希望日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
病院: ${res.hospitals?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
使用機材: ${EQUIPMENT_LABELS[res.equipment] ?? res.equipment}
機材貸出: ${res.equipment_rental ? 'あり' : 'なし'}
${res.notes ? `備考: ${res.notes}` : ''}
━━━━━━━━━━━━━━━━━━

▶ 承認・却下はこちら
${APP_URL}/business/reservations

せとむすび
`

  const { data: bizUser } = await supabase.auth.admin.getUserById(
    res.businesses?.user_id ?? ''
  )

  if (bizUser?.user?.email) {
    await sendEmail(
      bizUser.user.email,
      '【せとむすび】新しい仮予約申請が届きました',
      businessBody
    )
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
})

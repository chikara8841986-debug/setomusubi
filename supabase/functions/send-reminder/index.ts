// Supabase Edge Function: send-reminder
// Cron: "0 * * * *" (毎時0分)
// 予約開始1時間前にリマインドメールを送信し、reminder_sent=trueにする

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@setomusubi.jp'

async function sendEmail(to: string, subject: string, body: string) {
  if (!RESEND_API_KEY) {
    console.log('[DEV] Email to:', to, '\nSubject:', subject)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, text: body }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

Deno.serve(async () => {
  const now = new Date()
  // 50〜70分後の予約を対象（毎時実行なので±10分ウィンドウ）
  const windowStart = new Date(now.getTime() + 50 * 60 * 1000)
  const windowEnd = new Date(now.getTime() + 70 * 60 * 1000)

  const targetDate = windowStart.toISOString().split('T')[0]
  const wsTime = windowStart.toTimeString().slice(0, 8)
  const weTime = windowEnd.toTimeString().slice(0, 8)

  // 未送信かつ対象時間帯の確定済み予約を取得
  const { data: reservations, error } = await supabase
    .from('reservations')
    .select(`
      id, contact_name, patient_name, patient_address, destination,
      equipment, equipment_rental, notes,
      reservation_date, start_time, end_time,
      businesses!inner(name, cancel_phone, user_id),
      hospitals!inner(name, user_id)
    `)
    .eq('reservation_date', targetDate)
    .gte('start_time', wsTime)
    .lte('start_time', weTime)
    .eq('status', 'confirmed')
    .eq('reminder_sent', false)

  if (error) {
    console.error('Query error:', error)
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  if (!reservations || reservations.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  let sent = 0
  for (const res of reservations) {
    const biz = res.businesses as { name: string; cancel_phone: string | null; user_id: string }
    const hosp = res.hospitals as { name: string; user_id: string }

    const body = `【せとむすび】1時間前リマインド

まもなく予約の時間です。

━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
事業所: ${biz.name}
病院: ${hosp.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
━━━━━━━━━━━━━━━━

せとむすび
`

    // Get emails from auth
    const [{ data: bizUser }, { data: hospUser }] = await Promise.all([
      supabase.auth.admin.getUserById(biz.user_id),
      supabase.auth.admin.getUserById(hosp.user_id),
    ])

    const emailPromises = []
    if (bizUser?.user?.email) emailPromises.push(sendEmail(bizUser.user.email, '【せとむすび】1時間前リマインド', body))
    if (hospUser?.user?.email) emailPromises.push(sendEmail(hospUser.user.email, '【せとむすび】1時間前リマインド', body))
    await Promise.all(emailPromises)

    // Mark as sent
    await supabase.from('reservations').update({ reminder_sent: true }).eq('id', res.id)
    sent++
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})

// Supabase Edge Function: send-reminder
// スケジュール: every hour (cron: "0 * * * *")
// 予約開始1時間前にリマインドメールを送信する

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async () => {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  const targetDate = oneHourLater.toISOString().split('T')[0]
  const targetHour = oneHourLater.getHours().toString().padStart(2, '0')
  const targetMin = oneHourLater.getMinutes().toString().padStart(2, '0')
  const targetTime = `${targetHour}:${targetMin}:00`

  // Find confirmed reservations starting in about 1 hour (within 5 min window)
  const windowStart = new Date(oneHourLater.getTime() - 5 * 60 * 1000)
  const windowEnd = new Date(oneHourLater.getTime() + 5 * 60 * 1000)

  const wsTime = `${windowStart.getHours().toString().padStart(2,'0')}:${windowStart.getMinutes().toString().padStart(2,'0')}:00`
  const weTime = `${windowEnd.getHours().toString().padStart(2,'0')}:${windowEnd.getMinutes().toString().padStart(2,'0')}:00`

  const { data: reservations } = await supabase
    .from('reservations')
    .select(`
      *,
      businesses(name, phone),
      hospitals(name)
    `)
    .eq('reservation_date', targetDate)
    .gte('start_time', wsTime)
    .lte('start_time', weTime)
    .eq('status', 'confirmed')

  if (!reservations || reservations.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } })
  }

  let sent = 0
  for (const res of reservations) {
    // Get business user email
    const { data: bizProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', res.businesses?.user_id ?? '')
      .single()

    const { data: hospProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', res.hospitals?.user_id ?? '')
      .single()

    const reminderBody = `
【せとむすび】予約リマインド

1時間後に予約が開始されます。

━━━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
事業所: ${res.businesses?.name}
病院: ${res.hospitals?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
━━━━━━━━━━━━━━━━━━

せとむすび
`
    // Send via Supabase Auth admin (emails via configured SMTP)
    // In production, use your email provider (Resend, SendGrid, etc.)
    // Here we use Supabase's built-in auth.admin.generateLink as a placeholder
    // For actual email: integrate with Resend or similar

    console.log(`Reminder for reservation ${res.id}:`, reminderBody)
    sent++
  }

  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})

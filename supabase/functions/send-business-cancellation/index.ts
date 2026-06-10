// Supabase Edge Function: send-business-cancellation
// 事業者が「確定済み」予約をキャンセルしたとき、病院（MSW）へ通知メールを送る
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@send.hakobite-marugame.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

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
    body: JSON.stringify({ from: `せとむすび <${FROM_EMAIL}>`, to: [to], subject, text: body }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { reservation_id } = await req.json()
    if (!reservation_id) return json({ error: 'reservation_id required' }, 400)

    const { data: res } = await supabase
      .from('reservations')
      .select(`*, businesses(name, cancel_phone, user_id), hospitals(name, user_id)`)
      .eq('id', reservation_id)
      .single()

    if (!res) return json({ error: 'Not found' }, 404)
    // 病院紐づきの予約（MSW由来）のみ通知対象。電話予約（hospitalなし）はスキップ。
    if (!res.hospitals?.user_id) {
      return json({ ok: true, skipped: 'no hospital (phone reservation)' })
    }

    const biz = res.businesses as { name: string; cancel_phone: string | null } | null
    const body = `【せとむすび】確定していた送迎がキャンセルされました

事業所側の都合により、以下の「確定済み」予約がキャンセルされました。
お手数ですが、別の事業所への手配をご検討ください。

━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${String(res.start_time).slice(0,5)}〜${String(res.end_time).slice(0,5)}
事業所: ${biz?.name ?? ''}
担当者: ${res.contact_name ?? ''}
患者: ${res.patient_name ?? ''}
乗車地: ${res.patient_address ?? ''}
目的地: ${res.destination ?? ''}
使用機材: ${EQUIPMENT_LABELS[res.equipment] ?? res.equipment ?? ''}
━━━━━━━━━━━━━━━━

緊急のご連絡・詳細確認は事業所へ直接お願いします。
${biz?.cancel_phone ? `連絡先: ${biz.cancel_phone}` : ''}

せとむすび
`

    const { data: hospUser } = await supabase.auth.admin.getUserById(res.hospitals.user_id)
    if (hospUser?.user?.email) {
      await sendEmail(hospUser.user.email, '【せとむすび】確定予約がキャンセルされました', body)
    }

    return json({ ok: true, email_sent: !!hospUser?.user?.email })
  } catch (e: any) {
    console.error('[send-business-cancellation]', e)
    return json({ error: e.message }, 500)
  }
})

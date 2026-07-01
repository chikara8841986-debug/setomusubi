// Supabase Edge Function: send-cancellation
// MSWが確定済み予約をキャンセルした時に事業所へ通知メールを送る

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://setomusubi.vercel.app'

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

const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

// 通知ディスパッチ層(notify)へ委譲：ユーザーの有効チャネル(メール/LINE…)へ配信
async function dispatch(userId: string, subject: string, text: string) {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { reservation_id } = await req.json()
    if (!reservation_id) return json({ error: 'reservation_id required' }, 400)

    const { data: res } = await supabase
      .from('reservations')
      .select(`
        *,
        businesses(name, cancel_phone, user_id),
        hospitals(name, user_id)
      `)
      .eq('id', reservation_id)
      .single()

    if (!res) return json({ error: 'Not found' }, 404)

    const body = `【せとむすび】予約キャンセルのお知らせ

${res.hospitals?.name} より、確定済み予約のキャンセル連絡がありました。

━━━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
病院: ${res.hospitals?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
乗車地: ${res.patient_address}
目的地: ${res.destination}
使用機材: ${EQUIPMENT_LABELS[res.equipment] ?? res.equipment}
━━━━━━━━━━━━━━━━━━

この予約枠は再度空き枠として解放されています。

▶ 予約管理はこちら
${APP_URL}/business/reservations

せとむすび
`

    if (res.businesses?.user_id) {
      await dispatch(res.businesses.user_id, '【せとむすび】予約キャンセルのお知らせ', body)
    }

    return json({ ok: true })
  } catch (e: any) {
    console.error('[send-cancellation]', e)
    return json({ error: e.message }, 500)
  }
})

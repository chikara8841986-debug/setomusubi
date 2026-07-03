// Supabase Edge Function: send-confirmation
// 予約確定時にWebhookまたはDB Triggerから呼ばれる
// Resend等のメールサービスと連携して確定メールを送信する

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

    const body = `【せとむすび】予約確定のお知らせ

以下の内容で予約が確定しました。

━━━━━━━━━━━━━━━━━━
予約日時: ${res.reservation_date} ${res.start_time.slice(0,5)}〜${res.end_time.slice(0,5)}
事業所: ${res.businesses?.name}
病院: ${res.hospitals?.name}
担当者: ${res.contact_name}
患者: ${res.patient_name}
使用機材: ${EQUIPMENT_LABELS[res.equipment] ?? res.equipment}
機材貸出: ${res.equipment_rental ? 'あり' : 'なし'}
━━━━━━━━━━━━━━━━━━
乗車地・目的地・備考などの詳細はアプリでご確認ください。

キャンセルの場合は事業所へ直接ご連絡ください。
${res.businesses?.cancel_phone ? `キャンセル連絡先: ${res.businesses.cancel_phone}` : ''}

▶ 予約確認
${APP_URL}/msw/reservations

せとむすび
`

    const targets: string[] = []
    if (res.businesses?.user_id) targets.push(res.businesses.user_id)
    if (res.hospitals?.user_id) targets.push(res.hospitals.user_id)
    await Promise.all(targets.map((uid) => dispatch(uid, '【せとむすび】予約確定のお知らせ', body)))

    return json({ ok: true })
  } catch (e: any) {
    console.error('[send-confirmation]', e)
    return json({ error: e.message }, 500)
  }
})

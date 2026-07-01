// Supabase Edge Function: send-rejection
// 事業所が仮予約を却下した際にMSW担当者へ通知メールを送る

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
        businesses(name, cancel_phone),
        hospitals(name, user_id)
      `)
      .eq('id', reservation_id)
      .single()

    if (!res) return json({ error: 'Not found' }, 404)

    const body = `【せとむすび】仮予約が却下されました

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

    if (res.hospitals?.user_id) {
      await dispatch(res.hospitals.user_id, '【せとむすび】仮予約が却下されました', body)
    }

    return json({ ok: true })
  } catch (e: any) {
    console.error('[send-rejection]', e)
    return json({ error: e.message }, 500)
  }
})

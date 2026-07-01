// Supabase Edge Function: send-business-approved
// 管理者が事業所を承認した際に事業所へ通知メールを送る

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
    const { business_id } = await req.json()
    if (!business_id) return json({ error: 'business_id required' }, 400)

    const { data: biz } = await supabase
      .from('businesses')
      .select('name, user_id')
      .eq('id', business_id)
      .single()

    if (!biz) return json({ error: 'Not found' }, 404)

    const body = `【せとむすび】事業所登録が承認されました

${biz.name} 様

ご登録いただいた事業所が管理者により承認されました。
以下のURLからログインしてサービスをご利用ください。

▶ ログイン
${APP_URL}/login

ログイン後は「プロフィール設定」から対応エリア・設備情報を入力し、
「稼働カレンダー」から空き時間枠を登録するとMSWからの申請が届きます。

せとむすび
`

    await dispatch(biz.user_id, '【せとむすび】事業所登録が承認されました', body)

    return json({ ok: true })
  } catch (e: any) {
    console.error('[send-business-approved]', e)
    return json({ error: e.message }, 500)
  }
})

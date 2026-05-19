// Supabase Edge Function: send-business-approved
// 管理者が事業所を承認した際に事業所へ通知メールを送る

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'noreply@send.hakobite-marugame.com'
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

    const { data: bizUser } = await supabase.auth.admin.getUserById(biz.user_id)
    if (!bizUser?.user?.email) {
      return json({ ok: true, skipped: 'no email' })
    }

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

    await sendEmail(
      bizUser.user.email,
      '【せとむすび】事業所登録が承認されました',
      body
    )

    return json({ ok: true })
  } catch (e: any) {
    console.error('[send-business-approved]', e)
    return json({ error: e.message }, 500)
  }
})

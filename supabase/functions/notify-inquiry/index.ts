// Supabase Edge Function: notify-inquiry
// 問い合わせフォーム(inquiries)にレコードが挿入された直後、DBトリガー(pg_net)から呼ばれる。
// 管理者(profiles.role='admin')へ「問い合わせが届きました」という最小限の通知のみを送る。
// D1方針(個人情報最小化)に倣い、問い合わせの氏名・メール・本文はメール/LINE本文には一切含めない。
//
// 認証: verify_jwt=false（DBトリガーからのpg_net呼び出しにはユーザーJWTが無いため、
// notify等の既存パターンに倣い関数内で独自にガードする）。
// ガード方法: 渡された inquiry_id が実際に直近5分以内に作成された inquiries 行を指している場合のみ
// 通知する。存在しない/古いIDでの呼び出しは無視する(no-op)ことで、エンドポイント直叩きによる
// 管理者への迷惑通知スパムを防ぐ。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const APP_URL = Deno.env.get('APP_URL') ?? 'https://setomusubi.vercel.app'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

async function dispatch(userId: string, subject: string, text: string) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, subject, text }),
    })
  } catch (e) {
    console.error('[notify-inquiry/dispatch]', e)
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const { inquiry_id } = await req.json()
    if (!inquiry_id) return json({ error: 'inquiry_id required' }, 400)

    // なりすまし/直叩き対策: 直近5分以内に作られた本物の行かどうかだけ確認する
    // (内容は取得しない。存在確認のみで十分)
    const { data: inquiry } = await supabase
      .from('inquiries')
      .select('id, created_at')
      .eq('id', inquiry_id)
      .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .maybeSingle()

    if (!inquiry) return json({ ok: true, skipped: 'not_found_or_stale' })

    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')

    if (!admins || admins.length === 0) {
      console.error('[notify-inquiry] no admin profile found')
      return json({ ok: true, notified: 0, warning: 'no_admin_found' })
    }

    const subject = '【せとむすび】新しいお問い合わせが届きました'
    const body = `【せとむすび】新しいお問い合わせが届きました

Webフォームから新しいお問い合わせが届きました。
内容は管理画面でご確認ください。

▶ 管理画面
${APP_URL}/admin/inquiries

せとむすび
`

    await Promise.all(admins.map((a) => dispatch(a.id, subject, body)))

    return json({ ok: true, notified: admins.length })
  } catch (e: any) {
    console.error('[notify-inquiry]', e)
    return json({ error: e.message }, 500)
  }
})

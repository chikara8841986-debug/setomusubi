// Supabase Edge Function: admin-reject-business
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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
      'Authorization': 'Bearer ' + RESEND_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: `せとむすび <${FROM_EMAIL}>`, to: [to], subject, text: body }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profileErr || profile?.role !== 'admin') {
      return json({ error: 'Forbidden: admin role required' }, 403)
    }

    const { business_id, reason } = await req.json()
    if (!business_id) return json({ error: 'business_id is required' }, 400)

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, user_id, approved')
      .eq('id', business_id)
      .single()
    if (bizErr || !biz) return json({ error: 'Business not found' }, 404)

    if (biz.approved) {
      return json({ error: 'Cannot reject an already-approved business' }, 400)
    }

    const { data: bizUser } = await supabase.auth.admin.getUserById(biz.user_id)
    const bizEmail = bizUser?.user?.email ?? null

    if (bizEmail) {
      const reasonNote = reason && reason.trim()
        ? '\n【取下理由】\n' + reason.trim() + '\n'
        : ''
      const body = '【せとむすび】事業所登録申請について\n\n' +
        biz.name + ' 様\n\n' +
        'ご登録いただいた事業所申請につきまして、\n' +
        '今回は承認を見送らせていただくこととなりました。\n' +
        reasonNote +
        '\nご質問・ご不明な点がございましたら、\n' +
        'このメールへ返信の形でお問い合わせください。\n\n' +
        'せとむすび\n'
      await sendEmail(bizEmail, '【せとむすび】事業所登録申請について', body)
    }

    const { error: bizDelErr } = await supabase
      .from('businesses').delete().eq('id', business_id)
    if (bizDelErr) throw bizDelErr

    const { error: profileDelErr } = await supabase
      .from('profiles').delete().eq('id', biz.user_id)
    if (profileDelErr) {
      console.error('[admin-reject-business] profile delete failed:', profileDelErr.message)
    }

    const { error: userDelErr } = await supabase.auth.admin.deleteUser(biz.user_id)
    if (userDelErr) {
      console.error('[admin-reject-business] auth user delete failed:', userDelErr.message)
      return json({ ok: true, warning: 'auth user delete failed: ' + userDelErr.message })
    }

    return json({ ok: true, email_sent: !!bizEmail })
  } catch (e: any) {
    console.error('[admin-reject-business]', e)
    return json({ error: e.message }, 500)
  }
})

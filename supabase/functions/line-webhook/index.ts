// Supabase Edge Function: line-webhook
// LINE公式アカウントからのWebhookを受け取る。
// 友だち連携フロー: ユーザーがアプリで発行した連携コード(6桁)をLINEのトーク画面に送信すると、
// このWebhookがそれを受信してprofiles.line_user_idを紐付ける。
//
// 署名検証: x-line-signature ヘッダーをLINE_CHANNEL_SECRETでHMAC-SHA256検証する。
// 通知本文の最小化方針(D1)に従い、返信メッセージも短く要点のみとする。

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CHANNEL_SECRET = Deno.env.get('LINE_CHANNEL_SECRET') ?? ''
const CHANNEL_ACCESS_TOKEN = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN') ?? ''

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

async function verifySignature(body: string, signature: string): Promise<boolean> {
  if (!CHANNEL_SECRET || !signature) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(CHANNEL_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return toBase64(new Uint8Array(sig)) === signature
}

async function replyMessage(replyToken: string, text: string) {
  if (!CHANNEL_ACCESS_TOKEN || !replyToken) return
  try {
    const res = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${CHANNEL_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    })
    if (!res.ok) console.error('[line-webhook] reply error:', await res.text())
  } catch (e) {
    console.error('[line-webhook] reply failed:', e)
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  const body = await req.text()
  const signature = req.headers.get('x-line-signature') ?? ''

  if (!(await verifySignature(body, signature))) {
    console.error('[line-webhook] invalid signature')
    return new Response('invalid signature', { status: 401 })
  }

  let payload: { events?: any[] }
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response('bad request', { status: 400 })
  }

  for (const event of payload.events ?? []) {
    try {
      if (event.type !== 'message' || event.message?.type !== 'text' || event.source?.type !== 'user') continue

      const code = String(event.message.text ?? '').trim().toUpperCase()
      const userId = event.source.userId as string | undefined
      const replyToken = event.replyToken as string | undefined
      if (!code || !userId) continue

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('line_link_code', code)
        .gt('line_link_code_expires_at', new Date().toISOString())
        .maybeSingle()

      if (profile) {
        await supabase
          .from('profiles')
          .update({
            line_user_id: userId,
            notify_line: true,
            line_link_code: null,
            line_link_code_expires_at: null,
          })
          .eq('id', profile.id)

        if (replyToken) await replyMessage(replyToken, '連携が完了しました。以後、せとむすびの通知がLINEにも届きます。')
      } else {
        if (replyToken) {
          await replyMessage(
            replyToken,
            'コードが正しくないか、有効期限が切れています。アプリの通知設定からコードを再発行してください。',
          )
        }
      }
    } catch (e) {
      console.error('[line-webhook] event handling error:', e)
    }
  }

  return new Response('ok')
})

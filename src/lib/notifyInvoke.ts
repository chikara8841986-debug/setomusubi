import { supabase } from './supabase'

// フロントからの通知系Edge Function呼び出し（send-confirmation等）は
// fire-and-forgetだとタブ即閉じやコールドスタート失敗で通知が消えるため、
// 1回だけ自動リトライし、それでも失敗した場合のみ呼び出し元へ知らせる。
// （予約自体のDB更新は既に完了している前提の「通知だけの」失敗を扱う）
export async function invokeNotifyWithRetry(name: string, body: Record<string, unknown>): Promise<boolean> {
  const attempt = async () => (await supabase.functions.invoke(name, { body })).error

  let error = await attempt()
  if (error) {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    error = await attempt()
  }
  if (error) {
    console.error(`[notify] ${name} failed after retry:`, error)
    return false
  }
  return true
}

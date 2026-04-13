/**
 * JST（日本標準時 Asia/Tokyo UTC+9）ユーティリティ
 * date-fns の関数はブラウザのローカルタイムゾーンを使うため、
 * 日本以外の環境でも正しく動作するよう明示的にJSTを扱う関数を提供します。
 */

/** 現在のJST日付を "YYYY-MM-DD" 形式で返す */
export function jstTodayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Tokyo' })
}

/** 現在のJST年月を "YYYY-MM" 形式で返す */
export function jstMonthStr(offsetMonths = 0): string {
  const d = new Date()
  // JSTの現在時刻をもとに月を計算
  const jstDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  jstDate.setMonth(jstDate.getMonth() + offsetMonths)
  const y = jstDate.getFullYear()
  const m = String(jstDate.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/** JST基準で今月の開始日・終了日を "YYYY-MM-DD" で返す */
export function jstMonthRange(offsetMonths = 0): { start: string; end: string } {
  const d = new Date()
  const jstDate = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  jstDate.setMonth(jstDate.getMonth() + offsetMonths)
  const y = jstDate.getFullYear()
  const m = jstDate.getMonth()
  const start = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const lastDay = new Date(y, m + 1, 0).getDate()
  const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  return { start, end }
}

/** JST基準でその日付文字列 "YYYY-MM-DD" が今日かどうかを判定 */
export function isTodayJST(dateStr: string): boolean {
  return dateStr === jstTodayStr()
}

/** 現在のJST時刻を "HH:mm" 形式で返す */
export function jstTimeStr(): string {
  return new Date().toLocaleTimeString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** 現在のJST時（0〜23）を返す */
export function jstHour(): number {
  return parseInt(
    new Date().toLocaleString('en-US', {
      timeZone: 'Asia/Tokyo',
      hour: 'numeric',
      hour12: false,
    }),
    10,
  )
}

/** JST基準で n日後の日付文字列 "YYYY-MM-DD" を返す（デフォルト: 明日）*/
export function jstDateOffsetStr(offsetDays = 1): string {
  const today = jstTodayStr()
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(y, m - 1, d + offsetDays)
  const yy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

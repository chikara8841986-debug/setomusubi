/**
 * 課金プランの基本料金設定（businesses.custom_* が未設定の事業所に適用されるデフォルト値）。
 * Billing.tsx と Profile.tsx（車両追加時の注意書き）で共有する。
 */
export const DEFAULT_BASE_FEE = 3_850
export const DEFAULT_PER_VEHICLE_FEE = 2_200
export const FREE_VEHICLES = 2

/**
 * LINE公式アカウント「せとむすび」の友だち追加リンク（F3: LINE通知連携）
 */
export const LINE_FRIEND_URL = 'https://line.me/R/ti/p/@537bqcvu'

/**
 * 香川県全市町村（17市町）
 * 東讃 → 中讃 → 西讃 → 島嶼 の順
 */
export const SERVICE_AREAS: string[] = [
  // 東讃
  '高松市',
  'さぬき市',
  '東かがわ市',
  '三木町',
  // 中讃
  '丸亀市',
  '坂出市',
  '宇多津町',
  '綾川町',
  '善通寺市',
  // 西讃
  '多度津町',
  '琴平町',
  'まんのう町',
  '観音寺市',
  '三豊市',
  // 島嶼
  '直島町',
  '土庄町',
  '小豆島町',
]

/**
 * 3ヶ月無料キャンペーンの終了日（JST・当日を含む）。
 *
 * ⚠️ `supabase/functions/create-checkout-session/index.ts` の `CAMPAIGN_END_JST` と
 *    必ず同じ値にすること。Edge Function は Deno で動き `src/` を import できないため、
 *    やむを得ず二重定義になっている。片方だけ変えると、画面の説明と実際の課金がズレる。
 */
export const CAMPAIGN_END_JST = '2026-12-31'

function jstParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const pick = (t: string) => parts.find((x) => x.type === t)?.value ?? ''
  return { year: Number(pick('year')), month: Number(pick('month')), day: Number(pick('day')) }
}

/** 今日（JST）がキャンペーン対象期間内かどうか。 */
export function isCampaignActive(now = new Date()): boolean {
  const { year, month, day } = jstParts(now)
  const today = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return today <= CAMPAIGN_END_JST
}

/**
 * キャンペーン適用時の初回請求日を「2026年12月1日」形式で返す。
 * 「申込の翌月から3ヶ月無料、その次の月の1日から課金開始」= 申込月の4ヶ月後の1日。
 * Edge Function 側の getCampaignTrialEndUnix と同じ計算。
 */
export function campaignFirstChargeLabel(now = new Date()): string {
  const { year, month } = jstParts(now)
  const total = year * 12 + (month - 1) + 4
  return `${Math.floor(total / 12)}年${(total % 12) + 1}月1日`
}

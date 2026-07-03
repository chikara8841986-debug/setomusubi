/**
 * 課金プランの基本料金設定（businesses.custom_* が未設定の事業所に適用されるデフォルト値）。
 * Billing.tsx と Profile.tsx（車両追加時の注意書き）で共有する。
 */
export const DEFAULT_BASE_FEE = 3_850
export const DEFAULT_PER_VEHICLE_FEE = 1_650
export const FREE_VEHICLES = 2

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

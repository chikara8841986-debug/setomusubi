// デモモード用のサンプルデータ（Supabase不使用・ローカルのみ）

function addDays(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

export const DEMO_HOSPITAL = {
  id: 'demo-hospital-1',
  name: '丸亀市立市民病院',
  address: '香川県丸亀市土器町西1丁目1番地1',
  phone: '0877-23-1234',
}

export const DEMO_CONTACTS = [
  { id: 'demo-contact-1', name: '山田 花子' },
  { id: 'demo-contact-2', name: '田中 次郎' },
]

export const DEMO_BUSINESSES = [
  {
    id: 'demo-biz-1',
    name: 'せとうち介護タクシー',
    address: '香川県丸亀市土器町東7丁目1-1',
    cancel_phone: '0877-22-1234',
    has_wheelchair: true,
    has_reclining_wheelchair: true,
    has_stretcher: false,
    rental_wheelchair: true,
    rental_reclining_wheelchair: false,
    rental_stretcher: false,
    has_female_caregiver: true,
    long_distance: true,
    same_day: false,
    business_hours_start: '08:00',
    business_hours_end: '18:00',
    closed_days: [0],
    service_areas: ['丸亀市', '善通寺市', '多度津町'],
    pr_text:
      '丸亀市を中心に活動する介護タクシーです。車椅子・リクライニング車椅子対応車両2台を保有しており、病院間の移送・退院送迎を専門に行っています。女性スタッフも在籍しております。',
    pricing: '初乗り700円〜（距離・時間により算出）',
    qualifications: '介護職員初任者研修修了者在籍・福祉車両適合証取得',
    profile_image_url: null as null,
    vehicle_image_urls: [] as string[],
    approved: true,
  },
  {
    id: 'demo-biz-2',
    name: '瀬戸の風タクシー',
    address: '香川県善通寺市文京町1-1-1',
    cancel_phone: '0877-33-5678',
    has_wheelchair: true,
    has_reclining_wheelchair: false,
    has_stretcher: true,
    rental_wheelchair: false,
    rental_reclining_wheelchair: false,
    rental_stretcher: true,
    has_female_caregiver: false,
    long_distance: true,
    same_day: true,
    business_hours_start: '07:00',
    business_hours_end: '20:00',
    closed_days: [],
    service_areas: ['善通寺市', '丸亀市', '琴平町', 'まんのう町'],
    pr_text:
      '善通寺市を拠点に活動しています。ストレッチャー対応車両を保有し、寝たきりの方の移送にも対応しています。当日対応可能な場合もございますのでご相談ください。',
    pricing: '基本料金800円〜（時間帯・距離により変動）',
    qualifications: '介護福祉士在籍・長距離移送実績多数',
    profile_image_url: null as null,
    vehicle_image_urls: [] as string[],
    approved: true,
  },
  {
    id: 'demo-biz-3',
    name: 'さぬき福祉タクシー',
    address: '香川県坂出市府中町1-1',
    cancel_phone: '0877-55-9999',
    has_wheelchair: true,
    has_reclining_wheelchair: true,
    has_stretcher: true,
    rental_wheelchair: true,
    rental_reclining_wheelchair: true,
    rental_stretcher: false,
    has_female_caregiver: true,
    long_distance: false,
    same_day: false,
    business_hours_start: '09:00',
    business_hours_end: '17:00',
    closed_days: [0, 6],
    service_areas: ['坂出市', '宇多津町', '綾川町'],
    pr_text:
      '坂出市・宇多津町エリアを中心にサービスを提供しています。女性スタッフも在籍しており、女性患者様も安心してご利用いただけます。車椅子・リクライニング車椅子の貸出も行っています。',
    pricing: '初乗り600円〜',
    qualifications: '介護職員初任者研修修了者在籍・女性スタッフ在籍',
    profile_image_url: null as null,
    vehicle_image_urls: [] as string[],
    approved: true,
  },
]

export const DEMO_SLOTS = [
  {
    id: 'demo-slot-1',
    business_id: 'demo-biz-1',
    date: addDays(1),
    start_time: '09:00',
    end_time: '12:00',
    is_available: true,
    capacity: 1,
    confirmed_count: 0,
  },
  {
    id: 'demo-slot-2',
    business_id: 'demo-biz-1',
    date: addDays(1),
    start_time: '14:00',
    end_time: '17:00',
    is_available: true,
    capacity: 1,
    confirmed_count: 0,
  },
  {
    id: 'demo-slot-3',
    business_id: 'demo-biz-2',
    date: addDays(1),
    start_time: '08:00',
    end_time: '14:00',
    is_available: true,
    capacity: 1,
    confirmed_count: 0,
  },
  {
    id: 'demo-slot-4',
    business_id: 'demo-biz-2',
    date: addDays(2),
    start_time: '10:00',
    end_time: '16:00',
    is_available: true,
    capacity: 1,
    confirmed_count: 0,
  },
  {
    id: 'demo-slot-5',
    business_id: 'demo-biz-3',
    date: addDays(2),
    start_time: '10:00',
    end_time: '15:00',
    is_available: true,
    capacity: 1,
    confirmed_count: 0,
  },
]

export type DemoReservation = {
  id: string
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'rejected'
  source: 'msw' | 'phone'
  hospital_name: string
  caller_name: string
  caller_phone: string
  contact_name: string
  patient_name: string
  patient_address: string
  destination: string
  equipment: 'wheelchair' | 'reclining_wheelchair' | 'stretcher'
  equipment_rental: boolean
  reservation_date: string
  start_time: string
  end_time: string
  notes: string
  created_at: string
  business_id: string
  business_name: string
}

export const INITIAL_DEMO_RESERVATIONS: DemoReservation[] = [
  {
    id: 'demo-res-1',
    status: 'pending',
    source: 'msw',
    hospital_name: '丸亀市立市民病院',
    caller_name: '',
    caller_phone: '',
    contact_name: '山田 花子',
    patient_name: '佐藤 一郎',
    patient_address: '香川県丸亀市浜町1-1-1',
    destination: '香川県高松市大工町1-1（高松赤十字病院）',
    equipment: 'wheelchair',
    equipment_rental: false,
    reservation_date: addDays(3),
    start_time: '10:00',
    end_time: '13:00',
    notes: '乗り換え時の介助をお願いします',
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    business_id: 'demo-biz-1',
    business_name: 'せとうち介護タクシー',
  },
  {
    id: 'demo-res-2',
    status: 'confirmed',
    source: 'msw',
    hospital_name: '善通寺市民病院',
    caller_name: '',
    caller_phone: '',
    contact_name: '田中 次郎',
    patient_name: '田中 八重子',
    patient_address: '香川県善通寺市与北町1-1',
    destination: '香川県丸亀市川西町（丸亀市民病院）',
    equipment: 'reclining_wheelchair',
    equipment_rental: true,
    reservation_date: addDays(5),
    start_time: '09:00',
    end_time: '11:00',
    notes: '',
    created_at: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
    business_id: 'demo-biz-2',
    business_name: '瀬戸の風タクシー',
  },
  {
    id: 'demo-res-3',
    status: 'confirmed',
    source: 'phone',
    hospital_name: '',
    caller_name: '高松赤十字・中村MSW',
    caller_phone: '087-831-7101',
    contact_name: '中村 MSW',
    patient_name: '山本 花子',
    patient_address: '香川県高松市林町2-1',
    destination: '香川県高松市番町1丁目（高松市民病院）',
    equipment: 'wheelchair',
    equipment_rental: false,
    reservation_date: addDays(2),
    start_time: '14:00',
    end_time: '16:00',
    notes: '車椅子から降りる際に介助が必要です',
    created_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    business_id: 'demo-biz-1',
    business_name: 'せとうち介護タクシー',
  },
  {
    id: 'demo-res-4',
    status: 'completed',
    source: 'msw',
    hospital_name: '丸亀市立市民病院',
    caller_name: '',
    caller_phone: '',
    contact_name: '山田 花子',
    patient_name: '鈴木 三郎',
    patient_address: '香川県丸亀市土器町東3丁目',
    destination: '香川県丸亀市城西町（リハビリ病院）',
    equipment: 'wheelchair',
    equipment_rental: false,
    reservation_date: addDays(-5),
    start_time: '10:00',
    end_time: '12:00',
    notes: '',
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    business_id: 'demo-biz-1',
    business_name: 'せとうち介護タクシー',
  },
]

// ── カレンダー用スロット型（確定予約情報つき） ──
export type DemoCalSlot = {
  id: string
  date: string
  startTime: string
  endTime: string
  confirmed: boolean
  source?: 'msw' | 'phone'
  hospitalName?: string
  callerName?: string
  callerPhone?: string
  patientName?: string
  patientAddress?: string
  destination?: string
  equipment?: string
  equipmentRental?: boolean
  notes?: string
}

// 初期表示用の空き枠（緑）
export const INITIAL_OPEN_CAL_SLOTS: DemoCalSlot[] = [
  { id: 'init-1', date: addDays(1), startTime: '09:00', endTime: '12:00', confirmed: false },
  { id: 'init-2', date: addDays(1), startTime: '14:00', endTime: '17:00', confirmed: false },
  { id: 'init-3', date: addDays(3), startTime: '10:00', endTime: '15:00', confirmed: false },
  { id: 'init-4', date: addDays(6), startTime: '08:30', endTime: '12:00', confirmed: false },
]

// 初期表示用の確定済み枠（水色）
export const INITIAL_CONFIRMED_CAL_SLOTS: DemoCalSlot[] = [
  {
    id: 'demo-cal-msw',
    date: addDays(5),
    startTime: '09:00',
    endTime: '11:00',
    confirmed: true,
    source: 'msw',
    hospitalName: '善通寺市民病院',
    patientName: '田中 八重子',
    patientAddress: '香川県善通寺市与北町1-1',
    destination: '香川県丸亀市川西町（丸亀市民病院）',
    equipment: 'reclining_wheelchair',
    equipmentRental: true,
    notes: '',
  },
  {
    id: 'demo-cal-phone',
    date: addDays(2),
    startTime: '14:00',
    endTime: '16:00',
    confirmed: true,
    source: 'phone',
    callerName: '高松赤十字・中村MSW',
    callerPhone: '087-831-7101',
    patientName: '山本 花子',
    patientAddress: '香川県高松市林町2-1',
    destination: '香川県高松市番町1丁目（高松市民病院）',
    equipment: 'wheelchair',
    equipmentRental: false,
    notes: '車椅子から降りる際に介助が必要です',
  },
]

// デモセッション中の承認追加スロット（予約管理→承認でここに積まれる）
export const demoApprovedSlots: DemoCalSlot[] = []
export function addDemoApprovedSlot(slot: DemoCalSlot) {
  if (!demoApprovedSlots.find(s => s.id === slot.id)) {
    demoApprovedSlots.push(slot)
  }
}

export const EQUIPMENT_LABELS: Record<string, string> = {
  wheelchair: '車椅子',
  reclining_wheelchair: 'リクライニング車椅子',
  stretcher: 'ストレッチャー',
}

export const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  pending:   { cls: 'badge-red',   label: '申請中' },
  confirmed: { cls: 'badge-blue',  label: '確定' },
  completed: { cls: 'badge-green', label: '完了' },
  cancelled: { cls: 'badge-gray',  label: 'キャンセル' },
  rejected:  { cls: 'badge-gray',  label: '却下' },
}

// ─────────────────────────────────────────────
// 課金システム関連
// ─────────────────────────────────────────────

export const DEMO_PRICING = {
  baseFee: 3850,
  perVehicleFee: 1650,
  freeVehicles: 2,
}

export type DemoSubscriptionStatus = 'none' | 'trialing' | 'active' | 'past_due' | 'canceled'

export const DEMO_SUBSCRIPTION_STATUS_LABEL: Record<DemoSubscriptionStatus, { label: string; pill: string }> = {
  none:     { label: '未登録',                pill: 'bg-slate-100 text-slate-600' },
  trialing: { label: 'ご利用開始済み（初月）', pill: 'bg-blue-100 text-blue-700' },
  active:   { label: '利用中',                pill: 'bg-emerald-100 text-emerald-700' },
  past_due: { label: '支払い失敗',            pill: 'bg-red-100 text-red-700' },
  canceled: { label: '解約済み',              pill: 'bg-orange-100 text-orange-700' },
}

export type DemoVehicle = {
  id: string
  name: string
  has_wheelchair: boolean
  has_reclining_wheelchair: boolean
  has_stretcher: boolean
  rental_wheelchair: boolean
  rental_reclining_wheelchair: boolean
  rental_stretcher: boolean
  active: boolean
}

export const INITIAL_DEMO_VEHICLES: DemoVehicle[] = [
  {
    id: 'demo-vehicle-1',
    name: '1号車（ハイエース）',
    has_wheelchair: true,
    has_reclining_wheelchair: true,
    has_stretcher: false,
    rental_wheelchair: true,
    rental_reclining_wheelchair: false,
    rental_stretcher: false,
    active: true,
  },
  {
    id: 'demo-vehicle-2',
    name: '2号車（ノア）',
    has_wheelchair: true,
    has_reclining_wheelchair: false,
    has_stretcher: true,
    rental_wheelchair: true,
    rental_reclining_wheelchair: false,
    rental_stretcher: true,
    active: true,
  },
  {
    id: 'demo-vehicle-3',
    name: '3号車（セレナ）',
    has_wheelchair: true,
    has_reclining_wheelchair: true,
    has_stretcher: false,
    rental_wheelchair: false,
    rental_reclining_wheelchair: false,
    rental_stretcher: false,
    active: true,
  },
]

// ─────────────────────────────────────────────
// admin 用データ
// ─────────────────────────────────────────────

export type DemoApprovalBusiness = {
  id: string
  name: string
  address: string
  phone: string
  email: string
  applied_hours_ago: number
  approved: boolean
  service_areas: string[]
}

export const INITIAL_DEMO_APPROVAL_QUEUE: DemoApprovalBusiness[] = [
  {
    id: 'demo-pending-1',
    name: 'こんぴらケアタクシー',
    address: '香川県仲多度郡琴平町1234',
    phone: '0877-75-1234',
    email: 'info@konpira-care.example.com',
    applied_hours_ago: 2,
    approved: false,
    service_areas: ['琴平町', 'まんのう町', '善通寺市'],
  },
  {
    id: 'demo-pending-2',
    name: '坂出やすらぎ介護タクシー',
    address: '香川県坂出市本町2-3-4',
    phone: '0877-46-7890',
    email: 'yasuragi@sakaide.example.com',
    applied_hours_ago: 14,
    approved: false,
    service_areas: ['坂出市', '宇多津町'],
  },
]

export type DemoBillingBusiness = {
  id: string
  name: string
  subscription_status: DemoSubscriptionStatus
  vehicle_count: number
  custom_base_price: number | null
  custom_per_vehicle_price: number | null
  stripe_coupon_id: string | null
  has_stripe_subscription: boolean
}

export const INITIAL_DEMO_BILLING_BUSINESSES: DemoBillingBusiness[] = [
  {
    id: 'demo-biz-1',
    name: 'せとうち介護タクシー',
    subscription_status: 'active',
    vehicle_count: 3,
    custom_base_price: null,
    custom_per_vehicle_price: null,
    stripe_coupon_id: null,
    has_stripe_subscription: true,
  },
  {
    id: 'demo-biz-2',
    name: '瀬戸の風タクシー',
    subscription_status: 'trialing',
    vehicle_count: 2,
    custom_base_price: null,
    custom_per_vehicle_price: null,
    stripe_coupon_id: null,
    has_stripe_subscription: true,
  },
  {
    id: 'demo-biz-3',
    name: 'さぬき福祉タクシー',
    subscription_status: 'active',
    vehicle_count: 4,
    custom_base_price: 3000,
    custom_per_vehicle_price: 1200,
    stripe_coupon_id: null,
    has_stripe_subscription: true,
  },
  {
    id: 'demo-biz-4',
    name: '直島ふくしタクシー（特別契約）',
    subscription_status: 'active',
    vehicle_count: 2,
    custom_base_price: 0,
    custom_per_vehicle_price: 0,
    stripe_coupon_id: null,
    has_stripe_subscription: false,
  },
  {
    id: 'demo-biz-5',
    name: '高松ライフサポート',
    subscription_status: 'past_due',
    vehicle_count: 3,
    custom_base_price: null,
    custom_per_vehicle_price: null,
    stripe_coupon_id: null,
    has_stripe_subscription: true,
  },
]

export function calcMonthlyFee(biz: DemoBillingBusiness): number {
  const base = biz.custom_base_price ?? DEMO_PRICING.baseFee
  const perVehicle = biz.custom_per_vehicle_price ?? DEMO_PRICING.perVehicleFee
  const addon = Math.max(0, biz.vehicle_count - DEMO_PRICING.freeVehicles)
  return base + addon * perVehicle
}

// 「自分の事業所」用の課金情報（事業者Billing画面）
export const DEMO_OWN_BUSINESS_BILLING = {
  business_id: 'demo-biz-1',
  business_name: 'せとうち介護タクシー',
  subscription_status: 'trialing' as DemoSubscriptionStatus,
  vehicle_count: 3,
  subscription_period_end_iso: (() => {
    // 翌月1日
    const now = new Date()
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    return nextMonth.toISOString()
  })(),
  has_stripe_subscription: true,
}

// ─────────────────────────────────────────────
// 新方式: 事業所 → 車両 → 占有スロット（本番と同じネガティブリスト型）
// ─────────────────────────────────────────────

// 事業所 → 車両一覧（MSW検索で機材判定に使う）
export const DEMO_BUSINESS_VEHICLES: Record<string, DemoVehicle[]> = {
  'demo-biz-1': [
    {
      id: 'v-biz1-1', name: '1号車（ハイエース）',
      has_wheelchair: true, has_reclining_wheelchair: true, has_stretcher: false,
      rental_wheelchair: true, rental_reclining_wheelchair: false, rental_stretcher: false,
      active: true,
    },
    {
      id: 'v-biz1-2', name: '2号車（ノア）',
      has_wheelchair: true, has_reclining_wheelchair: false, has_stretcher: true,
      rental_wheelchair: true, rental_reclining_wheelchair: false, rental_stretcher: true,
      active: true,
    },
    {
      id: 'v-biz1-3', name: '3号車（セレナ）',
      has_wheelchair: true, has_reclining_wheelchair: true, has_stretcher: false,
      rental_wheelchair: false, rental_reclining_wheelchair: false, rental_stretcher: false,
      active: true,
    },
  ],
  'demo-biz-2': [
    {
      id: 'v-biz2-1', name: '1号車',
      has_wheelchair: true, has_reclining_wheelchair: false, has_stretcher: true,
      rental_wheelchair: false, rental_reclining_wheelchair: false, rental_stretcher: true,
      active: true,
    },
    {
      id: 'v-biz2-2', name: '2号車',
      has_wheelchair: true, has_reclining_wheelchair: false, has_stretcher: false,
      rental_wheelchair: false, rental_reclining_wheelchair: false, rental_stretcher: false,
      active: true,
    },
  ],
  'demo-biz-3': [
    {
      id: 'v-biz3-1', name: '1号車',
      has_wheelchair: true, has_reclining_wheelchair: true, has_stretcher: true,
      rental_wheelchair: true, rental_reclining_wheelchair: true, rental_stretcher: false,
      active: true,
    },
  ],
}

// 占有スロット（埋まっている時間）
// 事業所はこれを登録し、MSWはこれを「避けて」予約する
export type DemoOccupiedSlot = {
  id: string
  vehicle_id: string
  date: string       // 'YYYY-MM-DD'
  start_time: string // 'HH:mm'
  end_time: string   // 'HH:mm'
  reason: string     // '予約済み' / '休憩' / 'メンテ' 等
}

export const INITIAL_DEMO_OCCUPIED_SLOTS: DemoOccupiedSlot[] = [
  // demo-biz-1 1号車: 明日10:00-12:00 が予約済み
  { id: 'occ-1', vehicle_id: 'v-biz1-1', date: addDays(1), start_time: '10:00', end_time: '12:00', reason: '予約済み（佐藤様）' },
  // demo-biz-1 2号車: 明日終日メンテ
  { id: 'occ-2', vehicle_id: 'v-biz1-2', date: addDays(1), start_time: '08:00', end_time: '18:00', reason: 'メンテナンス' },
  // demo-biz-1 1号車: 明後日13:00-15:00
  { id: 'occ-3', vehicle_id: 'v-biz1-1', date: addDays(2), start_time: '13:00', end_time: '15:00', reason: '予約済み（鈴木様）' },
  // demo-biz-2 1号車: 明日9:00-11:00
  { id: 'occ-4', vehicle_id: 'v-biz2-1', date: addDays(1), start_time: '09:00', end_time: '11:00', reason: '予約済み（田中様）' },
  // demo-biz-3 1号車: 明日13:00-17:00
  { id: 'occ-5', vehicle_id: 'v-biz3-1', date: addDays(1), start_time: '13:00', end_time: '17:00', reason: '予約済み' },
]

// 「自分の事業所」用（DemoBusinessCalendar が編集対象にする事業所）
export const DEMO_OWN_BUSINESS_ID = 'demo-biz-1'

// 時間を分に変換
export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

// 2つの時間範囲が重なるか判定
export function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return timeToMin(aStart) < timeToMin(bEnd) && timeToMin(aEnd) > timeToMin(bStart)
}

// 指定日時に「空いている車両」を取り出す（新方式の検索ロジック）
export function findAvailableVehicles(
  businessId: string,
  date: string,
  startTime: string,
  endTime: string,
  occupiedSlots: DemoOccupiedSlot[],
): DemoVehicle[] {
  const vehicles = DEMO_BUSINESS_VEHICLES[businessId] ?? []
  return vehicles.filter(v => {
    if (!v.active) return false
    // この車両に同日の占有スロットがあり、検索時間と重なるなら空きなし
    const conflicts = occupiedSlots.filter(s =>
      s.vehicle_id === v.id && s.date === date && rangesOverlap(s.start_time, s.end_time, startTime, endTime),
    )
    return conflicts.length === 0
  })
}

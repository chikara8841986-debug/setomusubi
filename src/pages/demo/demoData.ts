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
  hospital_name: string
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
    hospital_name: '丸亀市立市民病院',
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
    hospital_name: '善通寺市民病院',
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
    status: 'completed',
    hospital_name: '丸亀市立市民病院',
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

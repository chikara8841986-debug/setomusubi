import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { Business, Vehicle } from '../../types/database'
import { SERVICE_AREAS, DEFAULT_PER_VEHICLE_FEE, FREE_VEHICLES } from '../../lib/constants'

const DAYS = ['日', '月', '火', '水', '木', '金', '土']

type VehicleEquipmentField =
  | 'has_wheelchair'
  | 'has_reclining_wheelchair'
  | 'has_stretcher'
  | 'rental_wheelchair'
  | 'rental_reclining_wheelchair'
  | 'rental_stretcher'

type VehicleEditForm = Pick<Vehicle, 'name' | VehicleEquipmentField>

const VEHICLE_EQUIPMENT_FIELDS: Array<{
  field: VehicleEquipmentField
  label: string
  requires?: 'has_wheelchair' | 'has_reclining_wheelchair' | 'has_stretcher'
}> = [
  { field: 'has_wheelchair', label: '車椅子対応' },
  { field: 'has_reclining_wheelchair', label: 'リクライニング対応' },
  { field: 'has_stretcher', label: 'ストレッチャー対応' },
  { field: 'rental_wheelchair', label: '車椅子貸出', requires: 'has_wheelchair' },
  { field: 'rental_reclining_wheelchair', label: 'リクライニング貸出', requires: 'has_reclining_wheelchair' },
  { field: 'rental_stretcher', label: 'ストレッチャー貸出', requires: 'has_stretcher' },
]

const createEmptyVehicleForm = (): VehicleEditForm => ({
  name: '',
  has_wheelchair: false,
  has_reclining_wheelchair: false,
  has_stretcher: false,
  rental_wheelchair: false,
  rental_reclining_wheelchair: false,
  rental_stretcher: false,
})

export default function BusinessProfile() {
  const { user, businessId } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedSnapshot, setSavedSnapshot] = useState('')

  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehicleCounts, setVehicleCounts] = useState<Record<string, number>>({})
  const [newVehicleName, setNewVehicleName] = useState('')
  const [addingVehicle, setAddingVehicle] = useState(false)
  const [deletingVehicleId, setDeletingVehicleId] = useState<string | null>(null)
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null)
  const [savingVehicleId, setSavingVehicleId] = useState<string | null>(null)
  const [vehicleForm, setVehicleForm] = useState<VehicleEditForm>(createEmptyVehicleForm)

  const [form, setForm] = useState<Partial<Business>>({
    name: '',
    address: '',
    phone: '',
    service_areas: [],
    business_hours_start: '09:00',
    business_hours_end: '18:00',
    closed_days: [],
    has_wheelchair: false,
    has_reclining_wheelchair: false,
    has_stretcher: false,
    rental_wheelchair: false,
    rental_reclining_wheelchair: false,
    rental_stretcher: false,
    has_female_caregiver: false,
    long_distance: false,
    same_day: false,
    qualifications: '',
    pricing: '',
    cancel_phone: '',
    buffer_minutes: 0,
  })

  const fetchProfile = async () => {
    if (!user) return
    setLoadError(false)

    const { data, error } = await supabase.from('businesses').select('*').eq('user_id', user.id).single()
    if (error && error.code !== 'PGRST116') {
      setLoadError(true)
      setLoading(false)
      return
    }

    if (data) {
      setForm(data)
      setSavedSnapshot(JSON.stringify(data))
    }
    setLoading(false)
  }

  const fetchVehicles = async () => {
    if (!businessId) return

    const { data: vehicleRows, error: vehicleError } = await supabase
      .from('vehicles')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order', { ascending: true })

    if (vehicleError) {
      showToast('車両一覧の取得に失敗しました', 'error')
      return
    }

    const nextVehicles = (vehicleRows ?? []) as Vehicle[]
    setVehicles(nextVehicles)

    if (nextVehicles.length === 0) {
      setVehicleCounts({})
      return
    }

    const { data: occupiedRows, error: occupiedError } = await supabase
      .from('occupied_slots')
      .select('vehicle_id')
      .in('vehicle_id', nextVehicles.map((vehicle) => vehicle.id))

    if (occupiedError) {
      showToast('車両利用状況の取得に失敗しました', 'error')
      return
    }

    const counts = ((occupiedRows ?? []) as Array<{ vehicle_id: string }>).reduce<Record<string, number>>((acc, row) => {
      acc[row.vehicle_id] = (acc[row.vehicle_id] ?? 0) + 1
      return acc
    }, {})
    setVehicleCounts(counts)
  }

  useEffect(() => {
    fetchProfile()
  }, [user])

  useEffect(() => {
    fetchVehicles()
  }, [businessId])

  const toggleArea = (area: string) => {
    setForm((current) => ({
      ...current,
      service_areas: current.service_areas?.includes(area)
        ? current.service_areas.filter((item) => item !== area)
        : [...(current.service_areas ?? []), area],
    }))
  }

  const toggleDay = (day: number) => {
    setForm((current) => ({
      ...current,
      closed_days: current.closed_days?.includes(day)
        ? current.closed_days.filter((item) => item !== day)
        : [...(current.closed_days ?? []), day],
    }))
  }

  const toggleBool = (key: keyof Business) => {
    setForm((current) => {
      const next = !current[key]
      const updates: Partial<Business> = { [key]: next }
      if (!next) {
        if (key === 'has_wheelchair') updates.rental_wheelchair = false
        if (key === 'has_reclining_wheelchair') updates.rental_reclining_wheelchair = false
        if (key === 'has_stretcher') updates.rental_stretcher = false
      }
      return { ...current, ...updates }
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!user) return

    if (
      form.business_hours_start &&
      form.business_hours_end &&
      form.business_hours_start >= form.business_hours_end
    ) {
      showToast('終了時刻は開始時刻より後にしてください', 'error')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('businesses')
      .update({
        name: form.name,
        address: form.address,
        phone: form.phone,
        service_areas: form.service_areas,
        business_hours_start: form.business_hours_start,
        business_hours_end: form.business_hours_end,
        closed_days: form.closed_days,
        has_wheelchair: form.has_wheelchair,
        has_reclining_wheelchair: form.has_reclining_wheelchair,
        has_stretcher: form.has_stretcher,
        rental_wheelchair: form.rental_wheelchair,
        rental_reclining_wheelchair: form.rental_reclining_wheelchair,
        rental_stretcher: form.rental_stretcher,
        has_female_caregiver: form.has_female_caregiver,
        long_distance: form.long_distance,
        same_day: form.same_day,
        qualifications: form.qualifications,
        pricing: form.pricing,
        cancel_phone: form.cancel_phone,
        buffer_minutes: form.buffer_minutes ?? 0,
      })
      .eq('user_id', user.id)
    setSaving(false)

    if (error) {
      showToast('保存に失敗しました', 'error')
      return
    }

    setSavedSnapshot(JSON.stringify(form))
    showToast('プロフィールを保存しました')
  }

  const handleAddVehicle = async () => {
    if (!businessId) return
    const name = newVehicleName.trim()
    if (!name) {
      showToast('車両名を入力してください', 'error')
      return
    }

    setAddingVehicle(true)
    const nextSortOrder = vehicles.length > 0 ? Math.max(...vehicles.map((vehicle) => vehicle.sort_order ?? 0)) + 1 : 1
    const { error } = await supabase.from('vehicles').insert({
      business_id: businessId,
      name,
      active: true,
      sort_order: nextSortOrder,
    })
    setAddingVehicle(false)

    if (error) {
      showToast('車両追加に失敗しました', 'error')
      return
    }

    setNewVehicleName('')
    showToast('車両を追加しました')
    fetchVehicles()
    // 課金中の事業者は車両台数の変更を Stripe に自動反映（失敗しても黙殺、admin が手動同期で救済可能）
    supabase.functions.invoke('sync-vehicle-billing', { body: { business_id: businessId } })
      .catch((e) => console.error('[auto sync-vehicle-billing]', e))
  }

  const handleDeleteVehicle = async (vehicleId: string) => {
    if ((vehicleCounts[vehicleId] ?? 0) > 0) return

    setDeletingVehicleId(vehicleId)
    const { error } = await supabase.from('vehicles').delete().eq('id', vehicleId)
    setDeletingVehicleId(null)

    if (error) {
      showToast('車両削除に失敗しました', 'error')
      return
    }

    showToast('車両を削除しました')
    fetchVehicles()
    // 課金中の事業者は車両台数の変更を Stripe に自動反映
    if (businessId) {
      supabase.functions.invoke('sync-vehicle-billing', { body: { business_id: businessId } })
        .catch((e) => console.error('[auto sync-vehicle-billing]', e))
    }
  }

  const startVehicleEdit = (vehicle: Vehicle) => {
    setEditingVehicleId(vehicle.id)
    setVehicleForm({
      name: vehicle.name,
      has_wheelchair: vehicle.has_wheelchair,
      has_reclining_wheelchair: vehicle.has_reclining_wheelchair,
      has_stretcher: vehicle.has_stretcher,
      rental_wheelchair: vehicle.rental_wheelchair,
      rental_reclining_wheelchair: vehicle.rental_reclining_wheelchair,
      rental_stretcher: vehicle.rental_stretcher,
    })
  }

  const cancelVehicleEdit = () => {
    setEditingVehicleId(null)
    setVehicleForm(createEmptyVehicleForm())
  }

  const toggleVehicleField = (field: VehicleEquipmentField) => {
    setVehicleForm((current) => {
      const next = !current[field]
      const updates: Partial<VehicleEditForm> = { [field]: next }
      if (!next) {
        if (field === 'has_wheelchair') updates.rental_wheelchair = false
        if (field === 'has_reclining_wheelchair') updates.rental_reclining_wheelchair = false
        if (field === 'has_stretcher') updates.rental_stretcher = false
      }
      return { ...current, ...updates }
    })
  }

  const handleSaveVehicle = async (vehicleId: string) => {
    const name = vehicleForm.name.trim()
    if (!name) {
      showToast('Please enter a vehicle name', 'error')
      return
    }

    setSavingVehicleId(vehicleId)
    const { error } = await supabase
      .from('vehicles')
      .update({
        name,
        has_wheelchair: vehicleForm.has_wheelchair,
        has_reclining_wheelchair: vehicleForm.has_reclining_wheelchair,
        has_stretcher: vehicleForm.has_stretcher,
        rental_wheelchair: vehicleForm.rental_wheelchair,
        rental_reclining_wheelchair: vehicleForm.rental_reclining_wheelchair,
        rental_stretcher: vehicleForm.rental_stretcher,
      })
      .eq('id', vehicleId)
    setSavingVehicleId(null)

    if (error) {
      showToast('Failed to update vehicle', 'error')
      return
    }

    showToast('車両情報を更新しました')
    cancelVehicleEdit()
    fetchVehicles()
  }

  const isDirty = JSON.stringify(form) !== savedSnapshot
  const missingFields = useMemo(
    () =>
      [
        !form.cancel_phone && 'キャンセル連絡先',
        (!form.service_areas || form.service_areas.length === 0) && '対応エリア',
      ].filter(Boolean) as string[],
    [form.cancel_phone, form.service_areas],
  )

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="spinner" />
        <p className="text-sm text-slate-400">読み込み中...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="card text-center py-10">
        <div className="text-3xl mb-2">!</div>
        <p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
        <button onClick={fetchProfile} className="btn-secondary text-sm">
          再読み込み
        </button>
      </div>
    )
  }

  const BoolRow = ({ label, field, disabled }: { label: string; field: keyof Business; disabled?: boolean }) => (
    <label
      className={`flex items-center justify-between py-2.5 border-b border-slate-100 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      }`}
    >
      <span className="text-sm text-slate-700">
        {label}
        {disabled && <span className="ml-1 text-[10px] text-slate-400">元機材が必要</span>}
      </span>
      <button
        type="button"
        onClick={() => !disabled && toggleBool(field)}
        disabled={disabled}
        className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
          form[field] ? 'bg-teal-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
            form[field] ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-4">プロフィール設定</h1>

      {isDirty && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-blue-700">未保存の変更があります</p>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="submit" form="profile-form" disabled={saving} className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors">
              {saving ? '保存中...' : '保存する'}
            </button>
            <button
              type="button"
              onClick={() => setForm(JSON.parse(savedSnapshot || '{}'))}
              className="text-xs text-blue-500 hover:text-blue-700 hover:underline"
            >
              元に戻す
            </button>
          </div>
        </div>
      )}

      {missingFields.length > 0 ? (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs font-medium text-amber-800 mb-1.5">以下を設定すると MSW の検索に表示されます</p>
          <div className="flex flex-wrap gap-1.5">
            {missingFields.map((field) => (
              <span key={field} className="text-xs bg-white border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
                {field}
              </span>
            ))}
          </div>
        </div>
      ) : !isDirty && (
        <div className="mb-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 text-xs text-teal-700 font-medium">
          表示に必要な項目は設定済みです
          <span className="block font-normal text-teal-600 mt-0.5">
            <Link to="/business/calendar" className="underline hover:text-teal-800">
              カレンダー
            </Link>
            で稼働ブロックを登録できます
          </span>
        </div>
      )}

      <form id="profile-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="card space-y-3">
          <h2 className="text-lg font-bold text-slate-700 border-b pb-2">基本情報</h2>
          <div>
            <label className="label">事業所名 <span className="text-red-500">*</span></label>
            <input className="input-base" value={form.name ?? ''} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} required maxLength={100} />
          </div>
          <div>
            <label className="label">住所</label>
            <input className="input-base" value={form.address ?? ''} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} maxLength={300} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">電話番号</label>
              <input className="input-base" value={form.phone ?? ''} onChange={(e) => setForm((current) => ({ ...current, phone: e.target.value }))} maxLength={20} />
            </div>
            <div>
              <label className="label">キャンセル連絡先 <span className="text-red-500">*</span></label>
              <input className="input-base" value={form.cancel_phone ?? ''} onChange={(e) => setForm((current) => ({ ...current, cancel_phone: e.target.value }))} maxLength={20} />
              <p className="text-sm text-slate-500 mt-1">MSW の申請確認画面に表示されます</p>
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="border-b pb-2">
            <h2 className="text-lg font-bold text-slate-700">営業時間・休業日</h2>
            <p className="text-sm text-slate-500 mt-1">カレンダーの初期表示に使います</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">開始時刻</label>
              <input type="time" className="input-base" value={form.business_hours_start ?? ''} onChange={(e) => setForm((current) => ({ ...current, business_hours_start: e.target.value }))} />
            </div>
            <div>
              <label className="label">終了時刻</label>
              <input type="time" className="input-base" value={form.business_hours_end ?? ''} onChange={(e) => setForm((current) => ({ ...current, business_hours_end: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className="label">休業日</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(index)}
                  className={`w-9 h-9 rounded-full text-sm font-medium border transition-colors ${
                    form.closed_days?.includes(index)
                      ? 'bg-red-500 text-white border-red-500'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="border-b pb-2">
            <h2 className="text-lg font-bold text-slate-700">回送の余裕時間（移動バッファ）</h2>
            <p className="text-sm text-slate-500 mt-1">
              予約と予約の間に、車が次の現場へ移動するための時間を確保します。0分のままだと連続予約が隙間なく入り、回送が間に合わない可能性があります。
            </p>
          </div>
          {(form.buffer_minutes ?? 0) === 0 && (
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              ⚠️ 現在0分（余裕なし）に設定されています。現場が続けて入り回送が間に合わない、というお困りがあれば設定をおすすめします。
            </p>
          )}
          <div className="w-40">
            <label className="label">余裕時間（分）</label>
            <input
              type="number"
              min={0}
              max={120}
              step={5}
              className="input-base"
              value={form.buffer_minutes ?? 0}
              onChange={(e) => {
                const raw = Number(e.target.value)
                const clamped = Number.isFinite(raw) ? Math.min(120, Math.max(0, raw)) : 0
                setForm((current) => ({ ...current, buffer_minutes: clamped }))
              }}
            />
            <p className="text-xs text-slate-400 mt-1">0〜120分の範囲で設定できます</p>
          </div>
        </div>

        <div className="card space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h2 className="text-lg font-bold text-slate-700">対応エリア <span className="text-red-500">*</span></h2>
              <p className="text-sm text-slate-500 mt-1">MSW の検索対象になります</p>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setForm((current) => ({ ...current, service_areas: [...SERVICE_AREAS] }))} className="text-xs text-teal-600 hover:underline">
                全選択
              </button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, service_areas: [] }))} className="text-xs text-slate-400 hover:underline">
                解除
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SERVICE_AREAS.map((area) => (
              <label key={area} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.service_areas?.includes(area) ?? false} onChange={() => toggleArea(area)} className="w-4 h-4 rounded border-slate-200 text-teal-600" />
                <span className="text-sm text-slate-700">{area}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="border-b pb-2 mb-1">
            <h2 className="text-lg font-bold text-slate-700">機材・貸出</h2>
            <p className="text-sm text-slate-500 mt-1">検索条件と事業所詳細に表示されます</p>
          </div>
          <BoolRow label="車椅子対応" field="has_wheelchair" />
          <BoolRow label="リクライニング車椅子対応" field="has_reclining_wheelchair" />
          <BoolRow label="ストレッチャー対応" field="has_stretcher" />
          <BoolRow label="車椅子貸出" field="rental_wheelchair" disabled={!form.has_wheelchair} />
          <BoolRow label="リクライニング貸出" field="rental_reclining_wheelchair" disabled={!form.has_reclining_wheelchair} />
          <BoolRow label="ストレッチャー貸出" field="rental_stretcher" disabled={!form.has_stretcher} />
        </div>

        <div className="card">
          <h2 className="text-lg font-bold text-slate-700 border-b pb-2 mb-1">その他対応</h2>
          <BoolRow label="女性介助者対応" field="has_female_caregiver" />
          <BoolRow label="長距離対応" field="long_distance" />
          <BoolRow label="当日対応" field="same_day" />
        </div>

        <div className="card space-y-3">
          <div className="border-b pb-2">
            <h2 className="text-lg font-bold text-slate-700">資格・料金・PR</h2>
          </div>
          <div>
            <label className="label">資格・特徴</label>
            <textarea className="input-base resize-none" rows={3} maxLength={2000} value={form.qualifications ?? ''} onChange={(e) => setForm((current) => ({ ...current, qualifications: e.target.value }))} />
          </div>
          <div>
            <label className="label">料金情報</label>
            <textarea className="input-base resize-none" rows={3} maxLength={2000} value={form.pricing ?? ''} onChange={(e) => setForm((current) => ({ ...current, pricing: e.target.value }))} />
          </div>
        </div>

        <button
          type="submit"
          className={`w-full font-semibold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 ${
            isDirty ? 'bg-teal-600 text-white hover:bg-teal-700' : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
          disabled={saving || !isDirty}
        >
          {saving ? '保存中...' : isDirty ? '変更を保存する' : '保存済み'}
        </button>
      </form>

      <div className="card mt-6 space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-lg font-bold text-slate-700">車両管理</h2>
          <p className="text-sm text-slate-500 mt-1">カレンダーと空き検索で利用する車両を管理します</p>
        </div>

        <div className="space-y-2">
          {vehicles.length === 0 ? (
            <p className="text-sm text-slate-500">登録済みの車両はありません</p>
          ) : (
            vehicles.map((vehicle) => {
              const occupiedCount = vehicleCounts[vehicle.id] ?? 0
              const canDelete = occupiedCount === 0
              const isSaving = savingVehicleId === vehicle.id
              return (
                <div key={vehicle.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{vehicle.name}</p>
                    <p className="text-xs text-slate-400">occupied slot: {occupiedCount}件</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startVehicleEdit(vehicle)}
                      disabled={isSaving}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      編集
                    </button>
                    <button
                    type="button"
                    onClick={() => handleDeleteVehicle(vehicle.id)}
                    disabled={!canDelete || deletingVehicleId === vehicle.id || savingVehicleId === vehicle.id}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      canDelete
                        ? 'bg-red-50 border border-red-200 text-red-600 hover:bg-red-100'
                        : 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    {deletingVehicleId === vehicle.id ? '削除中...' : '削除'}
                  </button>
                  </div>
                </div>
              )
            })
          )}
        </div>

        {editingVehicleId && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 space-y-3">
            <input
              className="input-base"
              value={vehicleForm.name}
              onChange={(e) => setVehicleForm((current) => ({ ...current, name: e.target.value }))}
              maxLength={100}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {VEHICLE_EQUIPMENT_FIELDS.map((item) => {
                const disabled = Boolean(item.requires && !vehicleForm[item.requires])
                return (
                  <label
                    key={item.field}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                      disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                    } ${
                      vehicleForm[item.field]
                        ? 'border-teal-200 bg-teal-50 text-teal-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={vehicleForm[item.field]}
                      disabled={disabled || savingVehicleId === editingVehicleId}
                      onChange={() => toggleVehicleField(item.field)}
                      className="w-4 h-4 rounded"
                    />
                    <span>{item.label}</span>
                  </label>
                )
              })}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={cancelVehicleEdit}
                disabled={savingVehicleId === editingVehicleId}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 border border-slate-200 text-slate-600 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => handleSaveVehicle(editingVehicleId)}
                disabled={savingVehicleId === editingVehicleId}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50"
              >
                {savingVehicleId === editingVehicleId ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        <div className="border-t pt-4">
          <label className="label">車両名</label>
          <div className="flex gap-2">
            <input
              className="input-base flex-1"
              value={newVehicleName}
              onChange={(e) => setNewVehicleName(e.target.value)}
              maxLength={100}
              placeholder="例: 車両2"
            />
            <button type="button" onClick={handleAddVehicle} disabled={addingVehicle} className="btn-primary whitespace-nowrap">
              {addingVehicle ? '追加中...' : '車両追加'}
            </button>
          </div>
          {vehicles.length >= FREE_VEHICLES && (
            <p className="text-xs text-amber-600 mt-2">
              ⚠️ {FREE_VEHICLES}台目までは基本料に含まれます。この車両を追加すると{FREE_VEHICLES + 1}台目以降として月額¥{DEFAULT_PER_VEHICLE_FEE.toLocaleString()}/台が加算されます（翌月分から請求）。詳しくは<Link to="/business/billing" className="underline">料金・契約</Link>ページをご確認ください。
            </p>
          )}
          <p className="text-xs text-slate-400 mt-2">occupied slot がある車両は削除できません</p>
        </div>
      </div>
    </div>
  )
}

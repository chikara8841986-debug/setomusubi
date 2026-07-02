
-- ══════════════════════════════════════════════
-- 1. vehicles テーブル（事業所ごとの車両管理）
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.vehicles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text        NOT NULL DEFAULT '車両1',
  notes       text,
  active      boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

-- 事業所オーナーは自分の車両を自由に管理できる
CREATE POLICY "vehicles_owner_all" ON public.vehicles
  FOR ALL
  USING (
    business_id IN (
      SELECT id FROM public.businesses WHERE user_id = auth.uid()
    )
  );

-- 認証済みユーザーは全車両を参照可（MSW が空き検索に使う）
CREATE POLICY "vehicles_authenticated_select" ON public.vehicles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════
-- 2. occupied_slots テーブル（使用済み時間帯）
--    ドラッグで「塞ぐ」逆転モデル
-- ══════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.occupied_slots (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id     uuid        NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  date           date        NOT NULL,
  start_time     time        NOT NULL,
  end_time       time        NOT NULL,
  reservation_id uuid        REFERENCES public.reservations(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.occupied_slots ENABLE ROW LEVEL SECURITY;

-- 事業所オーナーは自分の車両の occupied_slot を管理できる
CREATE POLICY "occupied_slots_owner_all" ON public.occupied_slots
  FOR ALL
  USING (
    vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.businesses b ON b.id = v.business_id
      WHERE b.user_id = auth.uid()
    )
  );

-- 認証済みユーザーは参照可（MSW の空き判定に使う）
CREATE POLICY "occupied_slots_authenticated_select" ON public.occupied_slots
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- ══════════════════════════════════════════════
-- 3. reservations に vehicle_id を追加
--    NULL 許容 → 既存データはそのまま動く
-- ══════════════════════════════════════════════
ALTER TABLE public.reservations
  ADD COLUMN IF NOT EXISTS vehicle_id uuid
  REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- ══════════════════════════════════════════════
-- 4. 既存事業所に「車両1」をシード
--    （ハコビテ等の既存ユーザーがエラーにならないよう）
-- ══════════════════════════════════════════════
INSERT INTO public.vehicles (business_id, name, sort_order)
SELECT id, '車両1', 0
FROM public.businesses
WHERE id NOT IN (SELECT business_id FROM public.vehicles);

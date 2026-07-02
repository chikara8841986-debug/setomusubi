
-- hospital_id を nullable に
ALTER TABLE reservations ALTER COLUMN hospital_id DROP NOT NULL;

-- source カラム追加（'msw' or 'phone'）
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'msw';

-- caller_name カラム追加（電話予約時の患者名など）
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS caller_name text;

-- caller_phone カラム追加（電話番号）
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS caller_phone text;

-- notes カラム追加（メモ）
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS notes text;

-- 事業所が電話予約を INSERT できる RLS ポリシー
CREATE POLICY "business can insert phone reservations"
  ON reservations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = reservations.business_id
        AND businesses.user_id = auth.uid()
    )
  );

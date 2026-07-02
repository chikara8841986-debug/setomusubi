
-- 電話番号の正規化カラム（数字のみ）と部分ユニーク制約を追加
-- 同じ電話番号で複数の事業所が登録されることを防ぐ

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS phone_digits text
  GENERATED ALWAYS AS (
    CASE
      WHEN phone IS NULL OR trim(phone) = '' THEN NULL
      ELSE regexp_replace(phone, '[^0-9]', '', 'g')
    END
  ) STORED;

-- phone_digits が NULL でない場合のみユニーク制約を適用
CREATE UNIQUE INDEX IF NOT EXISTS uq_businesses_phone_digits
  ON public.businesses (phone_digits)
  WHERE phone_digits IS NOT NULL AND phone_digits != '';

COMMENT ON COLUMN public.businesses.phone_digits IS
  'phone から数字のみを抽出した正規化値。重複登録判定用。';

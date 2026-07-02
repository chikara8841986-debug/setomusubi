
-- 車両ごとの対応機器フラグを追加
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS has_wheelchair           boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_reclining_wheelchair boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_stretcher            boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_wheelchair        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_reclining_wheelchair boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rental_stretcher         boolean NOT NULL DEFAULT false;

-- 既存ハコビテ車両に、現在の事業所フラグをそのまま引き継ぐ
UPDATE public.vehicles v
SET
  has_wheelchair            = b.has_wheelchair,
  has_reclining_wheelchair  = b.has_reclining_wheelchair,
  has_stretcher             = b.has_stretcher,
  rental_wheelchair         = b.rental_wheelchair,
  rental_reclining_wheelchair = b.rental_reclining_wheelchair,
  rental_stretcher          = b.rental_stretcher
FROM public.businesses b
WHERE v.business_id = b.id;

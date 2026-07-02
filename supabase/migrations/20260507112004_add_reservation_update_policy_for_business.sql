
-- 業者が自分の事業所の予約を UPDATE できるポリシー
-- (guard_reservation_columnsトリガーで変更可能カラムを制御)
CREATE POLICY "reservations: business update own"
ON public.reservations
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = reservations.business_id
      AND b.user_id = auth.uid()
  )
);

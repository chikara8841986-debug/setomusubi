
-- 組織（事業所/病院）にひもづく「追加の通知先」。オーナーのauthアカウントとは別に、
-- スタッフのメール/LINEを登録して全員に配信できるようにする土台。
CREATE TABLE IF NOT EXISTS public.notification_recipients (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id  uuid REFERENCES public.businesses(id) ON DELETE CASCADE,
  hospital_id  uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  label        text,                    -- スタッフ名など（任意）
  email        text,
  line_user_id text,
  notify_email boolean NOT NULL DEFAULT true,
  notify_line  boolean NOT NULL DEFAULT true,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  -- 事業所か病院のどちらか一方にひもづく
  CONSTRAINT recipient_one_org CHECK (
    (business_id IS NOT NULL AND hospital_id IS NULL) OR
    (business_id IS NULL AND hospital_id IS NOT NULL)
  ),
  -- 最低1つの宛先を持つ
  CONSTRAINT recipient_has_endpoint CHECK (email IS NOT NULL OR line_user_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_notif_recipients_business ON public.notification_recipients (business_id) WHERE business_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_recipients_hospital ON public.notification_recipients (hospital_id) WHERE hospital_id IS NOT NULL;

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

-- オーナー（その事業所/病院のauthユーザー）は自組織の宛先をCRUDできる
CREATE POLICY notif_recipients_owner_select ON public.notification_recipients
  FOR SELECT USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR hospital_id IN (SELECT id FROM public.hospitals WHERE user_id = auth.uid())
  );
CREATE POLICY notif_recipients_owner_insert ON public.notification_recipients
  FOR INSERT WITH CHECK (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR hospital_id IN (SELECT id FROM public.hospitals WHERE user_id = auth.uid())
  );
CREATE POLICY notif_recipients_owner_update ON public.notification_recipients
  FOR UPDATE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR hospital_id IN (SELECT id FROM public.hospitals WHERE user_id = auth.uid())
  );
CREATE POLICY notif_recipients_owner_delete ON public.notification_recipients
  FOR DELETE USING (
    business_id IN (SELECT id FROM public.businesses WHERE user_id = auth.uid())
    OR hospital_id IN (SELECT id FROM public.hospitals WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.notification_recipients IS '組織（事業所/病院）にひもづく追加通知先。notify がオーナー＋この一覧へ配信する。';

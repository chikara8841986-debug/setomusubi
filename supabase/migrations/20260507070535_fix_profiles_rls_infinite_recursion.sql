
-- SECURITY DEFINER 関数で RLS をバイパスして admin 判定（再帰防止）
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- anon には実行させない
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- 再帰を起こしていたポリシーを差し替え
DROP POLICY IF EXISTS "profiles: admin read all" ON public.profiles;
CREATE POLICY "profiles: admin read all" ON public.profiles
  FOR SELECT
  USING (public.is_admin());

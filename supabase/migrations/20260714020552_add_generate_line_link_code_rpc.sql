-- F3: ログイン中のユーザー向けにLINE連携コードを発行するRPC。
-- 紛らわしい文字(0/O/1/I)を除いた6文字コードを生成し、10分間有効にする。
create or replace function public.generate_line_link_code()
returns text
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_attempt int := 0;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    end loop;

    begin
      update public.profiles
        set line_link_code = v_code,
            line_link_code_expires_at = now() + interval '10 minutes'
        where id = v_caller;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'line_link_code_generation_failed';
      end if;
    end;
  end loop;

  return v_code;
end
$$;

revoke execute on function public.generate_line_link_code() from public, anon;
grant execute on function public.generate_line_link_code() to authenticated;

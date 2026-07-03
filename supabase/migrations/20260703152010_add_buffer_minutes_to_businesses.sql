-- A4修正: 予約と予約の間に回送(移動)の余裕時間を持たせるための設定値。
-- DB制約までは入れず(電話予約と衝突しやすいため)、検索フィルタと承認時チェックのみで運用する。
alter table public.businesses add column if not exists buffer_minutes int not null default 0;
alter table public.businesses add constraint buffer_minutes_range check (buffer_minutes >= 0 and buffer_minutes <= 120);

comment on column public.businesses.buffer_minutes is '予約と予約の間に確保する回送時間(分)。0〜120分。MSW検索の空き判定と承認時の重複チェックで加味する。DB制約(GiST排他)には反映しない。';

-- A3修正: 乗車時刻が迫っているのに未承認のpendingをMSWへ事前警告するための重複防止フラグ。
alter table public.reservations add column if not exists msw_unconfirmed_warning_sent boolean not null default false;

comment on column public.reservations.msw_unconfirmed_warning_sent is '乗車24時間前(当日申請は3時間前)時点で未承認だった場合にMSWへ警告メールを送ったかどうか。send-reminderが管理。';

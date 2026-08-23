# 一般利用者への開放 — 設計プラン

作成: 2026-08-22 / ステータス: **設計のみ（実装未着手）**

MSW（病院の医療ソーシャルワーカー）以外の人も登録して使えるようにするための設計メモ。
実装前にこのファイルを読むこと。`RISK_REGISTER.md` とは別管理（あちらは既存リスクの台帳）。

---

## 0. ユーザー判断（確定済み 2026-08-22）

| 論点 | 決定 |
|---|---|
| 対象とする利用者 | **両方やる**（①ケアマネ等の専門職 ②患者本人・家族などの個人）。段階的に進めてよい |
| 事業所が一般予約の受付可否を選べるか | **選べるようにする**（事業所側にスイッチを持たせる） |
| 今回のスコープ | 設計プランの作成まで。実装は別途指示を待つ |
| 中長期の方向性 | 将来的に**県外へ展開**する。日本全国で必要とされる社会インフラとして普及させる道筋を念頭に置く |

---

## 1. 現状の作り（2026-08-22 時点の実地調査結果）

### 1.1 ロール（利用者区分）

- `profiles.role` は DB の CHECK 制約 `profiles_role_check` で **`business` / `msw` / `admin` の3値に限定**されている。
- 新規登録は `auth.users` の AFTER INSERT トリガ `on_auth_user_created`（関数 `handle_new_user_registration`）が一括処理する。
  - `raw_user_meta_data->>'role'` を読み、**`business` と `msw` のみホワイトリスト許可**。それ以外は `registration_invalid_role` で例外。
  - `admin` は自己申告では絶対に付与されない（セキュリティ設計として正しい。**この性質は維持すること**）。
  - `role='msw'` の場合、`hospitals` に1行 INSERT し、`contact_name` があれば `msw_contacts` にも1行作る。

### 1.2 MSW の身元は `hospitals` 行に紐づいている

MSW 側の権限判定はすべて「その人が `hospitals.user_id` の持ち主か」で行われる。

- RLS `reservations: msw read own` / `reservations: msw insert`
  → `EXISTS (SELECT 1 FROM hospitals h WHERE h.id = reservations.hospital_id AND h.user_id = auth.uid())`
- RPC `cancel_reservation_by_msw` も同じ判定。
- `hospitals` の列は `id / user_id / name / address / phone / created_at` のみ。

> **重要な発見**: `hospitals` に `approved` 列は**存在しない**。`businesses.approved` はあるが MSW 側にはない。
> つまり MSW 登録には実質的な承認ゲートがなく、病院名を自由入力すれば即利用できる。
> 一方 `MswRegister.tsx` の完了メッセージは「管理者の承認をお待ちください」と表示している（実態と不一致）。
> 一般開放を検討する以前に、この文言か仕組みのどちらかを揃える必要がある → §6-A

### 1.3 予約データの構造（`reservations`）

- `business_id` … **NOT NULL**
- `hospital_id` … **NULL 可**
- `source` … CHECK `('msw','phone')`、デフォルト `'msw'`
- `status` … CHECK `('pending','confirmed','completed','cancelled','rejected')`
- 電話予約（`source='phone'`）は `hospital_id` が NULL で、`caller_name` / `caller_phone` を持つ。
- 病院固有の列: `ward`（病棟）, `room_number`（病室）
- ステータス変更は必ず RPC 経由（`guard_reservation_columns` が `app.rpc_context` の許可リストで fail-closed。→ RISK_REGISTER A5）

**設計上ありがたい点**: 「病院に属さない予約」は既に成立する構造になっている（電話予約が前例）。

### 1.4 通知の仕組み

`supabase/functions/notify/index.ts` は `user_id` を受け取り、

1. 本人の email / LINE へ送る
2. その人の所属組織（`businesses` or `hospitals`）を引き、`notification_recipients` のスタッフへファンアウト

という順で動く。**個人利用者は 2 が空振りするだけで、1 はそのまま動く。**
→ 通知基盤は個人利用者にほぼ無改修で対応できる。

ただし各 `send-*` Edge Function は本文に `res.hospitals?.name` を埋め込んでいるため、
個人予約では病院名が空欄になる。フォールバック文言が必要 → §4.4

### 1.5 対応エリアは香川県ベタ書き

`src/lib/constants.ts` の `SERVICE_AREAS` が**香川県17市町の固定配列**。
`businesses.service_areas` は `text[]` で、市町名の文字列一致で検索フィルタしている。
`Manual.tsx` / `DemoGuide.tsx` にも香川県前提の文章がある。
→ 県外展開の障害。詳細は §5

---

## 2. 設計方針（全体像）

新しい利用者を **2種類**に分けて考える。両者は必要な作りが大きく違う。

| 区分 | 具体例 | 所属先 | 実装コスト |
|---|---|---|---|
| **A. 所属先のある依頼者** | ケアマネジャー、介護施設職員、地域包括支援センター | あり | **小**（MSW とほぼ同じ） |
| **B. 個人** | 患者本人、その家族 | なし | **大**（新しい権限経路 + 規約 + 悪用対策） |

### 方針の要点

1. **A は既存の MSW の仕組みを一般化して吸収する。** 新ロールを増やさない。
2. **B は独立した新ロールとして追加する。** 所属先がないため権限の判定軸が根本的に違う。
3. 既存データの移行を発生させない（`profiles.role='msw'` の既存行はそのまま使い続ける）。

---

## 3. 区分A（ケアマネ等の専門職）の設計

### 3.1 中心となる考え方

`hospitals` テーブルを「**依頼者の所属先**」として一般化する。テーブル名は変えない。

```sql
alter table public.hospitals
  add column org_type text not null default 'hospital'
  check (org_type in ('hospital','care_office','facility','other'));
```

これだけで、**既存の RLS ポリシー・RPC・Edge Function を一切書き換えずに**
ケアマネや施設職員を受け入れられる。判定軸（`hospitals.user_id = auth.uid()`）が変わらないため。

### 3.2 必要な変更

| 場所 | 変更内容 |
|---|---|
| DB | `hospitals.org_type` 追加（上記） |
| 登録トリガ | `hospital_name` → 所属先名として受け取り、`org_type` も metadata から保存 |
| 登録画面 | `MswRegister.tsx` に「所属先の種別」選択を追加（病院 / 居宅介護支援事業所 / 施設 / その他） |
| 画面文言 | 「病院」固定の表記を「所属先」に。`org_type` に応じて表示を出し分け |
| 予約フォーム | `ward` / `room_number` は `org_type='hospital'` のときだけ表示 |

### 3.3 命名の負債（承知のうえで受け入れる）

- ロール値 `'msw'` は実質「所属先のある依頼者」を意味することになる。
- テーブル名 `hospitals` も同様に「所属先」の意味になる。

改名は RLS・RPC・Edge Function・フロントすべてに波及して危険が大きい割に、
利用者から見える価値はゼロ。**改名しない**判断とし、この負債をここに明記しておく。
将来どうしても必要になったらビュー経由で段階的に移行する。

---

## 4. 区分B（個人利用者）の設計

### 4.1 新しいロール

```sql
-- 1) ロールの許可値を広げる
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('business','msw','admin','personal'));
```

登録トリガのホワイトリストにも `'personal'` を追加する。
**`'admin'` を絶対に自己付与させない性質は必ず維持すること。**
`role='personal'` のときは `hospitals` 行を作らない。

### 4.2 予約の持ち主をどう表すか

個人には所属先がないので、予約に**申込者の user_id を直接持たせる**。

```sql
alter table public.reservations
  add column requester_user_id uuid references auth.users(id);

alter table public.reservations drop constraint reservations_source_check;
alter table public.reservations add constraint reservations_source_check
  check (source in ('msw','phone','personal'));
```

新しい RLS ポリシー（既存ポリシーは触らない、純粋な追加）:

```sql
create policy "reservations: personal read own" on public.reservations
  for select using (requester_user_id = auth.uid());

create policy "reservations: personal insert" on public.reservations
  for insert with check (
    requester_user_id = auth.uid()
    and source = 'personal'
    and exists (
      select 1 from public.businesses b
      where b.id = business_id and b.accepts_personal_requests = true
    )
  );
```

> 受付可否のチェックを **RLS 側にも書く**のが重要。
> 画面で隠すだけでは、リクエストを直接投げられたときに素通りしてしまう。

### 4.3 キャンセル用 RPC

`cancel_reservation_by_msw` と同じ構造で `cancel_reservation_by_personal(p_reservation_id uuid)` を新設する。

- SECURITY DEFINER
- `reservations.requester_user_id = auth.uid()` を検証
- `set_config('app.rpc_context', 'cancel_reservation_by_personal', true)` を必ず呼ぶ
- **`guard_reservation_columns` の許可リストに追加すること**（忘れると本番でキャンセルが全部弾かれる）
- `authenticated` にのみ EXECUTE 付与（`expire_reservation` の権限事故の再発防止 → RISK_REGISTER A5 追補）

### 4.4 通知

- `notify` は無改修で動く見込み（§1.4）。
- `send-request-received` / `send-confirmation` / `send-cancellation` / `send-business-cancellation` /
  `send-reminder` の本文にある `病院: ${res.hospitals?.name}` は、個人予約だと空欄になる。
  → `res.hospitals?.name ?? '個人のお客様'` 相当のフォールバックを入れる。
- **デプロイ時は必ず対象ファイルを Read してから `files[].content` に渡し、
  デプロイ後に `get_edge_function` で日本語文言を照合すること**（文字化け事故の再発防止）。

### 4.5 予約フォームの差分

| 項目 | MSW | 個人 |
|---|---|---|
| 病棟・病室 | 表示 | **非表示** |
| 担当者名 | 病院の担当者 | 申込者本人の氏名 |
| 患者名 | 患者 | 利用される方（本人 or 家族） |
| 電話番号 | 病院の代表番号を使用 | **必須で入力させる**（連絡が取れないと運行できない） |
| 乗車地 | 病院・自宅など | 自宅など |

---

## 5. 事業所側のスイッチ（ユーザー判断: 実装する）

```sql
alter table public.businesses
  add column accepts_personal_requests boolean not null default false;
```

- **デフォルトは `false`（オプトイン）**。既存事業所が知らないうちに個人予約を受ける事態を防ぐ。
- 事業所プロフィール画面にスイッチを置く。
- 個人利用者の検索結果は `accepts_personal_requests = true` の事業所のみ。
- **RLS 側にも同条件を書く**（§4.2）。画面のフィルタだけでは防御にならない。
- 全事業所が `false` のままだと個人利用者に何も表示されないので、
  リリース時に事業所へ案内し、オンにしてもらう導線が必要。

区分A（ケアマネ等）は MSW と同等の専門職なので、このスイッチの対象外とする。

---

## 6. 実装前に片付けるべき前提

### 6-A. MSW 承認ゲートの実態と表示の不一致（§1.2）

`MswRegister.tsx` は「管理者の承認をお待ちください」と出すが、DB に承認の仕組みがない。
どちらかに揃える:

- **案1**: 文言を実態に合わせる（承認を待たない旨に修正）。工数ほぼゼロ。
- **案2**: `hospitals.approved` を追加し、`businesses` と同じ承認フローを作る。工数中。一般開放するなら整合的。

一般利用者を受け入れるなら、身元確認の設計と合わせて案2寄りの検討が要る。

### 6-B. 利用規約・法務（コードでは解決できない）

- `src/pages/Terms.tsx` は事業者・MSW 向けの文章。個人が相手だと消費者向けのルールが別に要る。
- 介護保険を使う送迎かどうかで手続きが変わる可能性がある。**私（AI）の推測ではなく実務確認が必要な領域。**
- 特定商取引法に基づく表記のページ新設（RISK_REGISTER C4 に既出の宿題）。

### 6-C. 悪用・無断キャンセル対策

MSW は病院職員という身元があるが、一般公開すると匿名に近い登録が可能になる。

- 電話番号必須（§4.5）
- 事業所が断れる導線は既存（却下フロー）
- 繰り返し無断キャンセルするアカウントへの対処は将来課題として記録

---

## 7. 県外展開に向けた宿題（今回のスコープ外・別項目）

一般開放とは独立した課題だが、方向性として記録しておく。

### 7.1 現状の問題

`SERVICE_AREAS` は香川県17市町のベタ書き配列で、`businesses.service_areas` は市町名の**文字列一致**。
全国展開すると**市区町村名が他県と衝突する**（例: 府中市＝東京都/広島県、伊達市＝北海道/福島県）。
このまま県外の事業所を登録すると、誤った地域の事業所が検索に出る事故が起きる。

### 7.2 対応の方向

1. エリアを定数配列から **DB テーブル**へ移す（都道府県 + 市区町村の2階層）。
2. `businesses.service_areas` を市区町村コード参照に置き換える（総務省の全国地方公共団体コードを使うのが堅い）。
3. 検索 UI を「都道府県を選ぶ → 市区町村を選ぶ」の2段階にする。
4. `Manual.tsx` / `DemoGuide.tsx` の香川県前提の文章を可変にする。

**県外の事業所を1件でも登録する前に着手すること。** 後から直すとデータ移行が発生する。

---

## 8. 推奨する進め方（段階）

| フェーズ | 内容 | 規模 | 前提 |
|---|---|---|---|
| **1** | 区分A（ケアマネ等の専門職）対応 | 小 | なし。すぐ着手可 |
| **2** | 6-A（承認ゲートの整合）を解決 | 小〜中 | フェーズ3の前に必要 |
| **3** | 区分B（個人利用者）+ 事業所スイッチ | 大 | 6-B（規約・法務）の確認が済んでいること |
| **4** | 県外展開の下地（エリアのデータ化） | 中 | 県外の事業所登録より前 |

フェーズ1だけでも「病院以外の専門職が使える」という実利が出る。
フェーズ3は規約・法務の確認が終わるまで着手しない。

---

## 9. 実装時のチェックリスト（着手時に使う）

- [ ] `guard_reservation_columns` の許可リストに新 RPC を追加したか
- [ ] 新 RPC の EXECUTE 権限は必要最小のロールだけか
- [ ] 事業所スイッチの条件を **RLS にも**書いたか（画面フィルタだけになっていないか）
- [ ] `admin` ロールが自己付与できない性質を壊していないか
- [ ] Edge Function をデプロイしたら repo にも同じ内容を書いたか（E2 のドリフト対策）
- [ ] デプロイ後に `get_edge_function` で日本語文言を照合したか（文字化け対策）
- [ ] `RISK_REGISTER.md` の人間チェックリストに実機確認項目を追加したか

---

# 【着手決定】2026-08-23

| 論点 | 決定 |
|---|---|
| どこまで作るか | **区分B（一般の方＝ご利用者本人・ご家族）の登録まで作る**。フェーズ3に着手 |
| ログイン画面 | **事業者用と利用者用に分割**し、QRも別にする |
| 利用者ログインからの事業者導線 | **小さく1行だけ残す**（既に`/login`をブックマークしている事業者が迷子にならないため） |
| MSW限定の表現 | **サイト全体で修正する**（下記の洗い出し結果を参照） |

## ログイン画面の分割方針

- `/login` … **利用者向け**（ご利用者・ご家族・病院MSW・ケアマネ等）。事業者向けは最下部に小さく1行のみ
- `/business/login` … **事業者向け**。事業所登録へのリンクはこちらに集約
- 認証の仕組み自体は共通（Supabase Auth）。**ログイン後のロール別リダイレクトは現状のまま**。
  事業者が利用者側の入口からログインしても弾かずに`/business/calendar`へ送る（入口違いで詰ませない）
- チラシのQRは、事業者向け→`/business/login`、利用者向け→`/login` に振り分ける

## MSW限定表現の洗い出し（2026-08-23 時点・要修正箇所）

デモ関連を除き、以下に「MSW」「病院」に限定した表現がある。一般利用者にも当てはまる表現へ直す。

| ファイル | 箇所 |
|---|---|
| `src/pages/auth/Login.tsx` | 「MSW（病院）の方（新規登録）」 |
| `src/pages/auth/MswRegister.tsx` | ページ名「MSW（病院）新規登録」、**病院名が必須入力**、「病院情報」「病院住所」 |
| `src/pages/business/Introduction.tsx` | 「MSWが事業所を選ぶ際に参照する」「MSWに見える画面」「MSWの検索に表示されます」 |
| `src/pages/business/Profile.tsx` | 「MSW の申請確認画面に表示されます」「MSW の検索対象になります」 |
| `src/pages/business/Reservations.tsx` | 「MSWからの仮予約が届きます」「MSWへ通知メール」「MSWから申請が届きます」、絞り込みの「病院名」 |
| `src/pages/business/Calendar.tsx` | 「MSWへ直接ご連絡ください」（承認/お断り時のトースト）、「病院名/担当者」表示 |
| `src/pages/admin/Approvals.tsx` | 「MSWの検索結果に表示される」 |
| `src/pages/admin/Reservations.tsx` | 「全事業所・全病院の予約」、CSVヘッダの「病院名」、絞り込みプレースホルダ |
| `src/pages/admin/Stats.tsx` | 指標ラベル「病院・MSW」 |
| `src/pages/Manual.tsx` | 「香川県の介護タクシー事業所と病院のMSWをつなぐ」等 |
| `src/pages/DemoGuide.tsx` | 全体がMSW前提の説明 |

**表現の置き換え方針**（例）:
- 「MSW」単独 → 「ご利用者・病院の方」または文脈により「申込者」
- 「MSWの検索」 → 「利用者・MSWの検索」
- 「病院名」 → 予約データ上は`hospitals`が無い場合があるため「申込元」「ご依頼元」等、空欄でも成立する表記に
- 予約詳細の「病院」欄 → 一般利用者の予約では病院が存在しないため、非表示またはフォールバック表示にする

## 実装順序

1. **バックエンド**（DB・RLS・RPC）… 土台。これが無いとフロントが作れない
2. **フロントエンド**（登録・検索・予約・ログイン分割・文言一掃）

---

## 【フロント実装時に必ず直すこと】通知メール内のリンク（2026-08-23 Claudeレビューで発見）

バックエンド実装後のレビューで発見。`send-reminder` の通知本文に **MSW専用URLがハードコードされている**。

| 箇所 | 現在のリンク | 問題 |
|---|---|---|
| `expireStalePending`（申請が期限切れ） | `${APP_URL}/msw/search` | 個人利用者に届くと、権限のないMSW用画面に案内してしまう |
| `warnMswUnconfirmed`（まだ承認されていません） | `${APP_URL}/msw/search` | 同上 |

バックエンド修正により**これらの通知は個人利用者にも届くようになった**が、
リンク先が個人向け画面を想定していない。個人向けの検索画面のルートが決まり次第、
`res.source === 'personal'` で出し分けること。

同様に `send-request-received` / `send-confirmation` 等の他の `send-*` にも
`/msw/...` や `/business/...` を指すリンクがあるため、フロント実装時に全て点検する。

# せとむすび リスク台帳

- 作成: 2026-07-02（Opus 4.8 による全数調査。コード実読・DB実クエリ・Edge Function実叩きで検証済み）
- 用途: 別セッション（Sonnet等）が **1項目ずつ潰していく** ためのバックログ。着手時に `[ ]`→`[x]` に更新し、対応コミットハッシュを追記すること。
- 運用ルール: 修正前に必ず該当ファイルを Read し、この台帳の「修正方針」は参考として現状コードを正とする。DB変更は `apply_migration`（MCP: supabase, project_id `lcuoeekhnmbhomcdbedi`）。Edge Function は MCP `deploy_edge_function` でデプロイし、**ソースを必ず repo にも保存**する。

## 🧪 人間による最終チェック待ち一覧（まとめて後で確認用）

Claudeが自動修正・DB検証まで済ませたが、実ログインでのブラウザ操作までは確認できていない項目。実装が一通り終わったタイミングでまとめて確認してください。

- [ ] **A1**: 業者アカウントでログイン→「電話予約を記録」で車両を選んで登録→MSW検索でその車両のその時間帯が候補から消えることを確認。
- [ ] **A2**: MSWアカウントでログイン→車椅子で検索→事業所選択後の申請フォームで機材ボタンが押せない（表示専用）ことを確認。「条件を変えて再検索」リンクが検索画面(step1)に正しく戻ることを確認。

<!-- 新しい項目はこの下に追記していく -->

## 前提（システム構成の要点）

- 本番: https://setomusubi.vercel.app （Vercel、masterへのpushで自動デプロイ）
- DB/認証/Edge Functions: Supabase project `lcuoeekhnmbhomcdbedi`（**FREEプラン**）
- 決済: Stripe（テストモード運用中）。webhook v20系。
- メール: Resend（独自ドメイン `send.hakobite-marugame.com` 認証済み、無料枠100通/日）
- 通知: 中央ディスパッチ `supabase/functions/notify/index.ts`（user_id→本人＋notification_recipientsの組織スタッフへメール/LINEファンアウト。LINEは `LINE_CHANNEL_ACCESS_TOKEN` 未設定のため現状メールのみ）
- 予約モデル: ネガティブリスト型。事業所は `occupied_slots`（車両×時間の占有）を登録、MSW検索は「占有されていない車両を持つ事業所」を返す。占有は `reservations` INSERT時のトリガ `auto_create_occupied_slot`（**vehicle_id がある場合のみ**）でも作られる。`occupied_slots` には GiST 排他制約 `no_overlap_per_vehicle` あり。
- 予約status変更: 原則RPC（approve_reservation / reject_reservation / complete_reservation / cancel_reservation_by_msw / create_phone_reservation）。BEFORE UPDATEトリガ `guard_reservation_columns` は `app.rpc_context` 未設定(NULL)だと**素通り**する（→A5）。

---

## 🔴 A. 予約整合性（ダブルブッキング・搬送事故に直結）

### [x] A1. 電話予約が車両を塞がない（最優先）— 対応済み 2026-07-02
- **事象**: 予約管理ページの「電話予約を記録」は旧方式の RPC `create_phone_reservation` を呼ぶ。この関数は旧 `availability_slots` にINSERTし、`vehicle_id` を設定しない → トリガが発火せず **occupied_slot が作られない** → MSW検索でその時間帯が空きのまま → ダブルブッキング。
- **該当**: `src/pages/business/Reservations.tsx` の `handlePhoneSubmit`（`supabase.rpc('create_phone_reservation', ...)`）、DB関数 `public.create_phone_reservation`
- **対応内容**:
  - DB関数 `public.create_phone_reservation` に `p_vehicle_id uuid`（必須）を追加。旧シグネチャは `drop function` 済み。事業所配下のアクティブ車両かをチェックし、`pg_advisory_xact_lock` で同一車両への同時登録をシリアライズしたうえで `occupied_slots` の重複を明示チェック（`phone_reservation_slot_conflict` を送出）。GiST排他制約違反もバックストップとして捕捉。`availability_slots` へのINSERTは廃止し、`reservations.vehicle_id` をセットして既存トリガ `auto_create_occupied_slot` に占有作成を委譲。
  - マイグレーション: `supabase/migrations/20260702214409_create_phone_reservation_vehicle_required.sql`（適用済み、repoにも保存）。
  - フロント: `src/pages/business/Reservations.tsx` に車両セレクタ（アクティブ車両を`vehicles`から取得）を追加し必須化。車両0台なら送信ボタン無効化＋案内文。`phone_reservation_slot_conflict` / `phone_reservation_invalid_vehicle` エラーを個別メッセージで表示。
- **検証**: `npm.cmd run build` 成功。本番DB上でトランザクション内テスト（ロールバック、残留データなし）を実施し、(1) 車両込みで電話予約RPCが成功し `occupied_slots` が作成されること、(2) 同一車両・重複時間帯の2件目が `phone_reservation_slot_conflict` で正しく拒否されることを確認。ブラウザでの実ログインE2E確認は未実施（本番アカウントの認証情報を保有していないため）。次回、実アカウントでログインしてUI経由の電話予約→MSW検索での消込みを確認すること。

### [x] A2. 申請フォームで機材を変えると「車両なし予約」ができる — 対応済み 2026-07-02
- **事象**: MSWが検索時と違う機材をフォームで選ぶと、`availableVehicles` に該当車両がなく `vehicleId = null` のまま申請成立（`src/pages/msw/Search.tsx` handleSubmitRequest, 409-413行付近）。vehicle_id null なので占有されず、承認時の重複チェック（approve_reservation内、vehicle_id NOT NULL時のみ）もスキップ → ダブルブッキング。さらに車両なし確定はカレンダーのタイムラインに表示されない。
- **該当**: `src/pages/msw/Search.tsx`（フォームの使用機材セレクタ、handleSubmitRequest）
- **対応内容**: 修正方針(a)を採用。申請フォームの機材選択ボタンをクリック不可の表示専用に変更し、「検索条件から自動入力されています。変更する場合は条件を変えて再検索してください」+ 再検索リンク(setStep(1))を表示。加えて(b)側の防御も追加: `handleSubmitRequest` 内で `vehicleId` が null になった場合は送信前に中断し「選択した機材に対応する空き車両が見つかりませんでした」エラーを表示する多重ガードを実装。
- **検証**: `npm.cmd run build` 成功。プレビュー起動でコンソールエラーなし確認。**実ログインでのUI操作確認（検索=車椅子→フォームでストレッチャーに変更できないこと）は未実施** → 後でチェックリストに追加。

### [ ] A3. 期限切れ通知が「乗車時刻を過ぎてから」しか出ない
- **事象**: `send-reminder` の expireStalePending は end_time 経過後に失効させMSWへ通知。MSWは希望時刻まで宙ぶらりんで、知らせが来るのは手遅れになってから。事業者向けナッジ（3時間放置）はあるがMSW向け事前警告がない。
- **該当**: `supabase/functions/send-reminder/index.ts`
- **修正方針**: expire/nudgeに加え第4パス「乗車24時間前（同日申請は3時間前）時点で pending のままなら MSW に『まだ承認されていません。別事業所の検討をおすすめします』を dispatch」。フラグ列 `msw_unconfirmed_warning_sent boolean default false` を reservations に追加して重複防止。
- **検証**: cron実叩き（`curl -X POST .../functions/v1/send-reminder`）で `{reminded, expired, nudged, warned}` を確認。

### [ ] A4. 予約間の移動バッファがない
- **事象**: 10:00-11:00の直後に11:00-12:00が別現場で確定でき、回送時間が確保されない（クレーム由来: 現場が回らない）。
- **修正方針（案）**: businesses に `buffer_minutes int default 0` を追加し、MSW検索の重複判定とGiST用 `slot_tsrange` 生成側 or 検索クエリ側で前後バッファを加味。DB制約まで入れると電話予約と衝突しやすいので、まずは**検索側フィルタ＋承認時チェックのみ**に留めるのが現実的。プロフィール設定にUI追加。
- **備考**: 仕様判断が要るのでユーザー確認してから着手。

### [ ] A5. guard_reservation_columns の NULL すり抜け（設計負債）
- **事象**: status変更ガードは `current_setting('app.rpc_context', true)` がNULLだと `NOT IN` がNULL評価→例外にならず素通り。**complete_reservation・cancel_reservation_by_msw・send-reminderの失効処理・Calendarの直接update等がこの穴に依存して動いている**。
- **修正方針**: 全status変更をRPC経由に統一してからガードを `COALESCE(v_rpc_ctx,'') NOT IN (...)` に厳格化。依存箇所の洗い出しが必要な**大きめ案件**。単独で塞ぐと本番が壊れるため、必ず全経路（business Calendar cancel / send-reminder expire / complete / msw cancel）をRPC化 or rpc_context設定してから。
- **検証**: 各キャンセル・完了・失効フローの回帰テスト必須。

### [ ] A6. 事業者がpendingを「キャンセル」経路で消すとMSW無通知
- **事象**: 正規の「お断り」ボタンは send-rejection でMSWへ通知するが、`handleCancelReservation`（`src/pages/business/Calendar.tsx`）を pending に使った場合は通知なし（wasConfirmed=false のため）。
- **修正方針**: pending へのキャンセルはUI上「お断り」へ誘導（キャンセルボタンをconfirmed限定にする）か、pendingキャンセル時も reject 相当の通知を送る。

---

## 🟠 B. 通知の信頼性

### [ ] B1. 通知の送信記録・リトライがない（outbox未整備）
- **事象**: `notify` の送信失敗は console.error のみ。Resend/LINE障害中の通知は消失し、消えた証跡も残らない（「聞いてない」紛争時に反証不能）。
- **修正方針**: `notification_log` テーブル（id, user_id/recipient, channel, subject, status sent/failed, error, created_at）を作成し、notify が送信ごとに記録。失敗分を send-reminder cron の第5パスで再送（最大3回）。
- **該当**: `supabase/functions/notify/index.ts`

### [ ] B2. フロントからの通知呼び出しが fire-and-forget
- **事象**: `supabase.functions.invoke('send-*').catch(() => {})` がフロント各所にあり、タブ即閉じ・関数コールドスタート失敗で通知が飛ばない。
- **該当**: `src/pages/business/Calendar.tsx`(approve/reject/cancel), `src/pages/business/Reservations.tsx`, `src/pages/msw/Search.tsx`, `src/pages/msw/Reservations.tsx`, `src/pages/admin/Approvals.tsx`
- **修正方針（本命）**: 通知トリガをDB側へ移す。reservations の status遷移 AFTER UPDATE/INSERT トリガから `pg_net.http_post` で該当 send-* を叩く（cronで実績あり）。フロントの invoke は撤去。B1のoutboxと合わせると堅牢。
- **暫定**: invoke の失敗時に1回リトライ＋失敗トーストだけでも改善。

### [ ] B3. Resend 無料枠 100通/日
- **事象**: notification_recipients による複数スタッフ配信を使い始めると1イベント×N人で消費が加速。超過分は静かに失敗（B1未対応だと記録もない）。
- **修正方針**: 有料化（$20/月で5万通）をローンチ時に。B1のログで日次送信数を可視化。

### [ ] B4. DMARC が p=none
- **修正方針**: 運用が安定したら ConoHa DNS の `_dmarc.send` TXT を `v=DMARC1; p=quarantine; rua=mailto:chikara8841986@gmail.com` へ段階強化。

---

## 🟡 C. 課金・Stripe

### [ ] C1. stripe-webhook v20 の外部レビュー最終GO未取得
- **経緯**: Codexレビューを繰り返しTOCTOU等を修正（v20）したが、Codexの使用制限で最終GO判定が取れていない。
- **修正方針**: `/codex:rescue` で v20（現デプロイv22表記だがソースはv20系）を再レビュー依頼。指摘ゼロならクローズ。

### [ ] C2. STRIPE_BASE_PRICE_ID / STRIPE_PER_VEHICLE_PRICE_ID 未設定
- **事象**: チェックアウト・webhook・sync が毎回 ephemeral Product を生成（動作はする。ダッシュボード汚染と価格管理の分散）。
- **修正方針**: Stripeダッシュボードで正規 Product/Price（¥3,850月額・¥1,650月額）を作成し、Supabase secrets に2つのIDを設定。既存サブスクは sync-vehicle-billing が次回同期時に寄せる設計になっているか要確認。

### [ ] C3. past_due で即・検索非表示（猶予なし）
- **事象**: 初回決済失敗の瞬間に MSW 検索から消える（`src/pages/msw/Search.tsx` 332行付近: subStatus が active/trialing 以外を除外）。カード期限切れ1回で売上停止はクレーム必至。
- **修正方針**: `past_due` も検索に含め続け（Stripeの自動リトライ期間中）、`businesses.past_due_since timestamptz` を webhook で記録。past_due_since から14日超えたら除外。事業者向けバナー（Layout.tsx に既存）はそのまま。

### [ ] C4. 返金・日割り・解約タイミングのポリシー未定義
- **修正方針**: 規約ページ（利用規約/特商法表記）を作り、解約は期末まで有効・日割返金なし等を明文化。コードより先に文書。

### [ ] C5. 適格請求書（インボイス）未対応
- **修正方針**: Stripe の Customer Tax ID ＋ 請求書PDFに登録番号を載せる設定を調査。ローンチ後でも可。

### [ ] C6. webhook_processed_events / webhook_debug の掃除cronなし
- **修正方針**: pg_cron に `DELETE FROM webhook_processed_events WHERE processed_at < now()-interval '30 days'`（列名は要確認）と webhook_debug 7日を追加。

### [ ] C7. 本番切替チェックリスト
- live鍵切替（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET 再作成）、C2のprice ID、Billing Portal の日本語設定、振込口座・本人確認（設定済みかの最終確認）、テストデータ（テストハコビテ等）の掃除。

---

## 🟣 D. セキュリティ・個人情報（医療隣接データ）

### [ ] D1. 患者氏名・住所・行先をメール本文で外部送信
- **事象**: 全通知メールに患者フルネーム・乗車地住所・目的地が平文で入る（Resend=米国経由。将来LINEも）。要配慮個人情報に近い運用。
- **修正方針**: 通知本文を最小化（例:「患者: 佐藤様」「詳細はアプリでご確認ください＋リンク」）。特に将来のLINE通知は必ず最小化版で。全 send-* のテンプレ修正。
- **判断**: どこまで削るかはユーザー確認（利便性とのトレード）。

### [ ] D2. PWA の Service Worker が患者データをディスクにキャッシュ
- **事象**: `vite.config.ts` の runtimeCaching に `supabase.co` NetworkFirst(5分) があり、認証付きRESTレスポンス（患者名入り）が CacheStorage に平文保存される。SW の scope は `/` なので**本番アプリ全体**が対象。病院の共用PCで残存・ログアウトでも消えない。
- **修正方針**: `supabase.co` の runtimeCaching エントリを**削除**（NetworkOnlyへ）。デモのオフライン動作は静的アセットのprecacheだけで成立するので影響なし。加えてログアウト時に `caches.delete` を呼ぶと堅い。
- **該当**: `vite.config.ts`

### [ ] D3. 共用PCでのセッション永続
- **事象**: Supabase セッションが localStorage 永続、自動ログアウトなし。病院共用端末で放置ログインが起きうる。
- **修正方針（案）**: MSWロールのみ「共用PCモード」（sessionStorage保存 or 8時間で強制再ログイン）。supabase-js の `auth.storage` オプションで切替可能。仕様判断が要るためユーザー確認。

### [ ] D4. 監査ログなし
- **事象**: 誰がいつ承認/却下/キャンセルしたか記録がなく、紛争時に証跡がない。
- **修正方針**: `audit_log`（actor_id, action, reservation_id, detail jsonb, created_at）を各RPC内で1行INSERT。RPC集約（A5）とセットでやると効率的。

---

## 🔵 E. インフラ・運用

### [ ] E1. Supabase FREEプランのまま本番運用
- **事象**: ダッシュボードに FREE 表示（org: sakura-en-dev）。バックアップ7日・リソース制約・長期不活性時の停止リスク。
- **修正方針**: ローンチ前に Pro（$25/月）へ。ユーザーの決済作業。

### [x] E2. リポジトリとDBのドリフト（復旧不能リスク）— 対応済み 2026-07-02
- **事象**: (1) MCP `apply_migration` で当てたマイグレーション群（phone_digits, pending_reminder_sent＋approve修正, notification_channels, notification_recipients 等）が repo の `supabase/migrations/` に存在しない。(2) `admin-reject-business` のソースが repo に無い（デプロイ済みv4のみ。`mcp get_edge_function` で取得可能）。
- **対応内容**: `supabase_migrations.schema_migrations`（`statements`列）から本番DBに適用済みの全16マイグレーション＋A1対応時の1件（計17件）を復元し、`supabase/migrations/` にDB上のバージョン番号をファイル名として書き出し。`admin-reject-business/index.ts` を `get_edge_function` で取得し `supabase/functions/admin-reject-business/index.ts` として保存。あわせて、A1修正時に誤って実際のDBバージョン(`20260702124356`)と異なるファイル名(`20260702214409`)で保存していたのを修正（リネーム）。
- **今後の運用**: 以後「`apply_migration`／`deploy_edge_function` でデプロイしたら必ずrepoにも同じ内容を書く」を徹底する。

### [ ] E3. デプロイ直後の ChunkLoadError 対策なし
- **事象**: lazy import のチャンクハッシュがデプロイで変わり、滞在中ユーザーの画面遷移が白画面/読込失敗になりうる（PWAのautoUpdateは緩和するが保証なし）。
- **修正方針**: `src/App.tsx` の lazy を「import失敗時に一度だけ location.reload() する」ラッパー（lazyWithRetry）に置換。約20行。

### [ ] E4. バス係数1
- **事象**: 管理者アカウント・開発環境・Vercel/Supabase/Stripe/Resend/ConoHa の認証情報が単一人・単一PC。
- **修正方針（運用）**: 認証情報の一覧化と保管（パスワードマネージャ）、Supabase organizationへの予備メンバー追加、このリポジトリのremote(GitHub)が生きていることの定期確認。

---

## ⚪ F. UX・クレーム由来（既出「クレーム20選」の未対応要点）

### [ ] F1. 承認待ち事業者のログイン時表示が未検証
- **確認方法**: 未承認 business アカウントでログインし、/business/calendar で「承認待ちです」等の明示があるか確認。なければ Layout か Calendar に承認待ちバナーを追加。

### [ ] F2. 料金のオンボーディング説明不足
- 車両追加で自動増額（3台目〜¥1,650/台）と初月の二段請求（初期費用→翌月から月額）を、チェックアウト前画面と車両追加時の確認ダイアログで明示。

### [ ] F3. LINE通知（着手予定・土台完成済み）
- 残作業: LINE公式アカウント作成（ユーザー作業）→ `LINE_CHANNEL_ACCESS_TOKEN` secret設定 → 友だち連携フロー（連携コード発行UI＋LINE Webhook Edge Function で `profiles.line_user_id` 保存）→ 通知設定画面（自分のLINE連携＋notification_recipients のスタッフ管理UI）。
- 注意: LINE本文はD1の最小化方針に従うこと。

### [ ] F4. 深夜跨ぎ予約（23:00→翌1:00）非対応
- 現状 start<end バリデーションで弾かれる。需要確認してから（対応するなら日付跨ぎ分割で登録）。

---

## ✅ 検証して「問題なし」を確認済み（誤警報の除去記録）

| 項目 | 結果 |
|---|---|
| MSWキャンセルのRLS | `cancel_reservation_by_msw` RPC 経由で正常（直接UPDATEではない） |
| billing_events の unique index | `billing_events_stripe_invoice_id_key` 等あり。invoice.paid の upsert は動く |
| auto-confirm-email / debug-from-email | 削除済み（Edge Functions一覧に不存在を確認） |
| RLS | 全13テーブルで有効。webhook_debug/webhook_processed_events はポリシー0＝クライアント完全遮断（安全） |
| notify の内部ガード | SERVICE_ROLE_KEY 以外は403（実叩き確認） |
| send-reminder cron | 毎時0分 pg_cron 稼働、実叩きで {reminded,expired,nudged} 正常 |

## ✅ 対応済み（2026-05-18〜07-02 のセッションで実装・デプロイ済み）

- 確定予約の事業者キャンセル→病院への通知（send-business-cancellation）
- リマインダーのタイムゾーンバグ（UTC→JST判定）
- 放置pending: 乗車時刻超過で自動失効＋MSW通知、3時間放置で事業者ナッジ（pending_reminder_sent列）
- 二重承認レース: approve_reservation に同一車両・同時間帯の確定重複チェック（reservation_conflict）※vehicle_id ありの場合のみ→null経路はA1/A2
- 電話番号の重複登録防止（businesses.phone_digits 生成列＋部分unique）
- メール確認フロー正常化（Resend SMTP、auto-confirm-email撤去）
- 通知ディスパッチ層 notify＋組織スタッフ配信土台（notification_recipients、宛先0件なので挙動不変）
- 全send-*のCORS＋差出人「せとむすび」統一
- デモ全面刷新（3ロール・占有時間方式・PWAオフライン対応）

---

## 推奨着手順

1. **A1 → A2**（ダブルブッキング穴の封鎖。コードのみで完結）
2. **E2**（migrations/関数ソースのrepo同期。事故る前に）→ **E1**（Pro化はユーザー決済）
3. **D2**（vite.config.ts のsupabaseキャッシュ除外。1行削除級）→ **E3**（lazyWithRetry）
4. **B1 → B2**（notification_log＋DBトリガ通知化）
5. **C3**（past_due猶予）→ **C1**（Codex再レビュー）
6. **F3**（LINE。ユーザー同席が必要な作業を含む）
- A4 / A5 / D1 / D3 は仕様判断が要るため、着手前にユーザー確認すること。

# せとむすび リスク台帳

- 作成: 2026-07-02（Opus 4.8 による全数調査。コード実読・DB実クエリ・Edge Function実叩きで検証済み）
- 用途: 別セッション（Sonnet等）が **1項目ずつ潰していく** ためのバックログ。着手時に `[ ]`→`[x]` に更新し、対応コミットハッシュを追記すること。
- 運用ルール: 修正前に必ず該当ファイルを Read し、この台帳の「修正方針」は参考として現状コードを正とする。DB変更は `apply_migration`（MCP: supabase, project_id `lcuoeekhnmbhomcdbedi`）。Edge Function は MCP `deploy_edge_function` でデプロイし、**ソースを必ず repo にも保存**する。

## 🧪 人間による最終チェック待ち一覧（まとめて後で確認用）

Claudeが自動修正・DB検証まで済ませたが、実ログインでのブラウザ操作までは確認できていない項目。実装が一通り終わったタイミングでまとめて確認してください。

- [ ] **A1**: 業者アカウントでログイン→「電話予約を記録」で車両を選んで登録→MSW検索でその車両のその時間帯が候補から消えることを確認。
- [ ] **A2**: MSWアカウントでログイン→車椅子で検索→事業所選択後の申請フォームで機材ボタンが押せない（表示専用）ことを確認。「条件を変えて再検索」リンクが検索画面(step1)に正しく戻ることを確認。
- [ ] **D2**: 実ブラウザ（特にPWAとしてインストールした状態）でログイン→予約データ閲覧→DevTools Application→Cache Storageに `supabase-api` が無いことを確認。ログアウト後にCache Storageが空になることも確認。
- [ ] **E3**: 本番デプロイ直後にブラウザを開きっぱなしの状態で画面遷移し、白画面にならず自動で復帰することを確認（例: デプロイ前後でタブを開いたまま別ページに遷移してみる）。
- [ ] **B1/B2**: 実際に予約の承認・お断り・キャンセル・電話予約・MSW申請を一通り操作し、通知メールが届くこと、`notification_log`テーブルに記録が残ることを確認。可能であれば一時的にResend APIキーを無効化するなどして送信失敗させ、フロントに失敗トーストが出ること／`send-reminder`の次回cronでリトライされ`notification_log.status`が`sent`に変わることを確認。
- [ ] **C3**: Stripeテストモードで決済失敗を再現（テストカード4000000000000341等）→ businesses.subscription_status='past_due'・past_due_since が記録されることを確認 → MSW検索にその事業所が引き続き表示されることを確認。あわせて stripe-webhook v23 の差分について、C1のCodex再レビュー時に一緒に見てもらうこと。
- [ ] **A3**: pendingの reservation_date/start_time を意図的に24時間以内・当日は3時間以内に設定したテストデータで send-reminder を実叩きし、`warned` が1以上になりMSWへ警告メールが届くこと、`msw_unconfirmed_warning_sent` がtrueになり再送されないことを確認。
- [ ] **A6**: 業者アカウントで確定済み予約を「予約詳細」パネルの「予約をキャンセル」ボタン（カレンダーのタイムラインからではなく、一覧パネル経由）でキャンセルし、MSW側にキャンセル通知メールが届くことを確認。

- [ ] **D4**: 実際にDBの`audit_log`テーブルを管理者権限で閲覧し、承認/却下/完了/キャンセル操作それぞれで正しい`action`・`actor_id`が記録されることを一通り確認。
- [ ] **F2**: 業者アカウントでログイン→「プロフィール」で車両を3台目まで追加→追加ボタンの下に料金加算の注意書きが出ることを目視確認。
- [ ] **A4**: 業者アカウントでログイン→「プロフィール」で移動バッファを30分などに設定→保存→MSW検索で、その事業所の車両が「バッファ分の余裕がない時間帯」の検索から正しく除外されることを目視確認。
- [ ] **D3**: MSWアカウントでログイン→DevTools ApplicationでlocalStorageに`setomusubi-auth-token`が無く`sessionStorage`にあることを確認→ブラウザを完全に閉じて再度開き、ログインし直しが必要になることを確認。business/adminアカウントは今まで通り閉じても再ログイン不要なことも確認。
- [ ] **D1**: 実際に予約の確定・電話予約・キャンセル等を行い、届いたメール本文に患者氏名だけが残り、乗車地住所・目的地が入っていない（「アプリでご確認ください」の案内文になっている）ことを目視確認。

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

### [x] A3. 期限切れ通知が「乗車時刻を過ぎてから」しか出ない — 対応済み 2026-07-02
- **事象**: `send-reminder` の expireStalePending は end_time 経過後に失効させMSWへ通知。MSWは希望時刻まで宙ぶらりんで、知らせが来るのは手遅れになってから。事業者向けナッジ（3時間放置）はあるがMSW向け事前警告がない。
- **該当**: `supabase/functions/send-reminder/index.ts`
- **対応内容**: `reservations.msw_unconfirmed_warning_sent boolean default false` を追加。send-reminder（v17）に第4パス `warnMswUnconfirmed` を追加し、乗車24時間前（申請日=乗車日の当日申請は3時間前）時点でまだpendingならMSWへ「まだ承認されていません。別の事業所もご検討ください」を1回だけ通知するようにした。乗車時刻を過ぎたものはexpireStalePendingに任せて二重通知しない。
- **検証**: `curl -X POST .../functions/v1/send-reminder` 実叩きで `{"reminded":0,"expired":0,"nudged":0,"warned":0,"retried":0,"retrySucceeded":0}` を確認（対象データなしのため0件だが新フィールドが正しく返ることを確認）。実際に閾値に達したpendingでの警告送信・重複防止は未実施 → 人間チェックリストに追加。

### [x] A4. 予約間の移動バッファがない — 対応済み 2026-07-03
- **事象**: 10:00-11:00の直後に11:00-12:00が別現場で確定でき、回送時間が確保されない（クレーム由来: 現場が回らない）。
- **ユーザー判断**: 事業所ごとに分単位で設定できるようにし、設定を促す導線もつける方針（プロフィール画面での設定＋未設定時のナッジ表示）を確認済み。
- **対応内容**: `businesses.buffer_minutes int default 0 check (0〜120)` を追加。DB制約（GiST排他）には反映せず、**検索側フィルタ＋承認時チェックのみ**に留めた（方針どおり、電話予約との衝突を避けるため）。
  - `src/pages/business/Profile.tsx`: 「回送の余裕時間（移動バッファ）」欄を追加。0分のままだと「⚠️ 現在0分（余裕なし）」というナッジを表示。
  - `src/pages/msw/Search.tsx`: 空き車両判定を「厳密な重複」から「事業所のbuffer_minutes分の余裕を含めた重複」に変更。料金定数と同様に`src/lib/constants.ts`は使わず、Search.tsx内にヘルパー関数（`overlapsWithBuffer`等）を追加。
  - `approve_reservation` RPC: 二重承認ガードの重複判定にも同じバッファを適用（`make_interval(mins => buffer_minutes)`で前後を広げる）。
- **検証**: `npm.cmd run build` 成功。本番DBで実データを使い検証（テスト後に削除済み）：(1) buffer_minutes=30の事業所で09:00-10:00確定済み・10:00-11:00申請中の組み合わせに対しapprove_reservationを実行→`reservation_conflict`で正しく拒否されることを確認。(2) buffer_minutes=0（デフォルト）に戻すと同じ組み合わせが従来どおり承認できることを確認（既存事業所への影響なしを確認）。実ログインでのProfile.tsx UIの見た目・Search.tsxの検索結果からの除外は未確認 → 人間チェックリストに追加。

### [ ] A5. guard_reservation_columns の NULL すり抜け（設計負債）
- **事象**: status変更ガードは `current_setting('app.rpc_context', true)` がNULLだと `NOT IN` がNULL評価→例外にならず素通り。**complete_reservation・cancel_reservation_by_msw・send-reminderの失効処理・Calendarの直接update等がこの穴に依存して動いている**。
- **修正方針**: 全status変更をRPC経由に統一してからガードを `COALESCE(v_rpc_ctx,'') NOT IN (...)` に厳格化。依存箇所の洗い出しが必要な**大きめ案件**。単独で塞ぐと本番が壊れるため、必ず全経路（business Calendar cancel / send-reminder expire / complete / msw cancel）をRPC化 or rpc_context設定してから。
- **検証**: 各キャンセル・完了・失効フローの回帰テスト必須。

### [x] A6. 事業者がpendingを「キャンセル」経路で消すとMSW無通知 — 対応済み 2026-07-02
- **事象**: 正規の「お断り」ボタンは send-rejection でMSWへ通知するが、`handleCancelReservation`（`src/pages/business/Calendar.tsx`）を pending に使った場合は通知なし（wasConfirmed=false のため）。
- **実際の内容**: 調査の結果、`予約詳細` パネル（1441行目、`selectedPendingRes.status === 'confirmed'` でガード済み）の「予約をキャンセル」ボタンが `handleCancelReservation(selectedPendingRes.id)` を `wasConfirmed` 引数なし（=false扱い）で呼んでいたのが実バグ。呼び出し時点で対象は必ず確定済み予約なのに通知がスキップされていた。カレンダー側の同等ボタン（1303行目）は元々 `wasConfirmed=true` を渡していて正常。
- **対応内容**: 1449行目の呼び出しを `handleCancelReservation(selectedPendingRes.id, undefined, true)` に修正し、確定済み予約キャンセル時は必ずMSWへ`send-business-cancellation`通知が飛ぶようにした。
- **検証**: `npm.cmd run build` 成功。プレビューでコンソールエラーなし確認。実ログインでキャンセル操作→MSWへの通知メール到達確認は未実施 → 人間チェックリストに追加。

---

## 🟠 B. 通知の信頼性

### [x] B1. 通知の送信記録・リトライがない（outbox未整備）— 対応済み 2026-07-02
- **事象**: `notify` の送信失敗は console.error のみ。Resend/LINE障害中の通知は消失し、消えた証跡も残らない（「聞いてない」紛争時に反証不能）。
- **該当**: `supabase/functions/notify/index.ts`、`supabase/functions/send-reminder/index.ts`
- **対応内容**: `notification_log` テーブル（user_id, business_id, hospital_id, channel, recipient, subject, message, status sent/failed, error, retry_count, created_at/updated_at）を新設（RLS有効・ポリシー0でservice_role専用、webhook_debug等と同方式）。`notify` は送信の都度このテーブルに記録するよう改修（v3としてデプロイ）。`notify` に `{ retry: true }` で呼べる再送パスを追加（直近24時間・retry_count<3の失敗分を再送）。`send-reminder`（v16）に第4パスとして `retryFailedNotifications()` を追加し、毎時cronで自動的に失敗分を再送する。
- **検証**: `curl -X POST .../functions/v1/send-reminder` を実叩きし `{"reminded":0,"expired":0,"nudged":0,"retried":0,"retrySucceeded":0}` を確認（対象データなしのため0件だが新フィールドが正しく返ることを確認）。Edge Functionログで send-reminder→notify の内部呼び出しが200 OKであることを確認。実際に送信失敗を発生させてのリトライ動作（例: Resend APIキーを一時的に無効化して確認）は未実施 → 人間チェックリストに追加。

### [x] B2. フロントからの通知呼び出しが fire-and-forget — 暫定対応済み 2026-07-02
- **事象**: `supabase.functions.invoke('send-*').catch(() => {})` がフロント各所にあり、タブ即閉じ・関数コールドスタート失敗で通知が飛ばない。
- **該当**: `src/pages/business/Calendar.tsx`(approve/reject/cancel), `src/pages/business/Reservations.tsx`, `src/pages/msw/Search.tsx`, `src/pages/msw/Reservations.tsx`, `src/pages/admin/Approvals.tsx`
- **対応内容（暫定案を採用）**: `src/pages/admin/Approvals.tsx` は元々 await＋失敗トースト済みで対応不要。他5箇所の fire-and-forget invoke を `src/lib/notifyInvoke.ts` の `invokeNotifyWithRetry`（1回だけ自動リトライ→それでも失敗ならcaller側でトースト表示）に置換。DB更新自体は既に成功している前提で「通知だけ失敗した」ことを利用者に伝える文言にした。
- **本命は未着手**: `reservations` の status遷移トリガから `pg_net.http_post` で通知するDB側集約への全面移行は、承認/却下/完了/キャンセル/電話予約の全RPCに関わる大きめのアーキテクチャ変更でリスクが高いため、今回は着手しなかった。B1のoutbox(notification_log)と組み合わせれば本命への移行余地は残っている。着手する場合は必ずユーザー確認のうえ、全経路の回帰テストとセットで行うこと。
- **検証**: `npm.cmd run build` 成功。プレビューでコンソールエラーなし確認。実ログインでの通知失敗シナリオ（Edge Function呼び出し自体を強制的に失敗させてトーストが出るか）は未実施 → 人間チェックリストに追加。

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

### [x] C3. past_due で即・検索非表示（猶予なし）— 対応済み 2026-07-02
- **事象**: 初回決済失敗の瞬間に MSW 検索から消える（`src/pages/msw/Search.tsx` 332行付近: subStatus が active/trialing 以外を除外）。カード期限切れ1回で売上停止はクレーム必至。
- **該当**: `src/pages/msw/Search.tsx`、`supabase/functions/stripe-webhook/index.ts`、`src/types/database.ts`
- **対応内容**: `businesses.past_due_since timestamptz` を追加。`stripe-webhook`（v23）で past_due に入った最初の時刻のみ記録し（COALESCE相当、重複failedイベントで上書きしない）、active/trialing等に復旧または解約されたら null にリセットするようにした（`customer.subscription.updated`／`invoice.payment_failed`／`customer.subscription.deleted`の3箇所）。フロント `Search.tsx` は `subscription_status==='past_due'` かつ `past_due_since` から14日以内なら検索結果に含め続けるよう変更。事業者向けバナー（Layout.tsx）は既存のまま変更なし。
- **検証**: `npm.cmd run build` 成功。プレビューでコンソールエラーなし確認。stripe-webhook は既存の厳格なTOCTOU対策（atomic claim/tombstone guard）に触れず、past_due_since管理は既存ガード確定後の追加書き込みとして実装したことをコードレビューで確認。実際にStripeでカード決済を失敗させて14日猶予・検索復帰を確認する統合テストは未実施 → 人間チェックリストに追加。C1（stripe-webhookの外部レビュー最終GO）は今回の変更を含めて改めて必要。

### [ ] C4. 返金・日割り・解約タイミングのポリシー未定義
- **修正方針**: 規約ページ（利用規約/特商法表記）を作り、解約は期末まで有効・日割返金なし等を明文化。コードより先に文書。

### [ ] C5. 適格請求書（インボイス）未対応
- **修正方針**: Stripe の Customer Tax ID ＋ 請求書PDFに登録番号を載せる設定を調査。ローンチ後でも可。

### [x] C6. webhook_processed_events / webhook_debug の掃除cronなし — 対応済み 2026-07-02
- **対応内容**: pg_cron `cleanup-webhook-tables-daily`（毎日JST 3:30）を追加。`webhook_processed_events` は `processed_at` 30日超、`webhook_debug` は `created_at` 7日超で削除。
- **検証**: `cron.job` に登録されたことを確認。実際に30日/7日待って自動削除されることの確認は未実施（時間経過が必要なため）。

### [ ] C7. 本番切替チェックリスト
- live鍵切替（STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET 再作成）、C2のprice ID、Billing Portal の日本語設定、振込口座・本人確認（設定済みかの最終確認）、テストデータ（テストハコビテ等）の掃除。

---

## 🟣 D. セキュリティ・個人情報（医療隣接データ）

### [x] D1. 患者氏名・住所・行先をメール本文で外部送信 — 対応済み 2026-07-03
- **事象**: 全通知メールに患者フルネーム・乗車地住所・目的地が平文で入る（Resend=米国経由。将来LINEも）。要配慮個人情報に近い運用。
- **ユーザー判断**: 折衷案（患者氏名は残し、住所・目的地は削る）を採用。
- **対応内容**: `send-confirmation`(v15)・`send-request-received`(v15)・`send-cancellation`(v10)・`send-business-cancellation`(v3)・`send-reminder`(v18、1時間前リマインドのテンプレ)から`patient_address`・`destination`の行を削除し、「乗車地・目的地・備考などの詳細はアプリでご確認ください」という案内文に置き換えた。`send-reminder`のDBクエリからも不要になった`patient_address`/`destination`の取得自体を削除（データ最小化を取得段階でも徹底）。`send-rejection`はもともとこれらを含んでいなかったため変更不要。将来のLINE通知（F3）もこの最小化版テンプレを流用する想定。
- **検証**: 5つのEdge Functionを全てデプロイ済み。`curl`でsend-reminderを実叩きし、新フィールドを含む正常なJSONが返ることを確認。`grep`で`supabase/functions/`配下に`patient_address`/`destination`の参照が残っていないことを確認。実際にメールを受信して本文を目視確認することは未実施（Resendのメール到達確認はテスト予約を作る必要があるため）→ 人間チェックリストに追加。

### [x] D2. PWA の Service Worker が患者データをディスクにキャッシュ — 対応済み 2026-07-02
- **事象**: `vite.config.ts` の runtimeCaching に `supabase.co` NetworkFirst(5分) があり、認証付きRESTレスポンス（患者名入り）が CacheStorage に平文保存される。SW の scope は `/` なので**本番アプリ全体**が対象。病院の共用PCで残存・ログアウトでも消えない。
- **該当**: `vite.config.ts`、`src/contexts/AuthContext.tsx`
- **対応内容**: `vite.config.ts` の `supabase.co` runtimeCaching エントリを削除（NetworkOnly相当）。ビルド後の `dist/sw.js` から `supabase-api` キャッシュ名が消えたことを確認。あわせて `AuthContext.tsx` の `signOut()` に `caches.delete` を追加し、ログアウト時に既存のCacheStorageも掃除するようにした（共用PC対策の追加防御）。
- **検証**: `npm.cmd run build` 成功、`dist/sw.js` に `supabase-api` 文字列が含まれないことを確認。precacheエントリ数(56件)は変化なし＝静的アセットのオフライン動作に影響なし。実ブラウザでのオフライン動作確認は未実施 → 人間チェックリストに追加。

### [x] D3. 共用PCでのセッション永続 — 対応済み 2026-07-03
- **事象**: Supabase セッションが localStorage 永続、自動ログアウトなし。病院共用端末で放置ログインが起きうる。
- **ユーザー判断**: MSWロールだけ自動ログアウトを導入する方針を確認済み。
- **対応内容**: `supabase-js` の `auth.storage` をカスタムアダプタ（`src/lib/authStorage.ts`）に差し替え。ロールが`msw`と判明した時点（`AuthContext.tsx`の`loadUserMeta`）で、セッションを`localStorage`から`sessionStorage`へ移し、以後の書き込みも`sessionStorage`限定にする（`switchAuthToSessionOnly`）。これによりMSWはブラウザ/タブを閉じるとログイン情報が消える。business/adminロールは従来どおり`localStorage`永続のまま（`resetAuthStorageMode`で明示的に通常モードに戻す）。ログアウト時にもモードをリセット。
- **検証**: `npm.cmd run build` 成功。プレビューでコンソールエラーなし、ログイン画面が正常表示されること、初期状態で`localStorage`/`sessionStorage`に余計なキーが残っていないことを確認。実際にMSWアカウントでログイン→ブラウザを閉じて再度開いた際に再ログインが必要になることの実機確認は未実施（テスト用MSWアカウントの認証情報を保有していないため）→ 人間チェックリストに追加。

### [x] D4. 監査ログなし — 対応済み 2026-07-03
- **事象**: 誰がいつ承認/却下/キャンセルしたか記録がなく、紛争時に証跡がない。
- **対応内容**: `audit_log`（actor_id, action, reservation_id, detail jsonb, created_at）を追加。RLS有効・SELECTは管理者(`is_admin()`)のみ。書き込み専用ヘルパー`log_audit()`（SECURITY DEFINER、actor_idはauth.uid()から自動取得しなりすまし不可）を新設し、`approve_reservation`・`reject_reservation`・`complete_reservation`・`cancel_reservation_by_msw`の4RPC末尾に1行ずつ追加した。A5（RPC集約）は仕様判断待ちのため未着手だが、既存RPCへの追記だけで独立して対応可能だったため先行実施。
- **検証**: 実際にハコビテ事業所の予約を作成→`approve_reservation`を実行→`audit_log`に`action='approve_reservation'`の行が正しい`actor_id`・`reservation_id`・`detail`で記録されることを確認。確認後、テストデータ（予約・occupied_slot・audit_logの各行）は削除済み。閲覧用の管理画面UIはまだ無い（DBに記録が残るのみ）。

---

## 🔵 E. インフラ・運用

### [ ] E1. Supabase FREEプランのまま本番運用
- **事象**: ダッシュボードに FREE 表示（org: sakura-en-dev）。バックアップ7日・リソース制約・長期不活性時の停止リスク。
- **修正方針**: ローンチ前に Pro（$25/月）へ。ユーザーの決済作業。

### [x] E2. リポジトリとDBのドリフト（復旧不能リスク）— 対応済み 2026-07-02
- **事象**: (1) MCP `apply_migration` で当てたマイグレーション群（phone_digits, pending_reminder_sent＋approve修正, notification_channels, notification_recipients 等）が repo の `supabase/migrations/` に存在しない。(2) `admin-reject-business` のソースが repo に無い（デプロイ済みv4のみ。`mcp get_edge_function` で取得可能）。
- **対応内容**: `supabase_migrations.schema_migrations`（`statements`列）から本番DBに適用済みの全16マイグレーション＋A1対応時の1件（計17件）を復元し、`supabase/migrations/` にDB上のバージョン番号をファイル名として書き出し。`admin-reject-business/index.ts` を `get_edge_function` で取得し `supabase/functions/admin-reject-business/index.ts` として保存。あわせて、A1修正時に誤って実際のDBバージョン(`20260702124356`)と異なるファイル名(`20260702214409`)で保存していたのを修正（リネーム）。
- **今後の運用**: 以後「`apply_migration`／`deploy_edge_function` でデプロイしたら必ずrepoにも同じ内容を書く」を徹底する。

### [x] E3. デプロイ直後の ChunkLoadError 対策なし — 対応済み 2026-07-02
- **事象**: lazy import のチャンクハッシュがデプロイで変わり、滞在中ユーザーの画面遷移が白画面/読込失敗になりうる（PWAのautoUpdateは緩和するが保証なし）。
- **対応内容**: `src/App.tsx` に `lazyWithRetry` ヘルパーを追加し、全31箇所の `lazy(() => import(...))` を置換。import失敗時は `sessionStorage` のフラグで1回だけ `location.reload()` し、再読込後も失敗する場合はそのままエラーを投げる（無限リロード防止）。
- **検証**: `npm.cmd run build` 成功。プレビューでログインページ・`/manual`（別チャンク）とも正常表示、コンソールエラーなしを確認。実際のデプロイ切替中の動作（意図的に古いチャンクを404にしての確認）は未実施 → 人間チェックリストに追加。

### [ ] E4. バス係数1
- **事象**: 管理者アカウント・開発環境・Vercel/Supabase/Stripe/Resend/ConoHa の認証情報が単一人・単一PC。
- **修正方針（運用）**: 認証情報の一覧化と保管（パスワードマネージャ）、Supabase organizationへの予備メンバー追加、このリポジトリのremote(GitHub)が生きていることの定期確認。

---

## ⚪ F. UX・クレーム由来（既出「クレーム20選」の未対応要点）

### [x] F1. 承認待ち事業者のログイン時表示 — コードレビューで確認済み 2026-07-02
- **確認結果**: `src/components/ProtectedRoute.tsx` の `PendingApproval` コンポーネントが既に実装済み。未承認(`businessApproved=false`)のbusinessロールは `/business/calendar` 等どのページへ行っても「⏳ 承認待ちです」画面に置き換えられ、管理者が承認すると Supabase Realtime（`businesses`テーブルのUPDATE購読）で自動的に `window.location.reload()` して切り替わる。追加改修は不要と判断。
- **未実施**: 実際に未承認アカウントでログインしての目視確認（本番に未承認テストアカウントを作る必要があるため）→ 人間チェックリストに追加。

### [x] F2. 料金のオンボーディング説明不足 — 対応済み 2026-07-03
- **調査結果**: チェックアウト前画面（`src/pages/business/Billing.tsx`）は既に料金内訳・初回請求（当月半額/1か月分）の説明が実装済みだった。不足していたのは車両追加画面（`src/pages/business/Profile.tsx`）側で、車両を追加しても料金への影響が一切表示されないままStripeに自動反映（`sync-vehicle-billing`）されていた。
- **対応内容**: 料金定数（`DEFAULT_BASE_FEE`/`DEFAULT_PER_VEHICLE_FEE`/`FREE_VEHICLES`）を`Billing.tsx`のプライベート定数から`src/lib/constants.ts`に切り出して共有化。`Profile.tsx`の車両追加フォームに、稼働車両が2台（無料枠）以上のときだけ「この車両を追加すると3台目以降として月額¥1,650/台が加算されます（翌月分から請求）」という注意書きと「料金・契約」ページへのリンクを表示するようにした。フルの確認ダイアログ（クリックを一段階増やす）ではなく、通常操作を妨げないインライン警告を採用（無料枠内の1〜2台目追加時は注意書き自体を表示せず、操作感を変えない）。
- **検証**: `npm.cmd run build` 成功。プレビューでコンソールエラーなし確認。実ログインで実際に3台目を追加した際の表示・文言の見た目チェックは未実施 → 人間チェックリストに追加。

### [ ] F3. LINE通知（着手予定・土台完成済み）
- 残作業: LINE公式アカウント作成（ユーザー作業）→ `LINE_CHANNEL_ACCESS_TOKEN` secret設定 → 友だち連携フロー（連携コード発行UI＋LINE Webhook Edge Function で `profiles.line_user_id` 保存）→ 通知設定画面（自分のLINE連携＋notification_recipients のスタッフ管理UI）。
- 注意: LINE本文はD1の最小化方針に従うこと。

### [ ] F4. 深夜跨ぎ予約（23:00→翌1:00）非対応 — 対応しない方針で確定 2026-07-03
- 現状 start<end バリデーションで弾かれる。
- **ユーザー判断**: 対応しないことを確定。現状維持（実装不要）。需要が顕在化したら再度取り上げる。

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

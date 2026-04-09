# せとむすび

介護タクシー事業所と医療ソーシャルワーカー（MSW）をつなぐ予約プラットフォーム。

香川県内の介護タクシー手配を、Web から仮予約申請・電話確認の両方で行えます。

---

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイル**: Tailwind CSS v3
- **バックエンド**: Supabase（Auth / PostgreSQL / Realtime / Edge Functions）
- **デプロイ**: Vercel

---

## 予約フロー

```
MSW                              事業所
 │                                │
 │── 空き検索（日時・エリア）         │
 │── 事業所一覧から選択               │
 │   ┌─ 電話する（tel:リンク）       │
 │   └─ 仮予約申請（フォーム送信）──→ │ 申請通知メール受信
 │                                │── 内容確認（予約管理ページ）
 │                                │   ┌─ 承認 → 確定メール送信
 │                                │   └─ 却下 → 却下メール送信
 │← 確定/却下の結果を予約履歴で確認    │
```

スロットのロックは事業所が承認した時点で行われます。
MSWは複数事業所に同時申請はできませんが、申請をキャンセルして再申請できます。

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成
2. **SQL Editor** を開き、`supabase/schema.sql` の内容を全てコピー＆ペーストして実行
3. プロジェクトの **Settings > API** から以下をコピー:
   - `Project URL`
   - `anon public` キー

> **既存DBへの移行**: `schema.sql` 末尾のコメントアウトされたマイグレーションスクリプトを実行してください。

### 2. 環境変数の設定

`.env.local` ファイルを作成:

```bash
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJxxxxxxx
```

### 3. 管理者アカウントの作成

1. Supabase Dashboard > **Authentication > Users** > **Invite user** で管理者メールを招待
2. 招待メールからパスワード設定後、ユーザーIDを確認
3. SQL Editor で実行:

```sql
INSERT INTO profiles (id, role) VALUES ('<管理者のユーザーID>', 'admin');
```

### 4. ローカル開発

```bash
npm install
npm run dev
```

### 5. Vercel へデプロイ

1. [vercel.com/new](https://vercel.com/new) で GitHub リポジトリ `setomusubi` をインポート
2. **Environment Variables** に以下を追加:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy ボタンをクリック

> ⚠️ Vercel CLI は日本語を含むホスト名環境でエラーになる場合があります。その場合は Web UI からデプロイしてください。

---

## Edge Functions（メール通知）

全 Edge Function は [Resend](https://resend.com) を使用します。
Supabase Dashboard > **Edge Functions > [関数名] > Secrets** に共通で追加:

```
RESEND_API_KEY=re_xxxxxxxx
APP_URL=https://setomusubi.vercel.app
```

### send-request-received（仮予約申請通知）

MSW が仮予約を申請したときに **事業所** へ通知。申請受信後に自動呼び出し。

### send-confirmation（予約確定メール）

事業所が申請を **承認** したときに事業所・MSW 双方へ送信。自動呼び出し。

### send-rejection（却下通知メール）

事業所が申請を **却下** したときに **MSW** へ通知。自動呼び出し。

### send-reminder（1時間前リマインド）

Supabase Dashboard > Edge Functions > `send-reminder` > **Cron Schedule**:
```
0 * * * *
```
（毎時0分に実行、確定予約の開始50〜70分前に送信）

---

## ユーザー種別

| 種別 | 登録方法 | 利用開始条件 |
|------|----------|-------------|
| **事業所** | `/register/business` から登録申請 | 管理者の承認後 |
| **MSW（病院）** | `/register/msw` から登録 | 即時利用可 |
| **管理者** | Supabase Auth で直接作成 | 手動で profiles テーブルに追加 |

---

## 対応エリア（香川県）

善通寺市・丸亀市・坂出市・宇多津町・多度津町・琴平町・まんのう町・綾川町

---

## ページ一覧

### 事業所
| パス | 内容 |
|------|------|
| `/business/calendar` | 稼働カレンダー（週次設定・申請中表示含む） |
| `/business/reservations` | 予約管理（申請中/確定済み/過去・承認/却下） |
| `/business/profile` | プロフィール編集 |

### MSW
| パス | 内容 |
|------|------|
| `/msw/search` | 空き検索 → 仮予約申請（または電話） |
| `/msw/reservations` | 予約履歴（申請中/確定/却下の状態表示） |
| `/msw/contacts` | 担当者管理（追加・編集・削除） |
| `/msw/profile` | 病院情報編集 |

### 管理者
| パス | 内容 |
|------|------|
| `/admin/approvals` | 事業所承認管理 |
| `/admin/reservations` | 全予約一覧（月・ステータスフィルター） |
| `/admin/stats` | 統計ダッシュボード |

---

## フェーズ構成

- **フェーズ1（実装済み）**: MVP - 仮予約申請・承認フロー・カレンダー管理・メール通知
- **フェーズ2（予定）**: お気に入り事業所・評価機能・CSV エクスポート・Cron 自動リマインド
- **フェーズ3（予定）**: 地図表示・繰り返し予約・事業所間チャット

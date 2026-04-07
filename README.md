# せとむすび

介護タクシー事業所と医療ソーシャルワーカー（MSW）をつなぐ即時予約プラットフォーム。

香川県内の介護タクシー手配を、電話なしでWebからリアルタイムに確定できます。

---

## 技術スタック

- **フロントエンド**: React 19 + TypeScript + Vite
- **スタイル**: Tailwind CSS v3
- **バックエンド**: Supabase（Auth / PostgreSQL / Realtime / Edge Functions）
- **デプロイ**: Vercel

---

## セットアップ手順

### 1. Supabase プロジェクト作成

1. [supabase.com](https://supabase.com) で新規プロジェクトを作成
2. **SQL Editor** を開き、`supabase/schema.sql` の内容を全てコピー＆ペーストして実行
3. プロジェクトの **Settings > API** から以下をコピー:
   - `Project URL`
   - `anon public` キー

### 2. 環境変数の設定

`.env.local` ファイルを作成（`.env.example` をコピー）:

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

---

## Edge Functions（メール通知）

### send-confirmation（予約確定メール）

予約確定時にフロントエンドから自動呼び出しされます。
メール送信には [Resend](https://resend.com) を推奨。

Supabase Dashboard > Edge Functions > `send-confirmation` > **Secrets** に追加:
```
RESEND_API_KEY=re_xxxxxxxx
```

### send-reminder（1時間前リマインド）

Supabase Dashboard > Edge Functions > `send-reminder` > **Cron Schedule**:
```
0 * * * *
```
（毎時0分に実行）

---

## ユーザー種別

| 種別 | 登録方法 | 利用開始条件 |
|------|----------|-------------|
| **事業所** | `/register/business` から登録申請 | 管理者の承認後 |
| **MSW（病院）** | `/register/msw` から登録 | 即時利用可 |
| **管理者** | Supabase Authで直接作成 | 手動でprofilesテーブルに追加 |

---

## 対応エリア（香川県）

善通寺市・丸亀市・坂出市・宇多津町・多度津町・琴平町・まんのう町・綾川町

---

## フェーズ構成

- **フェーズ1（実装済み）**: MVP - 検索・即時予約・カレンダー管理・承認フロー
- **フェーズ2（予定）**: 統計・繰り返しカレンダー・担当者管理
- **フェーズ3（予定）**: 地図表示・お気に入り・評価機能

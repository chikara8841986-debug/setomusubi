---
name: setomusubi-risk-workflow
description: せとむすびリポジトリでバグ修正・リスク対応・ハードニング作業をする前に使うワークフロー。RISK_REGISTER.md（検証済みリスク台帳）とRUNTIME_STATUS.md（現在の実行面）を必ず読み、DB/Edge Function変更の反映先とチェックボックス更新・コミットハッシュ追記まで含めて完了させる。「バグ直して」「ダブルブッキング」「リスク対応」「予約整合性」等、setomusubiのコード修正を頼まれたときに使う。
---

# setomusubi-risk-workflow

setomusubiは介護タクシー×MSWマッチングアプリ。予約の二重登録やデータ不整合は搬送事故に直結するため、場当たり的な修正をしないための定型フロー。

## 1. 着手前に必ず読む（この順で）

1. `RISK_REGISTER.md` — 検証済みリスクバックログ。冒頭の運用ルールに従うこと:
   - 修正前に該当ファイルを実際にReadする。台帳の「修正方針」はあくまで参考、**現状コードを正**とする。
   - 該当項目が既にリスク台帳にあるか `rg` で探す（症状・テーブル名・ファイル名で引く）。なければ通常どおり調査する。
2. `RUNTIME_STATUS.md` — 現在の本番実行面（`index.html` / `src/` / `supabase/` / `vercel.json`）を確認する。フロントだけ直して終わりにしない。DB・RLS・Edge Function側の挙動も疑う。

## 2. 変更の反映先ルール

- **DB変更**: Supabase MCPの `apply_migration`（project_id: `lcuoeekhnmbhomcdbedi`）で適用する。
- **Edge Function変更**: Supabase MCPの `deploy_edge_function` でデプロイする。**ソースは必ずリポジトリにも保存する**（デプロイして終わりにしない）。
- **フロント変更**: 通常どおり `src/` を編集し `npm.cmd run build` で検証する。

## 3. 完了時にRISK_REGISTER.mdへ反映する

- 対応した項目のチェックボックスを `[ ]` → `[x]` に変更する。
- 見出しに「— 対応済み YYYY-MM-DD」を追記する。
- 本文に対応内容・検証方法（実行したコマンド・確認できたこと／できなかったこと）を追記する。
- ブラウザでの実ログイン確認が必要で自分では検証できない場合、ファイル冒頭の「🧪 人間による最終チェック待ち一覧」に1行追加する。既存項目（A1, A2, D2, E3, B1/B2, C3, A3, A6等）の書式に合わせる。
- 可能なら対応コミットハッシュを追記する。

## 4. 原則

- でっち上げ厳禁。実際にRead・実行して確認したことだけを「検証済み」と書く。
- ネガティブリスト型の予約モデル（`occupied_slots` の重複が予約可否を決める）を壊す変更は特に慎重に。`vehicle_id` が絡む処理はトリガ `auto_create_occupied_slot` の発火条件（vehicle_idがある場合のみ）を必ず意識する。
- ステータス変更は原則RPC経由（`approve_reservation` 等）。直接UPDATEするとトリガ `guard_reservation_columns` をすり抜ける可能性がある。

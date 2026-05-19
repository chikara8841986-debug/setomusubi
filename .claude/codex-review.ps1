# codex-review.ps1
# Stop フック: Claude Code が停止したとき git diff をチェックし、
# 変更があれば Codex にレビューさせる。
# 問題あり → exit 2 (asyncRewake でClaude Codeを起こす)
# 問題なし or 変更なし → exit 0 (サイレント)

$ErrorActionPreference = 'SilentlyContinue'

$projectRoot = 'C:\ノーパソから\ZIP\介護タクシーをつなぐ\setomusubi'
$codexScript  = 'C:/Users/chika/.claude/plugins/cache/openai-codex/codex/1.0.4/scripts/codex-companion.mjs'

Set-Location $projectRoot

# ── 変更チェック ────────────────────────────────────────────────
$diffStat = & git diff HEAD --stat 2>$null
if (-not $diffStat) { exit 0 }

# ── Codex レビュー ──────────────────────────────────────────────
$prompt = @'
git diff HEAD を確認して、直前に行われた実装変更をレビューしてください。
以下の観点で日本語で報告してください:
1. バグ・ロジックエラーの可能性
2. セキュリティ上の懸念点
3. 設計・可読性の改善案

問題が何もなければ「✅ レビューOK」とだけ返してください。
'@

$review = & node $codexScript task $prompt '--read-only' 2>$null

if (-not $review) { exit 0 }

# ── 出力 ────────────────────────────────────────────────────────
Write-Output $review

# OK 判定: "✅" か "レビューOK" が含まれていれば問題なし
if ($review -match '✅|レビューOK') {
    exit 0
} else {
    # exit 2: asyncRewake が Claude Code を起こす
    exit 2
}

import { Link } from 'react-router-dom'

const today = new Date()
const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月`

type Step = { action: string; where: string; point?: string }
type Scene = {
  title: string
  role: string
  roleColor: string
  goal: string
  steps: Step[]
  tip?: string
}

const SCENES: Scene[] = [
  // ===== MSW シナリオ =====
  {
    title: '①【MSW側】事業所を検索して仮予約を申請する',
    role: 'MSW',
    roleColor: 'bg-sky-600',
    goal: '「電話なしで、空き枠を見つけて30秒で申請できる」を見せる',
    steps: [
      {
        action: '「予約する」タブを開く',
        where: '上部ナビ「🔍 予約する」',
        point: '希望日・時間・機材を入力するだけ。エリア絞り込みも可',
      },
      {
        action: '検索条件を入力して「空き枠を検索する」を押す',
        where: '日付 = 明日、開始9:00、終了12:00、車椅子',
        point: '空きのある事業所だけが表示される。電話して確認する手間がゼロ',
      },
      {
        action: '表示された事業所の枠カードをタップする',
        where: '「せとうち介護タクシー 09:00〜12:00」の「この枠で申請 →」',
        point: '住所・対応機材・電話番号がその場で確認できる',
      },
      {
        action: '患者情報を入力して申請する',
        where: '担当者・患者氏名・乗車地・目的地を入力 → 「仮予約を申請する」',
        point: '構造化されたフォームで入力漏れがない。事業所側に正確な情報が届く',
      },
      {
        action: '完了画面・予約履歴を確認',
        where: '「予約履歴を確認する」ボタン → 予約履歴ページ',
        point: '「申請中」ステータスで表示。承認されると「確定」に変わり通知が来る',
      },
    ],
    tip: '「却下」された場合も詳細画面から「別の事業所を探して申請する」で即座に再申請できます。',
  },
  {
    title: '②【MSW側】事業所一覧・お気に入り機能を見せる',
    role: 'MSW',
    roleColor: 'bg-sky-600',
    goal: '「よく使う事業所をすぐ見つけられる」を見せる',
    steps: [
      {
        action: '「事業所一覧」を開く',
        where: 'ナビ「🚗 事業所一覧」',
        point: '承認済みの全事業所が表示。対応機材バッジで特徴が一目でわかる',
      },
      {
        action: '☆マークをタップしてお気に入り登録',
        where: 'カードの右上の「☆」',
        point: '⭐に変わる。よく使う事業所をすぐ見つけられる',
      },
      {
        action: '「空き確認」ボタンで一括確認',
        where: '右上「空き確認」→ 日時を入力',
        point: 'お気に入り事業所の空き状況をまとめて確認できる（電話不要）',
      },
      {
        action: '「この枠で申請」ボタンで直接申請',
        where: '空きのある事業所のカード下部',
        point: 'お気に入りから直接申請画面へ飛べる。最短2タップで申請開始',
      },
    ],
  },

  // ===== 事業所 シナリオ =====
  {
    title: '③【事業所側】仮予約申請の承認フローを見せる',
    role: '事業所',
    roleColor: 'bg-teal-600',
    goal: '「構造化された申請が届いて、ワンクリックで承認できる」を見せる',
    steps: [
      {
        action: '「予約管理」を開く',
        where: 'ナビ「📋 予約管理」（赤バッジあり）',
        point: '新しい申請が届くと赤いバッジで通知される。見逃しがない',
      },
      {
        action: '申請中タブの注意バナーを確認',
        where: '「申請中タブ」の上部バナー',
        point: '申請から何時間経過しているか表示。長時間放置するとカードが橙→赤に変わる',
      },
      {
        action: '申請カードをタップして詳細を確認',
        where: '「佐藤一郎」の申請カードをタップ',
        point: '患者名・乗車地・目的地・機材・備考が一覧。乗車地はGoogle マップで開ける',
      },
      {
        action: '「✓ 承認する」を押す',
        where: 'モーダル内「✓ 承認する（予約を確定）」',
        point: '承認と同時にMSWへ確認メールが自動送信される。電話不要',
      },
      {
        action: '確定済みタブで確認',
        where: '「確定済み」タブ',
        point: '承認した予約が移動。日時・患者名・病院名が一覧で見られる',
      },
    ],
    tip: '満車で対応できない場合は「却下する」でMSWへ即座に通知。MSW側が別の事業所を探せるので連絡が迅速になります。',
  },
  {
    title: '④【事業所側】カレンダーで空き枠を管理する',
    role: '事業所',
    roleColor: 'bg-teal-600',
    goal: '「Googleカレンダー感覚でドラッグするだけで空き枠が登録できる」を見せる',
    steps: [
      {
        action: '「カレンダー」を開く',
        where: 'ナビ「📅 カレンダー」',
        point: 'Googleカレンダー型の時間グリッドが表示される。左端の緑ラインが営業時間の目安',
      },
      {
        action: 'グリッドをドラッグして空き枠を追加する',
        where: '時間グリッド上で上から下にドラッグ（またはタップ）',
        point: 'ドラッグ中に時間帯がリアルタイム表示される。放すと即座に枠が追加される。フォーム入力不要',
      },
      {
        action: '既存の枠をタップして詳細を確認する',
        where: '緑のブロックをタップ',
        point: '予約が入った枠は色が変わる（緑→青緑=予約あり、オレンジ=申請中）。枠の削除もここから',
      },
      {
        action: '週次設定で一括登録する（本番機能）',
        where: '右上「週次設定」ボタン',
        point: '曜日・時間帯を指定して数週分まとめて登録できる。定期稼働がある場合に便利',
      },
    ],
  },
]

const TALKING_POINTS = [
  { icon: '📞', title: '電話での手配との違い', text: '電話では「空いてますか？」の確認から始まり、患者情報を口頭でやり取りする必要がありました。せとむすびでは空き枠がリアルタイムで見え、患者情報はフォームで一度入力するだけです。' },
  { icon: '⏱️', title: '対応時間の短縮', text: '電話が繋がらない・折り返し待ち・申請メモの転記ミスなどのロスがなくなります。MSW側は申請から数分、事業所側も確認から承認まで1〜2分で完結します。' },
  { icon: '📋', title: '記録の一元化', text: '過去の予約履歴が全件検索・参照できます。患者ごとのよく使う事業所もお気に入りで管理できます。' },
  { icon: '🔔', title: '自動通知', text: '承認・却下・キャンセルはすべてメール通知されます。事業所は申請を見逃さず、MSWは電話確認なしで結果がわかります。' },
  { icon: '📱', title: 'スマホでも使える', text: 'スマートフォンのブラウザから利用できます。アプリのインストールは不要です。' },
]

export default function DemoGuide() {
  const handlePrint = () => window.print()

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; break-before: page; }
          body { font-size: 10.5pt; line-height: 1.6; color: #1e293b; }
          @page { margin: 1.5cm 2cm; size: A4; }
          h1 { font-size: 18pt !important; }
          h2 { font-size: 13pt !important; margin-top: 16pt !important; }
          h3 { font-size: 11pt !important; }
          .card { box-shadow: none !important; border: 1px solid #cbd5e1 !important; }
          a { color: inherit !important; text-decoration: none !important; }
          .scene-card { border: 2px solid #94a3b8 !important; border-radius: 8px !important; margin-bottom: 16pt !important; }
        }
        @media screen {
          .guide-root { max-width: 780px; margin: 0 auto; padding: 24px 16px 48px; }
        }
      `}</style>

      <div className="guide-root">
        {/* Header bar (screen only) */}
        <div className="no-print flex items-center justify-between mb-6 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <Link to="/demo" className="text-teal-700 hover:underline">← デモへ</Link>
            <span className="text-slate-300">|</span>
            <Link to="/manual" target="_blank" className="text-teal-700 hover:underline">📖 ユーザー向け説明書</Link>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm"
          >
            📄 PDFとして保存
          </button>
        </div>

        {/* Cover */}
        <div className="text-center py-8 mb-8 bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl text-white">
          <div className="text-4xl mb-3">🎯</div>
          <h1 className="text-2xl font-black tracking-wide mb-2">せとむすび　デモ手順書</h1>
          <p className="text-slate-300 text-sm">MSW・事業所へのプレゼンテーション用　{dateLabel}版</p>
          <p className="text-slate-400 text-xs mt-2">このドキュメントは社内・営業用です。配布しないでください。</p>
        </div>

        {/* 事前準備 */}
        <section className="mb-8">
          <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4">📋 デモ前の確認事項</h2>
          <div className="card space-y-3">
            {[
              { check: 'ブラウザでデモページを開いておく', url: '/demo（ログイン不要）' },
              { check: 'スマホの場合: ブラウザをフルスクリーンにしておく', url: '（住所バーを隠す）' },
              { check: '通信環境を確認する', url: 'Wi-Fi推奨（デモはオフラインでも動作）' },
              { check: '「MSWとして体験」「事業所として体験」両方の入口を把握しておく', url: 'デモ選択ページから切替可能' },
              { check: 'ユーザー向け説明書（/manual）をタブで開いておく', url: '質問が出たときに参照しやすい' },
            ].map(({ check, url }) => (
              <label key={check} className="flex gap-3 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-teal-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-800">{check}</p>
                  <p className="text-xs text-slate-400">{url}</p>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Scenes */}
        <section className="mb-8">
          <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4">🎬 デモシナリオ</h2>
          <p className="text-xs text-slate-500 mb-4">各シナリオは独立して使えます。相手に合わせて①②（MSW向け）または③④（事業所向け）を選んでください。</p>

          <div className="space-y-6">
            {SCENES.map((scene, si) => (
              <div key={si} className="scene-card border-2 border-slate-200 rounded-xl overflow-hidden">
                {/* Scene header */}
                <div className="bg-slate-800 text-white px-5 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${scene.roleColor} text-white`}>
                      {scene.role}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold">{scene.title}</h3>
                  <p className="text-slate-300 text-xs mt-1">🎯 ゴール: {scene.goal}</p>
                </div>

                {/* Steps */}
                <div className="p-5">
                  <div className="space-y-3">
                    {scene.steps.map((step, i) => (
                      <div key={i} className="flex gap-3">
                        <div className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5 border border-slate-200">
                          {i + 1}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-slate-800">{step.action}</p>
                          <p className="text-xs text-teal-700 font-medium mt-0.5">📍 {step.where}</p>
                          {step.point && (
                            <p className="text-xs text-slate-500 mt-0.5 bg-slate-50 rounded px-2 py-1">
                              💬 「{step.point}」
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {scene.tip && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                      <span className="font-bold">補足: </span>{scene.tip}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Talking points */}
        <section className="mb-8 page-break">
          <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4">💬 よく聞かれる質問と回答のポイント</h2>

          <div className="space-y-3">
            {TALKING_POINTS.map(({ icon, title, text }) => (
              <div key={title} className="card">
                <div className="flex gap-3">
                  <span className="text-xl flex-shrink-0">{icon}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-800 mb-1">Q. {title}</p>
                    <p className="text-xs text-slate-600">{text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Objection handling */}
        <section className="mb-8">
          <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4">🛡️ 想定される懸念と回答</h2>
          <div className="space-y-3">
            {[
              {
                q: '「使いこなせるか不安」（特にシニア層）',
                a: 'スマートフォンのブラウザで動き、アプリのインストールは不要です。操作はタップ中心で、初回設定（担当者登録・病院情報入力）は3分程度で完了します。デモでそのまま試していただけます。',
              },
              {
                q: '「電話の方が早くて確実」',
                a: '電話は繋がらないリスク・折り返し待ち・口頭での情報伝達ミスがあります。せとむすびは申請から承認まで平均XX分（目標値）で、患者情報の転記ミスも防げます。電話を補完する手段として使っていただくことを想定しています。',
              },
              {
                q: '「料金はかかるか？」',
                a: '現在β版として無料でご提供しています。将来的な料金プランは別途ご案内予定です。',
              },
              {
                q: '「個人情報（患者情報）の取り扱いは？」',
                a: '通信はSSL暗号化、データはSupabase（AWS基盤）で管理しています。患者情報は申請に必要な範囲のみで、第三者への提供は行いません。詳細はプライバシーポリシーをご参照ください。',
              },
              {
                q: '「使わない事業所が増えても意味がない」',
                a: 'まず丸亀市周辺の複数事業所に導入いただき、MSWが「検索すれば空き枠が見つかる」体験を積み重ねることが普及の鍵です。事業所が登録するだけでMSWの検索に表示されるので、まずは登録だけでもお願いしたいと考えています。',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-red-50 px-4 py-2.5">
                  <p className="text-sm font-semibold text-red-800">⚠️ {q}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-600">→ {a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Next steps */}
        <section className="mb-8">
          <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-4">🚀 デモ後のネクストアクション</h2>
          <div className="grid gap-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="card bg-sky-50 border-sky-200">
              <p className="font-bold text-sky-800 text-sm mb-2">🏥 MSWの場合</p>
              <ol className="text-xs text-sky-700 space-y-1 list-decimal list-inside">
                <li>MSW登録ページで無料登録</li>
                <li>病院情報・担当者を設定</li>
                <li>事業所に空き枠を追加してもらう</li>
                <li>実際の案件で仮予約を試す</li>
              </ol>
            </div>
            <div className="card bg-teal-50 border-teal-200">
              <p className="font-bold text-teal-800 text-sm mb-2">🚐 事業所の場合</p>
              <ol className="text-xs text-teal-700 space-y-1 list-decimal list-inside">
                <li>事業所登録ページで無料登録</li>
                <li>管理者承認（1〜2営業日）</li>
                <li>プロフィール・空き枠を設定</li>
                <li>MSWからの申請を待つ</li>
              </ol>
            </div>
          </div>
          <div className="mt-3 card bg-slate-50 border-slate-200 text-sm">
            <p className="font-bold text-slate-800 mb-1">📌 登録ページ</p>
            <p className="text-xs text-slate-600">ログインページ（/login）から「事業所登録」「MSW登録」にアクセスできます。<br />デモページ（/demo）からも案内しています。</p>
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400 space-y-1">
          <p className="font-bold text-slate-600">せとむすび　デモ手順書</p>
          <p>{dateLabel}版　※社内配布用・社外秘</p>
          <p className="no-print mt-2">
            <Link to="/demo" className="text-teal-600 hover:underline mr-4">← デモページへ</Link>
            <Link to="/manual" target="_blank" className="text-teal-600 hover:underline">📖 ユーザー向け説明書</Link>
          </p>
        </div>
      </div>
    </>
  )
}

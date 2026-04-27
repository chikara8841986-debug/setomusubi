import { Link } from 'react-router-dom'

const today = new Date()
const dateLabel = `${today.getFullYear()}年${today.getMonth() + 1}月`

export default function Manual() {
  const handlePrint = () => window.print()

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; break-before: page; }
          body { font-size: 11pt; line-height: 1.6; }
          @page { margin: 1.8cm 2cm; size: A4; }
          h1 { font-size: 20pt !important; }
          h2 { font-size: 14pt !important; page-break-before: always; }
          h2:first-of-type { page-break-before: avoid; }
          h3 { font-size: 12pt !important; }
          .card { box-shadow: none !important; border: 1px solid #ccc !important; }
          a { color: inherit !important; text-decoration: none !important; }
        }
        @media screen {
          .manual-root { max-width: 780px; margin: 0 auto; padding: 24px 16px; }
        }
      `}</style>

      <div className="manual-root">
        {/* Print button (screen only) */}
        <div className="no-print flex items-center justify-between mb-6 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-teal-700 hover:underline">← ログインページへ</Link>
            <span className="text-slate-300">|</span>
            <Link to="/demo" className="text-sm text-teal-700 hover:underline">⚡ デモを試す</Link>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm"
          >
            📄 PDFとして保存
          </button>
        </div>

        {/* ===== Cover ===== */}
        <div className="text-center py-10 mb-8 bg-gradient-to-br from-teal-50 to-sky-50 rounded-2xl border border-teal-100">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 flex items-center justify-center shadow-lg text-white text-3xl font-black mx-auto mb-4">
            瀬
          </div>
          <h1 className="text-3xl font-black text-teal-800 tracking-wide mb-2">せとむすび</h1>
          <p className="text-teal-600 font-semibold text-lg mb-1">介護タクシー仮予約プラットフォーム</p>
          <p className="text-slate-500 text-sm">利用ガイド　{dateLabel}版</p>
        </div>

        {/* ===== TOC ===== */}
        <div className="card mb-8 no-print">
          <h2 className="text-base font-bold text-slate-800 mb-3" style={{ pageBreakBefore: 'avoid' }}>目次</h2>
          <ol className="space-y-1 text-sm text-teal-700">
            {[
              'せとむすびとは',
              'MSW（医療ソーシャルワーカー）向け使い方',
              '介護タクシー事業所向け使い方',
              'よくある質問（FAQ）',
            ].map((item, i) => (
              <li key={i}><span className="font-semibold">{i + 1}.</span> {item}</li>
            ))}
          </ol>
        </div>

        {/* ===== Section 1: Overview ===== */}
        <section className="mb-10">
          <h2 className="text-xl font-black text-teal-800 border-b-2 border-teal-200 pb-2 mb-5">
            1. せとむすびとは
          </h2>
          <p className="text-slate-700 mb-4">
            <strong>せとむすび</strong>は、香川県の<strong>介護タクシー事業所</strong>と<strong>病院のMSW（医療ソーシャルワーカー）</strong>をつなぐ仮予約プラットフォームです。
            これまで電話でやり取りしていた介護タクシーの手配を、スマートフォン・PCからいつでも効率よく行えます。
          </p>

          <div className="grid grid-cols-1 gap-4 mb-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4">
              <p className="text-sky-800 font-bold text-sm mb-2">🏥 MSW（病院）にとってのメリット</p>
              <ul className="text-xs text-sky-700 space-y-1 list-disc list-inside">
                <li>事業所の空き枠をリアルタイムで確認</li>
                <li>電話なしで仮予約を申請できる</li>
                <li>承認・却下の結果が通知で届く</li>
                <li>予約履歴を一元管理</li>
              </ul>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
              <p className="text-teal-800 font-bold text-sm mb-2">🚐 事業所にとってのメリット</p>
              <ul className="text-xs text-teal-700 space-y-1 list-disc list-inside">
                <li>仮予約申請が構造化された形で届く</li>
                <li>ワンクリックで承認・却下できる</li>
                <li>患者情報・地図URLがすぐ確認できる</li>
                <li>空き枠管理をカレンダーで行える</li>
              </ul>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-bold mb-1">⚠️ ご注意</p>
            <p>せとむすびは<strong>仮予約</strong>システムです。事業所が承認するまで予約は確定しません。急ぎの場合は電話での直接確認をあわせてお使いください。</p>
          </div>
        </section>

        {/* ===== Section 2: MSW ===== */}
        <section className="mb-10 page-break">
          <h2 className="text-xl font-black text-sky-800 border-b-2 border-sky-200 pb-2 mb-5">
            2. MSW（医療ソーシャルワーカー）向け使い方
          </h2>

          {/* 2.1 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2.1</span>
              アカウント登録
            </h3>
            <ol className="space-y-3">
              {[
                { step: 1, title: 'MSW登録ページを開く', desc: 'ログインページの「MSW登録」リンクからアカウント登録ページへ進みます。' },
                { step: 2, title: 'メールアドレス・パスワードを入力', desc: '勤務先の病院メールアドレスと8文字以上のパスワードを設定してください。' },
                { step: 3, title: '病院情報を入力', desc: '病院名（必須）・住所・代表電話番号を入力します。住所は事業所がルート確認に使用します。' },
                { step: 4, title: '確認メールを確認', desc: '登録したメールアドレスに確認メールが届きます。メール内のリンクをクリックするとログインできます。' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 2.2 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2.2</span>
              はじめにやること（初回設定）
            </h3>
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 space-y-3 text-sm">
              <div className="flex gap-3">
                <span className="text-sky-600 font-bold flex-shrink-0">①</span>
                <div>
                  <p className="font-semibold text-slate-800">病院情報を確認・更新する</p>
                  <p className="text-xs text-slate-500">「病院情報」ページで登録時の情報が正しいか確認します。ここで入力した病院名・住所・電話番号が仮予約申請時に事業所へ通知されます。</p>
                </div>
              </div>
              <div className="flex gap-3">
                <span className="text-sky-600 font-bold flex-shrink-0">②</span>
                <div>
                  <p className="font-semibold text-slate-800">担当者を登録する</p>
                  <p className="text-xs text-slate-500">「担当者」ページで、仮予約申請を行うスタッフの名前を登録します。申請時に「担当者」として選択でき、事業所へも通知されます。複数名登録できます。</p>
                </div>
              </div>
            </div>
          </div>

          {/* 2.3 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2.3</span>
              事業所を検索して仮予約を申請する
            </h3>
            <ol className="space-y-3">
              {[
                {
                  step: 1,
                  title: '「予約する」ページを開く',
                  desc: '上部ナビの「🔍 予約する」をタップします。',
                },
                {
                  step: 2,
                  title: '希望条件を入力する',
                  desc: '希望日・開始時間・終了時間・使用機材（車椅子 / リクライニング車椅子 / ストレッチャー）・患者の乗車エリアを入力して「検索」を押します。',
                },
                {
                  step: 3,
                  title: '空き枠のある事業所を選ぶ',
                  desc: '検索結果に表示された事業所の空き枠カードをタップします。事業所名・電話番号・対応機材・住所が表示されます。',
                },
                {
                  step: 4,
                  title: '患者情報を入力して申請する',
                  desc: '担当者・患者氏名・乗車地（患者住所）・目的地・機材貸出の有無・備考を入力して「仮予約を申請する」を押します。',
                },
                {
                  step: 5,
                  title: '結果を待つ',
                  desc: '申請が完了すると「予約履歴」の「進行中」タブに「申請中」として表示されます。事業所が承認すると「確定」に変わり、メール通知が届きます。',
                },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-sky-100 text-sky-700 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 2.4 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2.4</span>
              予約状況の確認とキャンセル
            </h3>
            <div className="card space-y-2 text-sm">
              <div className="flex gap-2">
                <span className="badge-red flex-shrink-0">申請中</span>
                <p className="text-xs text-slate-600">事業所が未確認。12時間以上経過しても変わらない場合は直接電話を推奨します。</p>
              </div>
              <div className="flex gap-2">
                <span className="badge-blue flex-shrink-0">確定</span>
                <p className="text-xs text-slate-600">事業所が承認済み。予約は確定しています。キャンセルの場合は早めに実施してください。</p>
              </div>
              <div className="flex gap-2">
                <span className="badge-gray flex-shrink-0">却下</span>
                <p className="text-xs text-slate-600">定員満了等で対応不可。詳細画面の「別の事業所を探して申請する」ボタンで再申請できます。</p>
              </div>
              <div className="flex gap-2">
                <span className="badge-green flex-shrink-0">完了</span>
                <p className="text-xs text-slate-600">移送が完了した予約。「同じ内容で再申請する」ボタンも利用できます。</p>
              </div>
            </div>
          </div>

          {/* 2.5 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-sky-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">2.5</span>
              お気に入り機能と事業所一覧
            </h3>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-amber-500">⭐</span><p className="text-slate-700">「事業所一覧」ページの <strong>☆ マーク</strong> をタップするとお気に入り登録できます。</p></li>
              <li className="flex gap-2"><span>📋</span><p className="text-slate-700">「お気に入り」ページでは登録事業所をまとめて確認し、<strong>「空き確認」ボタン</strong>で希望日時に空きがある事業所を一覧表示できます。</p></li>
              <li className="flex gap-2"><span>📞</span><p className="text-slate-700">事業所に登録された電話番号をタップすると直接電話できます（急ぎの場合など）。</p></li>
            </ul>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 mt-4">
            <p className="font-bold mb-1">💡 ヒント</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>申請後に却下された場合、同じ内容で別の事業所に申請しなおせます。</li>
              <li>患者が同一でよく使う事業所がある場合はお気に入り登録をご活用ください。</li>
            </ul>
          </div>
        </section>

        {/* ===== Section 3: Business ===== */}
        <section className="mb-10 page-break">
          <h2 className="text-xl font-black text-teal-800 border-b-2 border-teal-200 pb-2 mb-5">
            3. 介護タクシー事業所向け使い方
          </h2>

          {/* 3.1 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3.1</span>
              アカウント登録（要管理者承認）
            </h3>
            <ol className="space-y-3">
              {[
                { step: 1, title: '事業所登録ページを開く', desc: 'ログインページの「事業所登録」リンクから登録ページへ進みます。' },
                { step: 2, title: 'メールアドレス・パスワードを入力', desc: '事業所用のメールアドレスと8文字以上のパスワードを設定します。' },
                { step: 3, title: '事業所名・電話番号を入力', desc: '事業所名（必須）と電話番号を入力して登録を完了します。' },
                { step: 4, title: '管理者の承認を待つ', desc: '登録後、管理者が承認するまでサービスをご利用いただけません。承認されると通知メールが届きます。通常1〜2営業日以内に承認されます。' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 3.2 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3.2</span>
              はじめにやること（初回設定）
            </h3>
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3 text-sm">
              {[
                { num: '①', title: 'プロフィールを設定する', desc: '「⚙️ 設定」ページで事業所名・住所・電話番号・営業時間・定休日・対応機材を設定します。MSWの検索フィルターに使用されます。' },
                { num: '②', title: '紹介ページを整える', desc: '「🏢 紹介ページ」でPR文・料金・資格・車両写真を登録します。充実させるとMSWに選ばれやすくなります。' },
                { num: '③', title: '空き枠をカレンダーに登録する', desc: '「📅 カレンダー」で翌日以降の空き枠を追加します。空き枠がないとMSWの検索結果に表示されません。' },
              ].map(({ num, title, desc }) => (
                <div key={num} className="flex gap-3">
                  <span className="text-teal-600 font-bold flex-shrink-0">{num}</span>
                  <div>
                    <p className="font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 3.3 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3.3</span>
              空き枠の管理（カレンダー）
            </h3>
            <ol className="space-y-3">
              {[
                { step: 1, title: 'カレンダーを開く', desc: '上部ナビの「📅 カレンダー」をタップします。' },
                { step: 2, title: '空き枠を追加する', desc: '「＋ 追加」ボタンを押して日付・開始時間・終了時間を選びます。プロフィールで設定した営業時間が初期値として使われます。' },
                { step: 3, title: '一括追加を使う', desc: '「週次一括追加」機能を使うと、同じ時間帯を指定した曜日にまとめて登録できます。定期便がある場合に便利です。' },
                { step: 4, title: '不要な枠を削除する', desc: '追加済みの枠の「削除」ボタンをタップ→「確認」でその枠を削除できます。確定済み予約のある枠は削除できません。' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* 3.4 */}
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-800 mb-3 flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs flex items-center justify-center font-bold flex-shrink-0">3.4</span>
              仮予約の承認・却下
            </h3>
            <ol className="space-y-3">
              {[
                { step: 1, title: '「予約管理」を開く', desc: 'MSWから申請が届くと、上部ナビの「📋 予約管理」バッジ（赤丸）に件数が表示されます。' },
                { step: 2, title: '申請内容を確認する', desc: '「申請中」タブに申請が一覧表示されます。タップすると患者氏名・乗車地・目的地・使用機材・備考が確認できます。乗車地・目的地はGoogle マップリンクで開けます。' },
                { step: 3, title: '承認または却下する', desc: '「✓ 承認する」で予約が確定し、MSWへ確認メールが送信されます。満車・対応不可の場合は「却下する」を押してください。MSWへ却下メールが送信されます。' },
                { step: 4, title: '確定後の管理', desc: '承認した予約は「確定済み」タブに移動します。当日の予約は「今日」タブにも表示されます。移送完了後は「✓ 完了にする」を押してください。' },
              ].map(({ step, title, desc }) => (
                <li key={step} className="flex gap-3">
                  <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">{step}</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            <p className="font-bold mb-1">💡 ヒント</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>申請から6時間以上経過するとカードが橙色、12時間以上で赤色に変わります。お早めにご対応ください。</li>
              <li>1つの空き枠に複数の申請が届いた場合、最初に承認した1件以外は自動的に却下されます。</li>
              <li>キャンセルの連絡先電話番号をプロフィールに登録しておくとMSWが緊急時に連絡しやすくなります。</li>
            </ul>
          </div>
        </section>

        {/* ===== Section 4: FAQ ===== */}
        <section className="mb-10 page-break">
          <h2 className="text-xl font-black text-slate-800 border-b-2 border-slate-200 pb-2 mb-5">
            4. よくある質問（FAQ）
          </h2>

          <div className="space-y-4">
            {[
              {
                q: '登録したのにログインできません',
                a: '事業所の場合は管理者の承認が必要です。承認されると登録メールアドレスに通知が届きます。MSWの場合は登録時に送られた確認メールのリンクをクリックしてください。',
              },
              {
                q: '承認・却下の通知が届きません',
                a: '迷惑メールフォルダをご確認ください。また、メールアドレスが正しいか「病院情報」または「設定」ページでご確認ください。',
              },
              {
                q: '申請したのに事業所から反応がありません',
                a: '申請から12時間以上経過しても状況が変わらない場合は、予約詳細に表示されている事業所の電話番号へ直接ご連絡ください。',
              },
              {
                q: '空き枠を追加したのにMSWの検索に出てきません',
                a: 'MSWの検索条件（日時・使用機材）と登録した空き枠が一致していない場合は表示されません。プロフィールで対応機材を正しく設定しているかもご確認ください。',
              },
              {
                q: '確定した予約をキャンセルしたい（MSW）',
                a: '「予約履歴」の確定済み予約の詳細を開き、「キャンセル」ボタンを押してください。事業所へキャンセルの通知メールが自動送信されます。',
              },
              {
                q: '確定した予約がキャンセルされました（事業所）',
                a: 'MSWがキャンセルした場合、「予約管理」にキャンセル通知が届きます。該当の空き枠は自動的に再開放されます。',
              },
              {
                q: 'パスワードを忘れました',
                a: 'ログインページの「パスワードを忘れた方」から再設定メールを送ることができます。登録したメールアドレスを入力してください。',
              },
              {
                q: '対応エリアはどこですか？',
                a: 'せとむすびは香川県（丸亀市・善通寺市・坂出市・宇多津町・多度津町・琴平町・まんのう町・綾川町）を対象エリアとしています。',
              },
            ].map(({ q, a }) => (
              <div key={q} className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">Q. {q}</p>
                </div>
                <div className="px-4 py-3">
                  <p className="text-xs text-slate-600">A. {a}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <div className="border-t border-slate-200 pt-6 text-center text-xs text-slate-400 space-y-1">
          <p className="font-bold text-slate-600">せとむすび</p>
          <p>介護タクシー × MSW 仮予約プラットフォーム</p>
          <p>{dateLabel}版</p>
          <p className="no-print mt-3">
            <Link to="/demo" className="text-teal-600 hover:underline mr-4">⚡ デモを試す</Link>
            <Link to="/login" className="text-teal-600 hover:underline">ログインページへ</Link>
          </p>
        </div>
      </div>
    </>
  )
}

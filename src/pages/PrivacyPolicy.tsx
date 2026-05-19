import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const effectiveDate = '2026年5月20日'

type SectionProps = {
  title: string
  children: ReactNode
}

function Section({ title, children }: SectionProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-bold text-slate-900">{title}</h2>
      <div className="space-y-3 text-base leading-8 text-slate-700">{children}</div>
    </section>
  )
}

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Link to="/login" className="text-sm font-semibold text-teal-700 hover:underline">
            ログイン画面へ
          </Link>
          <Link to="/terms" className="text-sm font-semibold text-teal-700 hover:underline">
            利用規約
          </Link>
        </div>

        <header className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-teal-700">せとむすび</p>
          <h1 className="text-3xl font-black tracking-normal text-slate-900">プライバシーポリシー</h1>
          <p className="mt-4 text-base leading-8 text-slate-700">
            このプライバシーポリシーは、「せとむすび」で取り扱う個人情報の種類、利用目的、共有範囲、安全管理、問い合わせ方法を説明するものです。
            介護タクシーの予約調整では患者さまに関する情報を扱うため、必要な範囲に限って慎重に取り扱います。
          </p>
          <p className="mt-4 text-sm text-slate-500">制定日: {effectiveDate}</p>
        </header>

        <div className="space-y-4">
          <Section title="1. 取得する情報">
            <ul className="list-disc space-y-2 pl-5">
              <li>アカウント情報: メールアドレス、所属、氏名、電話番号など</li>
              <li>病院・MSW情報: 病院名、住所、代表電話番号、担当者名など</li>
              <li>介護タクシー事業所情報: 事業所名、電話番号、所在地、車両情報、対応可能な設備など</li>
              <li>予約情報: 患者さまの氏名、乗車地、目的地、利用日時、必要機材、付き添い人数、備考など</li>
              <li>利用情報: ログイン日時、操作履歴、端末やブラウザに関する情報、エラー情報など</li>
              <li>決済関連情報: 契約プラン、請求状況、決済代行事業者から提供される支払い状態など</li>
            </ul>
          </Section>

          <Section title="2. 利用目的">
            <ul className="list-disc space-y-2 pl-5">
              <li>アカウント登録、本人確認、ログイン管理のため</li>
              <li>介護タクシーの空き状況検索、仮予約申請、承認・却下、キャンセル連絡のため</li>
              <li>予約内容を病院・MSWと介護タクシー事業所の間で正確に共有するため</li>
              <li>通知メール、リマインド、問い合わせ対応、サポート対応のため</li>
              <li>料金請求、契約管理、不正利用防止のため</li>
              <li>サービス改善、障害調査、品質向上、統計分析のため</li>
              <li>法令や利用規約に基づく対応のため</li>
            </ul>
          </Section>

          <Section title="3. 予約情報の共有範囲">
            <p>
              予約に必要な情報は、予約を依頼する病院・MSWと、予約先または予約候補となる介護タクシー事業所に共有されます。
              共有される情報には、患者さまの氏名、乗車地、目的地、日時、必要機材、付き添い人数、連絡担当者などが含まれます。
            </p>
            <p>
              予約調整に必要のない第三者へ、患者さまの情報を販売したり、広告目的で提供したりすることはありません。
            </p>
          </Section>

          <Section title="4. 第三者提供・委託">
            <p>
              運営者は、次の場合を除き、本人または正当な権限を持つ利用者の同意なく個人情報を第三者へ提供しません。
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>予約調整に必要な範囲で、病院・MSWと介護タクシー事業所に共有する場合</li>
              <li>決済、メール送信、データ保管、システム運用などを外部サービスへ委託する場合</li>
              <li>法令に基づく場合</li>
              <li>人の生命、身体、財産の保護のために必要で、同意を得ることが難しい場合</li>
            </ul>
          </Section>

          <Section title="5. 決済情報の取り扱い">
            <p>
              クレジットカード番号などの決済情報は、決済代行事業者が管理します。本サービスは、カード番号そのものを保存しません。
              本サービスでは、契約プラン、請求状況、決済成功・失敗の情報など、契約管理に必要な情報を取り扱います。
            </p>
          </Section>

          <Section title="6. 安全管理">
            <p>
              運営者は、個人情報の漏えい、紛失、改ざん、不正アクセスを防ぐため、アクセス制限、認証管理、通信の暗号化、ログ管理、委託先の管理など、必要かつ適切な安全管理措置を講じます。
            </p>
            <p>
              利用者も、アカウント情報や端末を適切に管理し、業務上必要な範囲を超えて情報を閲覧・共有しないようにしてください。
            </p>
          </Section>

          <Section title="7. 保存期間と削除">
            <p>
              個人情報は、利用目的の達成、契約管理、問い合わせ対応、法令対応に必要な期間保存します。
              不要になった情報は、法令や業務上必要な保存期間を確認したうえで、削除または復元できない形で処理します。
            </p>
          </Section>

          <Section title="8. 開示・訂正・利用停止">
            <p>
              利用者または本人から、個人情報の開示、訂正、追加、削除、利用停止等の請求があった場合、運営者は本人確認を行ったうえで、法令に従って対応します。
            </p>
          </Section>

          <Section title="9. Cookie・ローカルストレージ">
            <p>
              本サービスでは、ログイン状態の維持、表示設定、利用状況の把握、サービス改善のために、Cookieやブラウザのローカルストレージを使用することがあります。
            </p>
          </Section>

          <Section title="10. ポリシーの変更">
            <p>
              運営者は、必要に応じて本ポリシーを変更することがあります。重要な変更がある場合は、サービス内表示、メール、その他合理的な方法で案内します。
            </p>
          </Section>

          <Section title="11. お問い合わせ">
            <p>
              個人情報の取り扱いに関する問い合わせは、運営者がサービス内または別途表示する窓口までご連絡ください。
            </p>
          </Section>
        </div>
      </div>
    </main>
  )
}

import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

const effectiveDate = '2026年7月4日'

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

export default function Terms() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <Link to="/login" className="text-sm font-semibold text-teal-700 hover:underline">
            ログイン画面へ
          </Link>
          <Link to="/privacy" className="text-sm font-semibold text-teal-700 hover:underline">
            プライバシーポリシー
          </Link>
        </div>

        <header className="mb-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <p className="mb-2 text-sm font-semibold text-teal-700">せとむすび</p>
          <h1 className="text-3xl font-black tracking-normal text-slate-900">利用規約</h1>
          <p className="mt-4 text-base leading-8 text-slate-700">
            この利用規約は、介護タクシー事業所と病院・MSW等をつなぐ予約調整サービス「せとむすび」の利用条件を定めるものです。
            利用者は、本サービスを利用する前に本規約を確認し、同意したうえで利用するものとします。
          </p>
          <p className="mt-4 text-sm text-slate-500">制定日: {effectiveDate}</p>
        </header>

        <div className="space-y-4">
          <Section title="第1条 適用">
            <p>
              本規約は、本サービスを利用する病院、MSW、介護タクシー事業所、管理者その他の利用者に適用されます。
              利用者が所属組織の業務として本サービスを利用する場合、所属組織にも本規約が適用されます。
            </p>
          </Section>

          <Section title="第2条 サービスの内容">
            <p>
              本サービスは、介護タクシーの空き状況の確認、仮予約申請、予約の承認・却下、予約履歴の確認、事業所情報の管理などを支援するサービスです。
            </p>
            <p>
              本サービスは予約調整を支援するものであり、緊急搬送、医療判断、介護判断、運行の安全管理そのものを代行するものではありません。
            </p>
          </Section>

          <Section title="第3条 アカウント登録">
            <p>
              利用者は、正確な情報を登録し、変更があった場合はすみやかに更新するものとします。
              登録情報が不正確な場合、予約連絡や承認処理が正しく行えないことがあります。
            </p>
            <p>
              アカウント、パスワード、ログイン情報は利用者の責任で管理してください。第三者に共有してはいけません。
            </p>
          </Section>

          <Section title="第4条 MSW・病院側の責任">
            <p>
              MSW・病院側の利用者は、患者さまの氏名、住所、目的地、必要な機材、付き添い人数など、予約に必要な情報を正確に入力するものとします。
            </p>
            <p>
              患者さまに関する情報を入力する場合、業務上必要な範囲で、所属組織のルールに従って取り扱うものとします。
            </p>
          </Section>

          <Section title="第5条 介護タクシー事業所側の責任">
            <p>
              介護タクシー事業所は、必要な許認可、保険、車両、乗務員、運行体制を自らの責任で整えるものとします。
              本サービスへの掲載や予約承認は、運行の安全性や法令適合性を保証するものではありません。
            </p>
            <p>
              予約申請を確認した場合、事業所はすみやかに承認または却下を行い、必要に応じて利用者へ連絡するものとします。
            </p>
          </Section>

          <Section title="第6条 予約・キャンセル">
            <p>
              本サービス上の予約は、事業所が承認した時点で確定します。申請中の状態では、予約はまだ確定していません。
            </p>
            <p>
              予約内容の変更やキャンセルが必要な場合、利用者は本サービス上の操作または事業所への連絡により、できるだけ早く対応するものとします。
            </p>
          </Section>

          <Section title="第7条 料金・支払い">
            <p>
              事業所向けの利用料金、支払方法、請求時期、解約方法は、料金画面または別途提示する条件に従います。
              料金が変更される場合は、合理的な方法で事前に案内します。
            </p>
            <p>
              決済にクレジットカード等を利用する場合、カード番号などの決済情報は決済代行事業者が管理し、本サービスはカード番号を直接保存しません。
            </p>
            <p>
              事業所は、決済代行事業者が提供する契約者ポータルより、いつでも解約の手続きを行うことができます。解約の効力は、現在お支払い済みの請求期間の末日をもって生じるものとし、それまでの間は本サービスを引き続きご利用いただけます。
            </p>
            <p>
              解約時点までにお支払いいただいた料金について、日割りによる返金は行いません。初期費用についても同様に返金の対象外とします。
            </p>
            <p>
              クレジットカードの有効期限切れなどによりお支払いが確認できない場合も、原則として14日間は本サービスのご利用を継続いただけます。14日を超えてお支払いが確認できない場合、利用を制限することがあります。
            </p>
          </Section>

          <Section title="第8条 禁止事項">
            <ul className="list-disc space-y-2 pl-5">
              <li>虚偽の情報を登録する行為</li>
              <li>本人または業務上必要な範囲を超えて患者さまの情報を入力・閲覧する行為</li>
              <li>他人のアカウントを利用する行為</li>
              <li>本サービスや他の利用者に損害を与える行為</li>
              <li>法令、公序良俗、所属組織のルールに反する行為</li>
            </ul>
          </Section>

          <Section title="第9条 利用停止">
            <p>
              利用者が本規約に違反した場合、運営者はアカウントの停止、登録情報の削除、利用制限などの措置を行うことがあります。
            </p>
          </Section>

          <Section title="第10条 免責">
            <p>
              運営者は、本サービスの安定運用に努めますが、通信障害、システム保守、外部サービスの停止、災害その他やむを得ない事情により、一時的に利用できない場合があります。
            </p>
            <p>
              運行、送迎、患者さまへの対応、料金収受、事故対応などは、実際に対応する事業所および関係者の責任で行われるものとします。
            </p>
          </Section>

          <Section title="第11条 規約の変更">
            <p>
              運営者は、必要に応じて本規約を変更することがあります。重要な変更がある場合は、サービス内表示、メール、その他合理的な方法で案内します。
            </p>
          </Section>

          <Section title="第12条 準拠法・管轄">
            <p>
              本規約は日本法に従って解釈されます。本サービスに関して紛争が生じた場合は、運営者の所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </Section>

          <Section title="第13条 お問い合わせ">
            <p>
              本規約に関する問い合わせは、運営者がサービス内または別途表示する窓口までご連絡ください。
            </p>
          </Section>
        </div>
      </div>
    </main>
  )
}

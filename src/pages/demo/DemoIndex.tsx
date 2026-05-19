import { Link } from 'react-router-dom'
import { useState } from 'react'

type RoleKey = 'msw' | 'business' | 'admin'

type DemoLink = { to: string; title: string; desc: string; icon: string }

const LINKS_MSW: DemoLink[] = [
  { to: '/demo/msw/search',       title: '空き枠を検索して予約', desc: '希望日時・機材で絞り込み → 仮予約申請までを体験', icon: '🔍' },
  { to: '/demo/msw/reservations', title: '予約履歴',             desc: '申請中・確定・完了の予約を一覧で確認',           icon: '📋' },
  { to: '/demo/msw/businesses',   title: '事業所一覧',           desc: '登録事業所のプロフィール・対応エリアを確認',     icon: '🚗' },
]

const LINKS_BUSINESS: DemoLink[] = [
  { to: '/demo/business/calendar',     title: 'カレンダーで空き枠管理',   desc: '日付クリックで空き時間枠を追加・編集',                icon: '📅' },
  { to: '/demo/business/reservations', title: '予約管理（承認・却下）',   desc: 'MSWから届いた仮予約を確認 → 承認・却下を操作',         icon: '📋' },
  { to: '/demo/business/profile',      title: 'プロフィール設定',         desc: '営業時間・対応エリア・車両/設備を編集',                icon: '🏢' },
  { to: '/demo/business/billing',      title: '料金・契約状況',           desc: '初月扱い・月額料金・車両数による課金変化を確認',       icon: '💴' },
  { to: '/demo/business/register',     title: '事業所新規登録の流れ',     desc: '申請 → メール確認 → admin承認 → 利用開始の5ステップ', icon: '📝' },
]

const LINKS_ADMIN: DemoLink[] = [
  { to: '/demo/admin/approvals', title: '事業所承認管理', desc: '申請の審査・承認・却下／通知メール自動送信のシミュレーション', icon: '✅' },
  { to: '/demo/admin/billing',   title: '課金管理',       desc: '料金 override・無料契約（アクティベート）・Stripe同期の操作',  icon: '💴' },
]

const ROLE_META: Record<RoleKey, {
  label: string
  emoji: string
  accentBg: string
  hoverBg: string
  borderColor: string
  textColor: string
  description: string
  links: DemoLink[]
}> = {
  msw: {
    label: 'MSW（医療ソーシャルワーカー）',
    emoji: '🏥',
    accentBg: 'bg-sky-100',
    hoverBg: 'hover:bg-sky-50',
    borderColor: 'border-sky-200 hover:border-sky-400',
    textColor: 'text-sky-700',
    description: '退院搬送・通院搬送の介護タクシーを探して予約する立場',
    links: LINKS_MSW,
  },
  business: {
    label: '介護タクシー事業者',
    emoji: '🚐',
    accentBg: 'bg-teal-100',
    hoverBg: 'hover:bg-teal-50',
    borderColor: 'border-teal-200 hover:border-teal-400',
    textColor: 'text-teal-700',
    description: '空き枠を提供して予約を受ける立場',
    links: LINKS_BUSINESS,
  },
  admin: {
    label: '管理者（運営側）',
    emoji: '🛡️',
    accentBg: 'bg-purple-100',
    hoverBg: 'hover:bg-purple-50',
    borderColor: 'border-purple-200 hover:border-purple-400',
    textColor: 'text-purple-700',
    description: '事業所の承認や料金プランを管理する立場',
    links: LINKS_ADMIN,
  },
}

const SALES_STORY = [
  { role: 'msw',      label: 'MSW',    text: '空き枠を検索 → 仮予約申請', icon: '🔍' },
  { role: 'business', label: '事業者', text: '通知 → 予約管理で承認',     icon: '📋' },
  { role: 'msw',      label: 'MSW',    text: '予約履歴で確定を確認',      icon: '✅' },
  { role: 'business', label: '事業者', text: 'カレンダーに自動反映',      icon: '📅' },
]

export default function DemoIndex() {
  const [role, setRole] = useState<RoleKey>('msw')
  const meta = ROLE_META[role]

  return (
    <div
      className="min-h-screen relative"
      style={{ backgroundImage: "url('/setomusubi-bg.jpg')", backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 backdrop-blur-sm bg-white/30" />

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Brand */}
        <div className="text-center">
          <h1 className="font-display text-4xl font-black text-teal-800 drop-shadow-sm tracking-wide">せとむすび</h1>
          <p className="text-slate-700 text-sm mt-1 font-medium">介護タクシー×医療機関 予約プラットフォーム</p>
        </div>

        {/* Demo Banner */}
        <div className="bg-amber-400/90 backdrop-blur-sm rounded-2xl px-5 py-3 text-center border border-amber-300 shadow">
          <p className="text-amber-900 font-bold text-sm">⚡ デモモード</p>
          <p className="text-amber-800 text-xs mt-0.5">ログイン不要・オフラインで全機能を操作できます。データは保存されません。</p>
        </div>

        {/* 営業ストーリー */}
        <div className="bg-white/85 backdrop-blur-md rounded-2xl shadow-sm p-5">
          <p className="text-xs text-slate-400 mb-2">🎯 営業時の流れ（参考）</p>
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
            {SALES_STORY.map((s, i) => (
              <div key={i} className="flex items-center flex-shrink-0">
                <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg ${
                  s.role === 'msw' ? 'bg-sky-50' : 'bg-teal-50'
                }`}>
                  <span className="text-base">{s.icon}</span>
                  <span className={`text-[10px] font-bold ${s.role === 'msw' ? 'text-sky-700' : 'text-teal-700'}`}>
                    {s.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 px-1 max-w-[110px] leading-tight">{s.text}</p>
                {i < SALES_STORY.length - 1 && <span className="text-slate-300 text-xs">→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Role Selector Tabs */}
        <div className="bg-white rounded-2xl shadow-auth overflow-hidden">
          <div className="flex border-b border-slate-100">
            {(['msw', 'business', 'admin'] as const).map(r => {
              const m = ROLE_META[r]
              const active = role === r
              return (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={`flex-1 px-3 py-3 text-sm font-bold transition-colors ${
                    active
                      ? `${m.accentBg} ${m.textColor} border-b-2 border-current`
                      : 'text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <div className="text-xl">{m.emoji}</div>
                  <div className="text-xs mt-0.5">{r === 'msw' ? 'MSW' : r === 'business' ? '事業者' : '管理者'}</div>
                </button>
              )
            })}
          </div>

          <div className="p-5">
            <div className="text-center mb-4">
              <p className="text-sm font-bold text-slate-800">{meta.label}</p>
              <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
            </div>

            <div className="space-y-2">
              {meta.links.map(link => (
                <Link key={link.to} to={link.to} className="block">
                  <div className={`border-2 rounded-xl p-3 transition-colors cursor-pointer ${meta.borderColor} ${meta.hoverBg}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-11 h-11 rounded-xl ${meta.accentBg} flex items-center justify-center text-xl flex-shrink-0`}>
                        {link.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm">{link.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-snug">{link.desc}</p>
                      </div>
                      <span className={`${meta.textColor} text-lg`}>→</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Links */}
        <div className="bg-white/75 backdrop-blur-md rounded-2xl px-5 py-3 space-y-1.5 text-center text-sm text-slate-700 shadow-sm">
          <p>
            <Link to="/login" className="text-teal-700 hover:text-teal-900 font-semibold">
              ← ログインページに戻る
            </Link>
          </p>
          <p>
            <Link to="/manual" target="_blank" className="text-teal-700 hover:text-teal-900 font-semibold">
              📖 使い方ガイドを見る（PDF保存可）
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

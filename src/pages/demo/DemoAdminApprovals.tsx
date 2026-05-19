import { useState } from 'react'
import DemoLayout from './DemoLayout'
import { INITIAL_DEMO_APPROVAL_QUEUE, type DemoApprovalBusiness } from './demoData'

type ConfirmState = { id: string; action: 'approve' | 'reject' } | null
type MailPreview = { kind: 'approved' | 'rejected'; to: string; bizName: string } | null

function fmtElapsed(hoursAgo: number) {
  if (hoursAgo < 1) return '〜1時間以内'
  if (hoursAgo < 24) return `${Math.floor(hoursAgo)}時間経過`
  return `${Math.floor(hoursAgo / 24)}日${Math.floor(hoursAgo % 24)}時間経過`
}

export default function DemoAdminApprovals() {
  const [businesses, setBusinesses] = useState<DemoApprovalBusiness[]>(INITIAL_DEMO_APPROVAL_QUEUE)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)
  const [mailPreview, setMailPreview] = useState<MailPreview>(null)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2800)
  }

  const handleApprove = (biz: DemoApprovalBusiness) => {
    setBusinesses(prev => prev.map(b => b.id === biz.id ? { ...b, approved: true } : b))
    setConfirmState(null)
    setMailPreview({ kind: 'approved', to: biz.email, bizName: biz.name })
    showToast('事業所を承認しました（メール通知も自動送信）')
  }

  const handleReject = (biz: DemoApprovalBusiness) => {
    setBusinesses(prev => prev.filter(b => b.id !== biz.id))
    setConfirmState(null)
    setMailPreview({ kind: 'rejected', to: biz.email, bizName: biz.name })
    showToast('事業所を却下・削除しました（通知メールも自動送信）')
  }

  const pending = businesses.filter(b => !b.approved)
  const approved = businesses.filter(b => b.approved)
  const list = tab === 'pending' ? pending : approved

  return (
    <DemoLayout role="admin">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium shadow-lg">
          {toast}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-800 mb-1">事業所承認管理</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">登録申請が届いた事業所を審査・承認します。承認するとMSWの検索結果に表示されるようになります。</p>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === t ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {t === 'pending' ? '承認待ち' : '承認済み'}
            {t === 'pending' && pending.length > 0 && (
              <span className={`text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                tab === 'pending' ? 'bg-white text-purple-600' : 'bg-red-500 text-white'
              }`}>
                {pending.length}
              </span>
            )}
            {t === 'approved' && (
              <span className="text-xs opacity-60">({approved.length})</span>
            )}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card text-center py-8 text-slate-400 text-sm">
          {tab === 'pending' ? '承認待ちの事業所はありません' : '承認済みの事業所はありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(biz => {
            const isUrgent = biz.applied_hours_ago >= 12
            return (
              <div key={biz.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-xl font-bold text-slate-800">{biz.name}</h3>
                      {biz.approved ? (
                        <span className="badge-green">承認済み</span>
                      ) : (
                        <span className="badge-red">承認待ち</span>
                      )}
                      {!biz.approved && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          isUrgent ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {fmtElapsed(biz.applied_hours_ago)}
                        </span>
                      )}
                    </div>
                    <p className="text-base font-medium text-slate-600 leading-relaxed">{biz.address} ／ {biz.phone}</p>
                    <p className="text-sm text-slate-500 mt-1">📧 {biz.email}</p>
                    <p className="text-sm text-slate-500 mt-1">対応エリア: {biz.service_areas.join('・')}</p>
                  </div>

                  {!biz.approved && confirmState?.id !== biz.id && (
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => setConfirmState({ id: biz.id, action: 'approve' })}
                        className="btn-primary text-sm px-4 py-1.5 min-w-[60px]"
                      >
                        承認
                      </button>
                      <button
                        onClick={() => setConfirmState({ id: biz.id, action: 'reject' })}
                        className="btn-danger text-sm px-4 py-1.5 min-w-[60px]"
                      >
                        却下
                      </button>
                    </div>
                  )}
                </div>

                {confirmState?.id === biz.id && (
                  <div className={`mt-3 pt-3 border-t rounded-xl p-3 ${
                    confirmState.action === 'reject'
                      ? 'bg-red-50 border-red-200'
                      : 'bg-teal-50 border-teal-200'
                  }`}>
                    <p className={`text-sm font-medium text-center mb-2 ${
                      confirmState.action === 'reject' ? 'text-red-700' : 'text-teal-700'
                    }`}>
                      {confirmState.action === 'approve'
                        ? 'この事業所を承認しますか？通知メールも自動送信されます。'
                        : '却下・削除します。事業所には却下理由のメールが送られます。'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmState(null)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => confirmState.action === 'approve' ? handleApprove(biz) : handleReject(biz)}
                        className={`flex-1 text-sm px-4 py-2 rounded-xl font-semibold text-white transition-colors ${
                          confirmState.action === 'reject'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-teal-600 hover:bg-teal-700'
                        }`}
                      >
                        {confirmState.action === 'approve' ? '承認する' : '却下する'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* メール送信プレビューモーダル */}
      {mailPreview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setMailPreview(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="bg-purple-600 text-white px-4 py-3 rounded-t-xl flex items-center justify-between">
              <span className="font-bold text-base">📧 自動送信されたメール（デモ）</span>
              <button onClick={() => setMailPreview(null)} className="text-white/80 hover:text-white text-xl w-8 h-8 flex items-center justify-center">×</button>
            </div>
            <div className="p-5">
              <div className="text-sm text-slate-500 space-y-1 border-b pb-3">
                <p><span className="text-slate-400">From:</span> せとむすび &lt;noreply@send.hakobite-marugame.com&gt;</p>
                <p><span className="text-slate-400">To:</span> {mailPreview.to}</p>
                <p><span className="text-slate-400">Subject:</span> 【せとむすび】{mailPreview.kind === 'approved' ? '事業所登録が承認されました' : '事業所登録申請について'}</p>
              </div>
              <div className="mt-4 text-sm text-slate-700 whitespace-pre-line leading-relaxed">
{mailPreview.kind === 'approved'
  ? `${mailPreview.bizName} 様

ご登録いただいた事業所が管理者により承認されました。
以下のURLからログインしてサービスをご利用ください。

▶ ログイン
https://setomusubi.vercel.app/login

ログイン後は「プロフィール設定」から対応エリア・設備情報を入力し、
「カレンダー」から空き時間枠を登録するとMSWからの申請が届きます。

せとむすび`
  : `${mailPreview.bizName} 様

ご登録いただいた事業所申請につきまして、
今回は承認を見送らせていただくこととなりました。

ご質問・ご不明な点がございましたら、
このメールへ返信の形でお問い合わせください。

せとむすび`}
              </div>
              <button onClick={() => setMailPreview(null)} className="btn-secondary w-full mt-4">閉じる</button>
            </div>
          </div>
        </div>
      )}
    </DemoLayout>
  )
}

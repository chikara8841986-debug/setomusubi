import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { LINE_FRIEND_URL } from '../lib/constants'

// F3: 通知設定カード。事業所プロフィール・病院プロフィールの両方から使う共有コンポーネント。
// メール通知(既定ON)に加え、LINE公式アカウントとの友だち連携でLINE通知も受け取れるようにする。

type NotifyRow = {
  line_user_id: string | null
  notify_line: boolean
  notify_email: boolean
}

export default function LineLinkCard() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(true)
  const [row, setRow] = useState<NotifyRow | null>(null)
  const [linkCode, setLinkCode] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [checking, setChecking] = useState(false)

  const fetchRow = async (): Promise<NotifyRow | null> => {
    if (!user) return null
    const { data } = await supabase
      .from('profiles')
      .select('line_user_id, notify_line, notify_email')
      .eq('id', user.id)
      .single()
    if (data) setRow(data)
    return data ?? null
  }

  useEffect(() => {
    fetchRow().finally(() => setLoading(false))
  }, [user])

  const handleGenerateCode = async () => {
    setGenerating(true)
    const { data, error } = await supabase.rpc('generate_line_link_code')
    setGenerating(false)
    if (error || !data) {
      showToast('コードの発行に失敗しました。再試行してください。', 'error')
      return
    }
    setLinkCode(data)
  }

  const handleCheckStatus = async () => {
    setChecking(true)
    const fresh = await fetchRow()
    setChecking(false)
    if (fresh?.line_user_id) {
      setLinkCode(null)
      showToast('LINE連携が完了しました')
    } else {
      showToast('まだ連携が確認できていません。コードを送信したか確認してください', 'error')
    }
  }

  const handleUnlink = async () => {
    if (!user) return
    const { error } = await supabase
      .from('profiles')
      .update({ line_user_id: null, notify_line: false })
      .eq('id', user.id)
    if (error) {
      showToast('連携解除に失敗しました', 'error')
      return
    }
    showToast('LINE連携を解除しました')
    fetchRow()
  }

  const toggleNotifyLine = async (checked: boolean) => {
    if (!user) return
    setRow((r) => (r ? { ...r, notify_line: checked } : r))
    const { error } = await supabase.from('profiles').update({ notify_line: checked }).eq('id', user.id)
    if (error) { showToast('設定の保存に失敗しました', 'error'); fetchRow() }
  }

  const toggleNotifyEmail = async (checked: boolean) => {
    if (!user) return
    setRow((r) => (r ? { ...r, notify_email: checked } : r))
    const { error } = await supabase.from('profiles').update({ notify_email: checked }).eq('id', user.id)
    if (error) { showToast('設定の保存に失敗しました', 'error'); fetchRow() }
  }

  if (loading || !row) return null

  return (
    <div className="card space-y-3">
      <div className="border-b pb-2">
        <h2 className="text-lg font-bold text-slate-700">通知設定</h2>
        <p className="text-sm text-slate-500 mt-1">予約に関する通知の受け取り方法を設定できます</p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-teal-600"
          checked={row.notify_email}
          onChange={(e) => toggleNotifyEmail(e.target.checked)}
        />
        <span className="text-sm text-slate-700">メール通知を受け取る</span>
      </label>

      {row.line_user_id ? (
        <div className="space-y-2 pt-1">
          <p className="text-sm text-teal-700 font-medium">✓ LINE連携済み</p>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded border-slate-300 text-teal-600"
              checked={row.notify_line}
              onChange={(e) => toggleNotifyLine(e.target.checked)}
            />
            <span className="text-sm text-slate-700">LINE通知を受け取る</span>
          </label>
          <button type="button" onClick={handleUnlink} className="text-xs text-red-500 hover:underline">
            連携を解除する
          </button>
        </div>
      ) : linkCode ? (
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-700">
            ①{' '}
            <a href={LINE_FRIEND_URL} target="_blank" rel="noopener noreferrer" className="text-teal-700 underline font-medium">
              LINE公式アカウント「せとむすび」を友だち追加
            </a>
          </p>
          <p className="text-sm text-slate-700">② トーク画面で下のコードを送信してください（10分間有効）</p>
          <div className="text-center text-2xl font-bold tracking-widest bg-white border border-teal-300 rounded-lg py-3">
            {linkCode}
          </div>
          <button type="button" onClick={handleCheckStatus} disabled={checking} className="btn-secondary w-full text-sm">
            {checking ? '確認中...' : '連携状況を確認する'}
          </button>
        </div>
      ) : (
        <button type="button" onClick={handleGenerateCode} disabled={generating} className="btn-primary w-full text-sm">
          {generating ? '発行中...' : 'LINEと連携する'}
        </button>
      )}
    </div>
  )
}

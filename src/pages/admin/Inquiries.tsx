import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import type { Inquiry } from '../../types/database'

type StatusTab = 'new' | 'in_progress' | 'done' | 'all'

const STATUS_LABEL: Record<Inquiry['status'], string> = {
  new: '未対応',
  in_progress: '対応中',
  done: '対応済み',
}

const STATUS_BADGE_CLASS: Record<Inquiry['status'], string> = {
  new: 'badge-red',
  in_progress: 'badge-blue',
  done: 'badge-green',
}

export default function AdminInquiries() {
  const { showToast } = useToast()
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<StatusTab>('new')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const fetchAll = async () => {
    setLoadError(false)
    const { data, error } = await supabase
      .from('inquiries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setLoadError(true); setLoading(false); return }
    setInquiries(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handleStatusChange = async (id: string, status: Inquiry['status']) => {
    setUpdating(id)
    const { error } = await supabase.from('inquiries').update({ status }).eq('id', id)
    if (error) {
      showToast('更新に失敗しました。再試行してください。', 'error')
      setUpdating(null)
      return
    }
    setInquiries((current) => current.map((inq) => (inq.id === id ? { ...inq, status } : inq)))
    setUpdating(null)
    showToast('ステータスを更新しました')
  }

  const counts = {
    new: inquiries.filter((i) => i.status === 'new').length,
    in_progress: inquiries.filter((i) => i.status === 'in_progress').length,
    done: inquiries.filter((i) => i.status === 'done').length,
  }

  const list = tab === 'all' ? inquiries : inquiries.filter((i) => i.status === tab)

  if (loading) return <div className="flex flex-col items-center justify-center py-16 gap-3"><span className="spinner" /><p className="text-sm text-slate-400">読み込み中...</p></div>
  if (loadError) return (
    <div className="card text-center py-10">
      <div className="text-3xl mb-2">😵</div><p className="text-slate-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchAll} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-800 mb-1">お問い合わせ一覧</h1>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        Webフォームから届いた問い合わせを確認・対応管理します。返信はここに表示されたメールアドレス宛に直接送ってください。
      </p>

      <div className="flex gap-2 mb-4 flex-wrap">
        {([
          { key: 'new' as const, label: '未対応' },
          { key: 'in_progress' as const, label: '対応中' },
          { key: 'done' as const, label: '対応済み' },
          { key: 'all' as const, label: 'すべて' },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setExpanded(null) }}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === t.key ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
            }`}
          >
            {t.label}
            {t.key === 'new' && counts.new > 0 && (
              <span className={`text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                tab === 'new' ? 'bg-white text-teal-600' : 'bg-red-500 text-white'
              }`}>
                {counts.new}
              </span>
            )}
            {t.key === 'in_progress' && counts.in_progress > 0 && (
              <span className="text-xs opacity-60">({counts.in_progress})</span>
            )}
            {t.key === 'done' && counts.done > 0 && (
              <span className="text-xs opacity-60">({counts.done})</span>
            )}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card text-center py-8 text-slate-400 text-sm">
          {tab === 'new' ? '未対応のお問い合わせはありません' : '該当するお問い合わせはありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((inq) => {
            const isExpanded = expanded === inq.id
            const bodyPreview = inq.body.length > 80 && !isExpanded ? `${inq.body.slice(0, 80)}...` : inq.body
            return (
              <div key={inq.id} className="card">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="text-lg font-bold text-slate-800">{inq.name}</h3>
                      <span className={STATUS_BADGE_CLASS[inq.status]}>{STATUS_LABEL[inq.status]}</span>
                      {inq.user_id && <span className="badge-blue">ログイン済みユーザー</span>}
                    </div>
                    <a href={`mailto:${inq.email}`} className="text-sm text-teal-700 hover:underline font-medium">
                      {inq.email}
                    </a>
                    <p className="text-xs text-slate-400 mt-0.5">
                      受信: {format(parseISO(inq.created_at), 'yyyy/M/d HH:mm', { locale: ja })}
                    </p>
                  </div>

                  <select
                    value={inq.status}
                    disabled={updating === inq.id}
                    onChange={(e) => handleStatusChange(inq.id, e.target.value as Inquiry['status'])}
                    className="input-base w-auto text-sm py-1.5"
                  >
                    <option value="new">未対応</option>
                    <option value="in_progress">対応中</option>
                    <option value="done">対応済み</option>
                  </select>
                </div>

                <p className="mt-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{bodyPreview}</p>
                {inq.body.length > 80 && (
                  <button
                    onClick={() => setExpanded(isExpanded ? null : inq.id)}
                    className="mt-1 text-xs font-semibold text-teal-700 hover:underline"
                  >
                    {isExpanded ? '閉じる' : '全文を表示'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

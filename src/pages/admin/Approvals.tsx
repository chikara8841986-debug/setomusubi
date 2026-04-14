import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import { useToast } from '../../contexts/ToastContext'
import type { Business } from '../../types/database'

const EQUIPMENT_MAP = [
  { key: 'has_wheelchair', label: '車椅子対応' },
  { key: 'has_reclining_wheelchair', label: 'リクライニング対応' },
  { key: 'has_stretcher', label: 'ストレッチャー対応' },
  { key: 'rental_wheelchair', label: '車椅子貸出' },
  { key: 'rental_reclining_wheelchair', label: 'リクライニング貸出' },
  { key: 'rental_stretcher', label: 'ストレッチャー貸出' },
  { key: 'has_female_caregiver', label: '女性介護者在籍' },
  { key: 'long_distance', label: '長距離対応' },
  { key: 'same_day', label: '当日対応' },
] as const

type ConfirmState = { id: string; action: 'approve' | 'reject' } | null

export default function AdminApprovals() {
  const { showToast } = useToast()
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [processing, setProcessing] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [confirmState, setConfirmState] = useState<ConfirmState>(null)

  const fetchAll = async () => {
    setLoadError(false)
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { setLoadError(true); setLoading(false); return }
    setBusinesses(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  const handleApprove = async (id: string) => {
    setProcessing(id)
    setConfirmState(null)
    await supabase.from('businesses').update({ approved: true }).eq('id', id)
    supabase.functions.invoke('send-business-approved', { body: { business_id: id } }).catch(() => {})
    await fetchAll()
    setProcessing(null)
    showToast('事業所を承認しました')
  }

  const handleReject = async (id: string) => {
    setProcessing(id)
    setConfirmState(null)
    const { data: biz } = await supabase.from('businesses').select('user_id').eq('id', id).single()
    await supabase.from('businesses').delete().eq('id', id)
    if (biz) await supabase.from('profiles').delete().eq('id', biz.user_id)
    await fetchAll()
    setProcessing(null)
    showToast('事業所を却下・削除しました', 'error')
  }

  const pending = businesses.filter(b => !b.approved)
  const approved = businesses.filter(b => b.approved)
  const list = tab === 'pending' ? pending : approved

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchAll} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">事業所承認管理</h1>
      <p className="text-xs text-gray-400 mb-4">登録申請が届いた事業所を審査・承認します</p>

      <div className="flex gap-2 mb-4">
        {(['pending', 'approved'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === t ? 'bg-teal-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
            }`}
          >
            {t === 'pending' ? '承認待ち' : '承認済み'}
            {t === 'pending' && pending.length > 0 && (
              <span className={`text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold ${
                tab === 'pending' ? 'bg-white text-teal-600' : 'bg-red-500 text-white'
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
        <div className="card text-center py-8 text-gray-400 text-sm">
          {tab === 'pending' ? '承認待ちの事業所はありません' : '承認済みの事業所はありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(biz => {
            const isExpanded = expanded === biz.id
            const features = EQUIPMENT_MAP.filter(e => biz[e.key as keyof Business])
            const hoursElapsed =
              (Date.now() - new Date(biz.created_at).getTime()) / (1000 * 60 * 60)
            const elapsedLabel = hoursElapsed < 1
              ? '〜1時間以内'
              : hoursElapsed < 24
              ? `${Math.floor(hoursElapsed)}時間経過`
              : `${Math.floor(hoursElapsed / 24)}日${Math.floor(hoursElapsed % 24)}時間経過`
            return (
              <div key={biz.id} className="card">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-900">{biz.name}</h3>
                      {biz.approved
                        ? <span className="badge-green">承認済み</span>
                        : <span className="badge-red">承認待ち</span>
                      }
                      {!biz.approved && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          hoursElapsed >= 12
                            ? 'bg-red-100 text-red-600'
                            : hoursElapsed >= 6
                            ? 'bg-orange-100 text-orange-600'
                            : hoursElapsed >= 3
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {elapsedLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">{biz.address ?? '住所未設定'} ／ {biz.phone ?? '電話番号未設定'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      登録: {format(parseISO(biz.created_at), 'yyyy/M/d HH:mm', { locale: ja })}
                    </p>
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {!biz.approved && confirmState?.id !== biz.id && (
                      <>
                        <button
                          onClick={() => setConfirmState({ id: biz.id, action: 'approve' })}
                          disabled={processing === biz.id}
                          className="btn-primary text-sm px-4 py-1.5 min-w-[60px]"
                        >
                          {processing === biz.id ? '...' : '承認'}
                        </button>
                        <button
                          onClick={() => setConfirmState({ id: biz.id, action: 'reject' })}
                          disabled={processing === biz.id}
                          className="btn-danger text-sm px-4 py-1.5 min-w-[60px]"
                        >
                          却下
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : biz.id)}
                      className="text-xs text-teal-700 hover:underline text-center"
                    >
                      {isExpanded ? '閉じる' : '詳細'}
                    </button>
                  </div>
                </div>

                {/* Inline confirmation */}
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
                        ? 'この事業所を承認しますか？'
                        : '却下・削除します。この操作は取り消せません。'}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirmState(null)}
                        className="btn-secondary flex-1 text-sm"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={() => confirmState.action === 'approve' ? handleApprove(biz.id) : handleReject(biz.id)}
                        disabled={processing === biz.id}
                        className={`flex-1 text-sm px-4 py-2 rounded-xl font-semibold text-white disabled:opacity-50 transition-colors ${
                          confirmState.action === 'reject'
                            ? 'bg-red-600 hover:bg-red-700'
                            : 'bg-teal-600 hover:bg-teal-700'
                        }`}
                      >
                        {processing === biz.id ? '処理中...' : confirmState.action === 'approve' ? '承認する' : '却下する'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Expanded details */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-2 text-xs text-gray-600">
                    {biz.service_areas?.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">対応エリア: </span>
                        <span>{biz.service_areas.join('・')}</span>
                      </div>
                    )}
                    {features.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {features.map(f => (
                          <span key={f.key} className="badge-blue">{f.label}</span>
                        ))}
                      </div>
                    )}
                    {biz.business_hours_start && (
                      <div>
                        <span className="font-medium text-gray-700">営業時間: </span>
                        <span>{biz.business_hours_start.slice(0,5)}〜{biz.business_hours_end?.slice(0,5)}</span>
                      </div>
                    )}
                    {biz.cancel_phone && (
                      <div>
                        <span className="font-medium text-gray-700">キャンセル連絡先: </span>
                        <a href={`tel:${biz.cancel_phone}`} className="text-teal-700">{biz.cancel_phone}</a>
                      </div>
                    )}
                    {biz.pricing && (
                      <div>
                        <span className="font-medium text-gray-700">料金: </span>
                        <span>{biz.pricing}</span>
                      </div>
                    )}
                    {biz.qualifications && (
                      <div>
                        <span className="font-medium text-gray-700">資格・特徴: </span>
                        <span>{biz.qualifications}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

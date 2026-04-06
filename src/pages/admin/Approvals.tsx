import { useState, useEffect } from 'react'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { supabase } from '../../lib/supabase'
import type { Business } from '../../types/database'

export default function AdminApprovals() {
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pending' | 'approved'>('pending')
  const [processing, setProcessing] = useState<string | null>(null)

  const fetch = async () => {
    const { data } = await supabase
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false })
    setBusinesses(data ?? [])
    setLoading(false)
  }

  useEffect(() => { fetch() }, [])

  const handleApprove = async (id: string) => {
    if (!confirm('この事業所を承認しますか？')) return
    setProcessing(id)
    await supabase.from('businesses').update({ approved: true }).eq('id', id)
    await fetch()
    setProcessing(null)
  }

  const handleReject = async (id: string) => {
    if (!confirm('この事業所を却下・削除しますか？この操作は取り消せません。')) return
    setProcessing(id)
    // Get user_id first
    const { data: biz } = await supabase.from('businesses').select('user_id').eq('id', id).single()
    await supabase.from('businesses').delete().eq('id', id)
    if (biz) await supabase.from('profiles').delete().eq('id', biz.user_id)
    await fetch()
    setProcessing(null)
  }

  const pending = businesses.filter(b => !b.approved)
  const approved = businesses.filter(b => b.approved)
  const list = tab === 'pending' ? pending : approved

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-4">事業所承認管理</h1>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'pending' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          承認待ち
          {pending.length > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 inline-flex items-center justify-center">
              {pending.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('approved')}
          className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            tab === 'approved' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border border-gray-200'
          }`}
        >
          承認済み ({approved.length})
        </button>
      </div>

      {list.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          {tab === 'pending' ? '承認待ちの事業所はありません' : '承認済みの事業所はありません'}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map(biz => (
            <div key={biz.id} className="card">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{biz.name}</h3>
                    {biz.approved ? <span className="badge-green">承認済み</span> : <span className="badge-red">承認待ち</span>}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{biz.address ?? '住所未設定'}</p>
                  <p className="text-xs text-gray-500">{biz.phone ?? '電話番号未設定'}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    登録日: {format(parseISO(biz.created_at), 'yyyy年M月d日', { locale: ja })}
                  </p>
                  {biz.service_areas?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {biz.service_areas.map(a => (
                        <span key={a} className="badge-gray">{a}</span>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    {biz.has_wheelchair && <span className="badge-blue">車椅子</span>}
                    {biz.has_reclining_wheelchair && <span className="badge-blue">リクライニング</span>}
                    {biz.has_stretcher && <span className="badge-blue">ストレッチャー</span>}
                    {biz.has_female_caregiver && <span className="badge-green">女性介護者</span>}
                    {biz.long_distance && <span className="badge-gray">長距離</span>}
                    {biz.same_day && <span className="badge-gray">当日対応</span>}
                  </div>
                </div>
                {!biz.approved && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApprove(biz.id)}
                      disabled={processing === biz.id}
                      className="btn-primary text-sm px-4 py-1.5"
                    >
                      承認
                    </button>
                    <button
                      onClick={() => handleReject(biz.id)}
                      disabled={processing === biz.id}
                      className="btn-danger text-sm px-4 py-1.5"
                    >
                      却下
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import type { MswContact } from '../../types/database'

export default function MswContacts() {
  const { hospitalId } = useAuth()
  const { showToast } = useToast()
  const [contacts, setContacts] = useState<MswContact[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  const [loadError, setLoadError] = useState(false)
  // 担当者名 → 進行中予約件数のマップ
  const [activeResCounts, setActiveResCounts] = useState<Record<string, number>>({})

  const fetchContacts = async () => {
    if (!hospitalId) return
    setLoadError(false)
    const { data, error } = await supabase
      .from('msw_contacts')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('created_at')
    if (error) { setLoadError(true); setLoading(false); return }
    const list = data ?? []
    setContacts(list)
    setLoading(false)

    // 各担当者の進行中予約件数を取得
    if (list.length > 0) {
      const { data: resData } = await supabase
        .from('reservations')
        .select('contact_name')
        .eq('hospital_id', hospitalId)
        .in('status', ['pending', 'confirmed'])
      if (resData) {
        const counts: Record<string, number> = {}
        for (const r of resData) {
          counts[r.contact_name] = (counts[r.contact_name] ?? 0) + 1
        }
        setActiveResCounts(counts)
      }
    }
  }

  useEffect(() => { fetchContacts() }, [hospitalId])

  const handleAdd = async () => {
    const name = newName.trim()
    if (!name) { setAddError('名前を入力してください'); return }
    if (!hospitalId) return
    setAdding(true)
    setAddError('')
    const { error } = await supabase
      .from('msw_contacts')
      .insert({ hospital_id: hospitalId, name })
    if (error) {
      setAddError('追加に失敗しました: ' + error.message)
    } else {
      setNewName('')
      showToast('担当者を追加しました')
      await fetchContacts()
    }
    setAdding(false)
  }

  const handleDelete = async (id: string) => {
    setDeleteConfirmId(null)
    setDeletingId(id)
    await supabase.from('msw_contacts').delete().eq('id', id)
    setContacts(prev => prev.filter(c => c.id !== id))
    setDeletingId(null)
    showToast('担当者を削除しました', 'error')
  }

  const startEdit = (contact: MswContact) => {
    setEditingId(contact.id)
    setEditName(contact.name)
  }

  const handleSaveEdit = async () => {
    const name = editName.trim()
    if (!name || !editingId) return
    setSavingEdit(true)
    await supabase.from('msw_contacts').update({ name }).eq('id', editingId)
    setContacts(prev => prev.map(c => c.id === editingId ? { ...c, name } : c))
    setEditingId(null)
    setSavingEdit(false)
    showToast('担当者名を更新しました')
  }

  if (loading) return <div className="text-center py-12 text-gray-400">読み込み中...</div>
  if (loadError) return (
    <div className="card text-center py-10">
      <p className="text-gray-500 text-sm mb-3">データの取得に失敗しました</p>
      <button onClick={fetchContacts} className="btn-secondary text-sm">再試行</button>
    </div>
  )

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">担当者管理</h1>
      <p className="text-xs text-gray-400 mb-5">予約時に選択できる担当者一覧を管理します</p>

      {/* Add new */}
      <div className="card mb-4">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">担当者を追加</h2>
        <div className="flex gap-2">
          <input
            type="text"
            className="input-base flex-1"
            placeholder="担当者名（例: 山田 花子）"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="btn-primary whitespace-nowrap"
          >
            {adding ? '追加中...' : '追加'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-600 mt-2">{addError}</p>}
      </div>

      {/* List */}
      {contacts.length === 0 ? (
        <div className="card text-center py-8 text-gray-400 text-sm">
          担当者が登録されていません
        </div>
      ) : (
        <div className="card">
          <p className="text-xs text-gray-400 mb-3">{contacts.length}名登録済み</p>
          <ul className="divide-y divide-gray-100">
            {contacts.map(contact => (
              <li key={contact.id} className="py-3 flex items-center gap-3">
                {editingId === contact.id ? (
                  <>
                    <input
                      type="text"
                      className="input-base flex-1 py-1.5 text-sm"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit() }}
                      autoFocus
                    />
                    <button
                      onClick={handleSaveEdit}
                      disabled={savingEdit}
                      className="btn-primary text-xs px-3 py-1.5 whitespace-nowrap"
                    >
                      {savingEdit ? '...' : '保存'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn-secondary text-xs px-3 py-1.5"
                    >
                      取消
                    </button>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 text-xs font-bold flex-shrink-0">
                      {contact.name.slice(0, 1)}
                    </div>
                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-sm text-gray-900 font-medium">{contact.name}</span>
                      {(activeResCounts[contact.name] ?? 0) > 0 && (
                        <span className="text-[10px] bg-teal-50 border border-teal-200 text-teal-700 px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0"
                          title="進行中の予約で使用中">
                          申請中/確定 {activeResCounts[contact.name]}件
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => startEdit(contact)}
                      className="text-xs text-gray-400 hover:text-teal-700 px-2 py-1 transition-colors"
                    >
                      編集
                    </button>
                    {deleteConfirmId === contact.id ? (
                      <div className="flex flex-col items-end gap-1">
                        {(activeResCounts[contact.name] ?? 0) > 0 && (
                          <p className="text-[10px] text-amber-600">進行中の予約があります</p>
                        )}
                        <div className="flex gap-1">
                          <button onClick={() => setDeleteConfirmId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1.5 py-1">戻る</button>
                          <button
                            onClick={() => handleDelete(contact.id)}
                            disabled={deletingId === contact.id}
                            className="text-xs text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg font-medium"
                          >{deletingId === contact.id ? '...' : '削除確定'}</button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirmId(contact.id)}
                        disabled={deletingId === contact.id}
                        className="text-xs text-gray-400 hover:text-red-500 px-2 py-1 transition-colors"
                      >
                        {deletingId === contact.id ? '...' : '削除'}
                      </button>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

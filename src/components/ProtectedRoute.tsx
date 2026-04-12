import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { UserRole } from '../types/database'

type Props = {
  children: React.ReactNode
  allowedRoles?: UserRole[]
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { user, role, businessApproved, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && role && !allowedRoles.includes(role)) {
    if (role === 'business') return <Navigate to="/business/calendar" replace />
    if (role === 'msw') return <Navigate to="/msw/search" replace />
    if (role === 'admin') return <Navigate to="/admin/approvals" replace />
  }

  // Business pending approval
  if (role === 'business' && !businessApproved) {
    return <PendingApproval userId={user.id} />
  }

  return <>{children}</>
}

function PendingApproval({ userId }: { userId: string }) {
  const { signOut } = useAuth()

  // Realtime: reload when admin approves this business
  useEffect(() => {
    const channel = supabase
      .channel('approval-watch-' + userId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'businesses',
        filter: `user_id=eq.${userId}`,
      }, (payload) => {
        if (payload.new?.approved === true) {
          window.location.reload()
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        <div className="text-5xl mb-4">⏳</div>
        <h1 className="text-2xl font-bold text-teal-700 mb-2">せとむすび</h1>
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">承認待ちです</h2>
          <p className="text-sm text-gray-600 mb-4">
            管理者が事業所登録を確認中です。<br />
            承認が完了するまでしばらくお待ちください。
          </p>
          <p className="text-xs text-gray-400 mb-6">
            承認が完了すると、このページが自動的に切り替わります。
          </p>
          <button
            onClick={() => signOut()}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            ログアウト
          </button>
        </div>
      </div>
    </div>
  )
}

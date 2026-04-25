import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function NotFound() {
  const { role } = useAuth()
  const home = role === 'business' ? '/business/calendar'
    : role === 'msw' ? '/msw/search'
    : role === 'admin' ? '/admin/approvals'
    : '/login'

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-emerald-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🌊</div>
        <h1 className="text-2xl font-bold text-teal-700 mb-2">せとむすび</h1>
        <p className="text-slate-500 text-sm mb-6">ページが見つかりませんでした</p>
        <Link to={home} className="btn-primary inline-block">
          トップへ戻る
        </Link>
      </div>
    </div>
  )
}

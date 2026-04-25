import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const PAGE_TITLES: Record<string, string> = {
  '/business/calendar':     'カレンダー',
  '/business/reservations': '予約管理',
  '/business/introduction': '紹介ページ',
  '/business/profile':      'プロフィール設定',
  '/msw/search':            '予約する',
  '/msw/reservations':      '予約履歴',
  '/msw/businesses':        '事業所一覧',
  '/msw/favorites':         'お気に入り',
  '/msw/contacts':          '担当者管理',
  '/msw/profile':           '病院情報',
  '/admin/approvals':       '事業所承認',
  '/admin/reservations':    '予約一覧',
  '/admin/stats':           '統計ダッシュボード',
  '/login':                 'ログイン',
  '/register/business':     '事業所登録',
  '/register/msw':          'MSW登録',
  '/auth/forgot-password':  'パスワードを忘れた方',
  '/auth/reset-password':   'パスワード再設定',
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
    const title = Object.entries(PAGE_TITLES).find(([path]) => pathname.startsWith(path))?.[1]
    document.title = title ? `${title} | せとむすび` : 'せとむすび'
  }, [pathname])
  return null
}

// Auth pages (静的 import: 初回アクセス時に必要)
import Login from './pages/auth/Login'
import BusinessRegister from './pages/auth/BusinessRegister'
import MswRegister from './pages/auth/MswRegister'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'

// Business pages (lazy)
const BusinessCalendar     = lazy(() => import('./pages/business/Calendar'))
const BusinessProfile      = lazy(() => import('./pages/business/Profile'))
const BusinessReservations = lazy(() => import('./pages/business/Reservations'))
const BusinessIntroduction = lazy(() => import('./pages/business/Introduction'))

// MSW pages (lazy)
const MswSearch      = lazy(() => import('./pages/msw/Search'))
const MswReservations = lazy(() => import('./pages/msw/Reservations'))
const MswContacts    = lazy(() => import('./pages/msw/Contacts'))
const MswFavorites   = lazy(() => import('./pages/msw/Favorites'))
const MswBusinesses  = lazy(() => import('./pages/msw/Businesses'))
const HospitalProfile = lazy(() => import('./pages/msw/HospitalProfile'))

// Admin pages (lazy)
const AdminApprovals    = lazy(() => import('./pages/admin/Approvals'))
const AdminReservations = lazy(() => import('./pages/admin/Reservations'))
const AdminStats        = lazy(() => import('./pages/admin/Stats'))

// Other pages
const NotFound = lazy(() => import('./pages/NotFound'))

const Loader = () => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-slate-400">
    <span className="spinner" />
    <span className="text-sm">読み込み中...</span>
  </div>
)

function RootRedirect() {
  const { user, role, loading } = useAuth()
  if (loading) return <Loader />
  if (!user) return <Navigate to="/login" replace />
  if (role === 'business') return <Navigate to="/business/calendar" replace />
  if (role === 'msw') return <Navigate to="/msw/search" replace />
  if (role === 'admin') return <Navigate to="/admin/approvals" replace />
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Suspense fallback={<Loader />}>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/forgot-password" element={<ForgotPassword />} />
        <Route path="/auth/reset-password" element={<ResetPassword />} />
        <Route path="/register/business" element={<BusinessRegister />} />
        <Route path="/register/msw" element={<MswRegister />} />

        {/* Business routes */}
        <Route path="/business/*" element={
          <ProtectedRoute allowedRoles={['business']}>
            <Layout>
              <Routes>
                <Route path="calendar"      element={<BusinessCalendar />} />
                <Route path="profile"       element={<BusinessProfile />} />
                <Route path="reservations"  element={<BusinessReservations />} />
                <Route path="introduction"  element={<BusinessIntroduction />} />
                <Route path="*"             element={<Navigate to="calendar" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />

        {/* MSW routes */}
        <Route path="/msw/*" element={
          <ProtectedRoute allowedRoles={['msw']}>
            <Layout>
              <Routes>
                <Route path="search"       element={<MswSearch />} />
                <Route path="reservations" element={<MswReservations />} />
                <Route path="favorites"    element={<MswFavorites />} />
                <Route path="businesses"   element={<MswBusinesses />} />
                <Route path="contacts"     element={<MswContacts />} />
                <Route path="profile"      element={<HospitalProfile />} />
                <Route path="*"            element={<Navigate to="search" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />

        {/* Admin routes */}
        <Route path="/admin/*" element={
          <ProtectedRoute allowedRoles={['admin']}>
            <Layout>
              <Routes>
                <Route path="approvals"    element={<AdminApprovals />} />
                <Route path="reservations" element={<AdminReservations />} />
                <Route path="stats"        element={<AdminStats />} />
                <Route path="*"            element={<Navigate to="approvals" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

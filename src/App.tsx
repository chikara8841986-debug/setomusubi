import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ToastProvider } from './contexts/ToastContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'

const PAGE_TITLES: Record<string, string> = {
  '/terms':                 '利用規約',
  '/privacy':               'プライバシーポリシー',
  '/business/calendar':     'カレンダー',
  '/business/reservations': '予約管理',
  '/business/introduction': '紹介・PR',
  '/business/profile':      'プロフィール設定',
  '/business/billing':      'ご請求・プラン管理',
  '/msw/search':            '予約する',
  '/msw/reservations':      '予約履歴',
  '/msw/businesses':        '事業所一覧',
  '/msw/favorites':         'お気に入り',
  '/msw/contacts':          '担当者管理',
  '/msw/profile':           '病院情報',
  '/admin/approvals':       '事業所承認',
  '/admin/reservations':    '予約一覧',
  '/admin/stats':           '統計ダッシュボード',
  '/admin/billing':         '課金管理',
  '/login':                 'ログイン',
  '/register/business':     '事業所登録',
  '/register/msw':          'MSW登録',
  '/auth/forgot-password':  'パスワードを忘れた方',
  '/auth/reset-password':   'パスワード再設定',
  '/manual':                        '使い方ガイド',
  '/demo-guide':                    'デモガイド',
  '/demo/msw/search':               'デモ：予約する',
  '/demo/msw/reservations':         'デモ：予約履歴',
  '/demo/msw/businesses':           'デモ：事業所一覧',
  '/demo/business/calendar':        'デモ：カレンダー',
  '/demo/business/reservations':    'デモ：予約管理',
  '/demo/business/profile':         'デモ：プロフィール',
  '/demo/business/billing':         'デモ：料金・契約',
  '/demo/business/register':        'デモ：事業所登録の流れ',
  '/demo/admin/approvals':          'デモ：事業所承認管理',
  '/demo/admin/billing':            'デモ：課金管理',
  '/demo':                          'デモ',
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
const BusinessBilling      = lazy(() => import('./pages/business/Billing'))

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
const AdminBilling      = lazy(() => import('./pages/admin/BillingAdmin'))

// Other pages
const NotFound = lazy(() => import('./pages/NotFound'))
const Manual = lazy(() => import('./pages/Manual'))
const DemoGuide = lazy(() => import('./pages/DemoGuide'))
const Terms = lazy(() => import('./pages/Terms'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))

// Demo pages
const DemoIndex = lazy(() => import('./pages/demo/DemoIndex'))
const DemoMswSearch = lazy(() => import('./pages/demo/DemoMswSearch'))
const DemoMswReservations = lazy(() => import('./pages/demo/DemoMswReservations'))
const DemoMswBusinesses = lazy(() => import('./pages/demo/DemoMswBusinesses'))
const DemoBusinessCalendar = lazy(() => import('./pages/demo/DemoBusinessCalendar'))
const DemoBusinessReservations = lazy(() => import('./pages/demo/DemoBusinessReservations'))
const DemoBusinessProfile = lazy(() => import('./pages/demo/DemoBusinessProfile'))
const DemoBusinessBilling = lazy(() => import('./pages/demo/DemoBusinessBilling'))
const DemoBusinessRegister = lazy(() => import('./pages/demo/DemoBusinessRegister'))
const DemoAdminApprovals = lazy(() => import('./pages/demo/DemoAdminApprovals'))
const DemoAdminBilling = lazy(() => import('./pages/demo/DemoAdminBilling'))

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
        <Route path="/terms" element={<Terms />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* Business routes */}
        <Route path="/business/*" element={
          <ProtectedRoute allowedRoles={['business']}>
            <Layout>
              <Routes>
                <Route path="calendar"      element={<BusinessCalendar />} />
                <Route path="profile"       element={<BusinessProfile />} />
                <Route path="reservations"  element={<BusinessReservations />} />
                <Route path="introduction"  element={<BusinessIntroduction />} />
                <Route path="billing"       element={<BusinessBilling />} />
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
                <Route path="billing"      element={<AdminBilling />} />
                <Route path="*"            element={<Navigate to="approvals" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        } />

        {/* Manual (no auth required) */}
        <Route path="/manual" element={<Manual />} />
        <Route path="/demo-guide" element={<DemoGuide />} />

        {/* Demo routes (no auth required) */}
        <Route path="/demo" element={<DemoIndex />} />
        <Route path="/demo/msw/search"       element={<DemoMswSearch />} />
        <Route path="/demo/msw/reservations" element={<DemoMswReservations />} />
        <Route path="/demo/msw/businesses"   element={<DemoMswBusinesses />} />
        <Route path="/demo/business/calendar"     element={<DemoBusinessCalendar />} />
        <Route path="/demo/business/reservations" element={<DemoBusinessReservations />} />
        <Route path="/demo/business/profile"      element={<DemoBusinessProfile />} />
        <Route path="/demo/business/billing"      element={<DemoBusinessBilling />} />
        <Route path="/demo/business/register"     element={<DemoBusinessRegister />} />
        <Route path="/demo/admin/approvals"       element={<DemoAdminApprovals />} />
        <Route path="/demo/admin/billing"         element={<DemoAdminBilling />} />
        <Route path="/demo/*"                element={<Navigate to="/demo" replace />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <ErrorBoundary>
              <AppRoutes />
            </ErrorBoundary>
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

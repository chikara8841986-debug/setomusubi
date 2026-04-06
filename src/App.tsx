import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

// Auth pages
import Login from './pages/auth/Login'
import BusinessRegister from './pages/auth/BusinessRegister'
import MswRegister from './pages/auth/MswRegister'

// Business pages
import BusinessCalendar from './pages/business/Calendar'
import BusinessProfile from './pages/business/Profile'
import BusinessReservations from './pages/business/Reservations'

// MSW pages
import MswSearch from './pages/msw/Search'
import MswReservations from './pages/msw/Reservations'

// Admin pages
import AdminApprovals from './pages/admin/Approvals'

function RootRedirect() {
  const { user, role, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-400">読み込み中...</div>
  if (!user) return <Navigate to="/login" replace />
  if (role === 'business') return <Navigate to="/business/calendar" replace />
  if (role === 'msw') return <Navigate to="/msw/search" replace />
  if (role === 'admin') return <Navigate to="/admin/approvals" replace />
  return <Navigate to="/login" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register/business" element={<BusinessRegister />} />
      <Route path="/register/msw" element={<MswRegister />} />

      {/* Business routes */}
      <Route path="/business/*" element={
        <ProtectedRoute allowedRoles={['business']}>
          <Layout>
            <Routes>
              <Route path="calendar" element={<BusinessCalendar />} />
              <Route path="profile" element={<BusinessProfile />} />
              <Route path="reservations" element={<BusinessReservations />} />
              <Route path="*" element={<Navigate to="calendar" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />

      {/* MSW routes */}
      <Route path="/msw/*" element={
        <ProtectedRoute allowedRoles={['msw']}>
          <Layout>
            <Routes>
              <Route path="search" element={<MswSearch />} />
              <Route path="reservations" element={<MswReservations />} />
              <Route path="*" element={<Navigate to="search" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />

      {/* Admin routes */}
      <Route path="/admin/*" element={
        <ProtectedRoute allowedRoles={['admin']}>
          <Layout>
            <Routes>
              <Route path="approvals" element={<AdminApprovals />} />
              <Route path="*" element={<Navigate to="approvals" replace />} />
            </Routes>
          </Layout>
        </ProtectedRoute>
      } />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}

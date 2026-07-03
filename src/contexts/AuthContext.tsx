import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, AUTH_STORAGE_KEY } from '../lib/supabase'
import { switchAuthToSessionOnly, resetAuthStorageMode } from '../lib/authStorage'
import type { UserRole } from '../types/database'

type AuthContextType = {
  user: User | null
  session: Session | null
  role: UserRole | null
  businessId: string | null
  businessName: string | null
  hospitalId: string | null
  hospitalName: string | null
  businessApproved: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  businessId: null,
  businessName: null,
  hospitalId: null,
  hospitalName: null,
  businessApproved: false,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [hospitalId, setHospitalId] = useState<string | null>(null)
  const [hospitalName, setHospitalName] = useState<string | null>(null)
  const [businessApproved, setBusinessApproved] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadUserMeta(userId: string) {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (error || !profile) return

    setRole(profile.role)

    if (profile.role === 'business') {
      resetAuthStorageMode()
      const { data } = await supabase
        .from('businesses')
        .select('id, approved, name')
        .eq('user_id', userId)
        .single()
      setBusinessId(data?.id ?? null)
      setBusinessName(data?.name ?? null)
      setBusinessApproved(data?.approved ?? false)
    } else if (profile.role === 'msw') {
      // D3対策: 病院の共用PC想定。MSWだけセッションをsessionStorage限定にし、
      // ブラウザ/タブを閉じたらログイン情報が残らないようにする。
      switchAuthToSessionOnly(AUTH_STORAGE_KEY)
      const { data } = await supabase
        .from('hospitals')
        .select('id, name')
        .eq('user_id', userId)
        .single()
      setHospitalId(data?.id ?? null)
      setHospitalName(data?.name ?? null)
    } else {
      resetAuthStorageMode()
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserMeta(session.user.id).finally(() => setLoading(false))
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserMeta(session.user.id)
      } else {
        setRole(null)
        setBusinessId(null)
        setHospitalId(null)
        setBusinessApproved(false)
        // SIGNED_OUT のみログイン画面へリダイレクト
        // TOKEN_REFRESHED はトークン更新成功を示すためリダイレクト不要
        if (event === 'SIGNED_OUT' && !session) {
          setBusinessName(null)
          setHospitalName(null)
          window.location.href = '/login'
        }
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
    resetAuthStorageMode()
    // 共用PC対策: ログアウト時にService WorkerのCacheStorageを掃除しておく
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((key) => caches.delete(key)))
    }
  }

  return (
    <AuthContext.Provider value={{ user, session, role, businessId, businessName, hospitalId, hospitalName, businessApproved, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

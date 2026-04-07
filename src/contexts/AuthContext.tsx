import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { UserRole } from '../types/database'

type AuthContextType = {
  user: User | null
  session: Session | null
  role: UserRole | null
  businessId: string | null
  hospitalId: string | null
  businessApproved: boolean
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  role: null,
  businessId: null,
  hospitalId: null,
  businessApproved: false,
  loading: true,
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [role, setRole] = useState<UserRole | null>(null)
  const [businessId, setBusinessId] = useState<string | null>(null)
  const [hospitalId, setHospitalId] = useState<string | null>(null)
  const [businessApproved, setBusinessApproved] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadUserMeta(userId: string) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single()

    if (!profile) return

    setRole(profile.role)

    if (profile.role === 'business') {
      const { data } = await supabase
        .from('businesses')
        .select('id, approved')
        .eq('user_id', userId)
        .single()
      setBusinessId(data?.id ?? null)
      setBusinessApproved(data?.approved ?? false)
    } else if (profile.role === 'msw') {
      const { data } = await supabase
        .from('hospitals')
        .select('id')
        .eq('user_id', userId)
        .single()
      setHospitalId(data?.id ?? null)
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadUserMeta(session.user.id)
      } else {
        setRole(null)
        setBusinessId(null)
        setHospitalId(null)
        setBusinessApproved(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ user, session, role, businessId, hospitalId, businessApproved, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}

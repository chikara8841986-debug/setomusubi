import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'
import { hybridAuthStorage } from './authStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables are not set. Please configure .env.local')
}

// D3対策: MSWロールだけセッションをsessionStorageに切り替えられるよう、
// storageKeyを固定しカスタムstorageアダプタを使う（authStorage.ts参照）。
export const AUTH_STORAGE_KEY = 'setomusubi-auth-token'

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      storageKey: AUTH_STORAGE_KEY,
      storage: hybridAuthStorage,
    },
  }
)

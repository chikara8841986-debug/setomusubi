// D3対策: 病院の共用PCでMSWがログインしたままになる問題への対応。
// MSWロールと確認できたセッションだけ sessionStorage（タブ/ブラウザを閉じると消える）に切り替える。
// business/admin は従来どおり localStorage（永続ログイン）のまま。

const MODE_FLAG_KEY = 'setomusubi-auth-mode'

function isSessionOnlyMode(): boolean {
  return sessionStorage.getItem(MODE_FLAG_KEY) === 'session'
}

export const hybridAuthStorage = {
  getItem(key: string): string | null {
    return isSessionOnlyMode() ? sessionStorage.getItem(key) : localStorage.getItem(key)
  },
  setItem(key: string, value: string): void {
    if (isSessionOnlyMode()) {
      sessionStorage.setItem(key, value)
      localStorage.removeItem(key)
    } else {
      localStorage.setItem(key, value)
    }
  },
  removeItem(key: string): void {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

// ロールがMSWと判明した時点で呼ぶ。既存セッションをlocalStorageからsessionStorageへ
// 移し、以後の書き込みもsessionStorage限定にする。
export function switchAuthToSessionOnly(storageKey: string): void {
  if (isSessionOnlyMode()) return
  const existing = localStorage.getItem(storageKey)
  if (existing) {
    sessionStorage.setItem(storageKey, existing)
    localStorage.removeItem(storageKey)
  }
  sessionStorage.setItem(MODE_FLAG_KEY, 'session')
}

// business/admin と判明した場合や、ログアウト時に呼ぶ。通常のlocalStorage永続モードへ戻す。
export function resetAuthStorageMode(): void {
  sessionStorage.removeItem(MODE_FLAG_KEY)
}

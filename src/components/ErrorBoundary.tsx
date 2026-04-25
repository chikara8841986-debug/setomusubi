import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // エラーログ（本番では外部サービスへ送信可能）
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  handleReload = () => window.location.reload()
  handleBack = () => {
    this.setState({ hasError: false, error: undefined })
    window.history.back()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4"
          style={{ background: 'linear-gradient(135deg, #f0f9f8 0%, #e8f5f3 50%, #f0f4ff 100%)' }}>
          <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
            <div className="text-5xl mb-4">😵</div>
            <h2 className="text-lg font-bold text-slate-800 mb-2">
              予期しないエラーが発生しました
            </h2>
            <p className="text-sm text-slate-500 mb-1">
              申し訳ありません。画面の読み込みに失敗しました。
            </p>
            <p className="text-xs text-slate-400 mb-6">
              問題が続く場合はブラウザをリロードしてください。
            </p>
            {this.state.error && (
              <p className="text-[10px] text-slate-300 bg-slate-50 rounded-lg px-3 py-2 mb-5 font-mono text-left break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-2">
              <button onClick={this.handleBack} className="flex-1 py-2.5 px-4 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
                ← 前の画面へ
              </button>
              <button onClick={this.handleReload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 text-white text-sm font-semibold hover:from-teal-600 hover:to-teal-800 transition-all">
                再読み込み
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

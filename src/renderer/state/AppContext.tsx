/**
 * React Context 提供者：包装 useAppState，向组件树暴露统一状态与动作。
 */
import { createContext, useContext, type ReactNode } from 'react'
import { useAppState, type AppStateAndActions } from './useAppState'

const AppContext = createContext<AppStateAndActions | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const value = useAppState()
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppStateAndActions {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

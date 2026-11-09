import { useApp } from '../state/AppContext'
import type { Mode } from '../state/useAppState'

export default function ModeTabs() {
  const { mode, setMode, t } = useApp()
  const tabs: { key: Mode; label: string }[] = [
    { key: 'dimension', label: t('mode.dimension') },
    { key: 'summary', label: t('mode.summary') },
    { key: 'memory', label: t('mode.memory') }
  ]
  return (
    <div className="flex gap-1 border-b bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setMode(tab.key)}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition-colors ' +
            (mode === tab.key
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700')
          }
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

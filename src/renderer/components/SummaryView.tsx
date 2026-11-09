import { useApp } from '../state/AppContext'

export default function SummaryView() {
  const { summary, updateSummary, t, copySummary, copied } = useApp()
  if (!summary) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center rounded-lg border border-dashed p-3 text-center text-xs text-gray-400 dark:border-gray-700">
        {t('summary.empty')}
      </div>
    )
  }
  const fields: { key: 'goal' | 'conclusions' | 'constraints' | 'open'; label: string; list: boolean }[] = [
    { key: 'goal', label: t('summary.goal'), list: false },
    { key: 'conclusions', label: t('summary.conclusions'), list: true },
    { key: 'constraints', label: t('summary.constraints'), list: true },
    { key: 'open', label: t('summary.open'), list: true }
  ]
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{t('summary.title')}</h2>
        <button onClick={copySummary} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
          {copied ? t('action.copied') : t('action.copySummary')}
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        {fields.map((f) =>
          f.list ? (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{f.label}</label>
              <textarea
                value={(summary[f.key] as string[]).join('\n')}
                onChange={(e) =>
                  updateSummary({ [f.key]: e.target.value.split('\n').filter((s) => s.trim()) } as Partial<typeof summary>)
                }
                rows={3}
                className="w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
          ) : (
            <div key={f.key}>
              <label className="mb-1 block text-xs font-semibold text-gray-500">{f.label}</label>
              <textarea
                value={summary.goal}
                onChange={(e) => updateSummary({ goal: e.target.value })}
                rows={2}
                className="w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </div>
          )
        )}
      </div>
    </div>
  )
}

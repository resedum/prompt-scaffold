import { useApp } from '../state/AppContext'

export default function DimensionList() {
  const {
    dimensions, source, t, toggleSelected, setAllSelected, updateDimension,
    removeDimension, restoreDimension, addDimension, setHabit, isHabit
  } = useApp()

  const active = dimensions.filter((d) => !d.removed)
  const allSelected = active.length > 0 && active.every((d) => d.selected)

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">{t('dimension.title')}</h2>
          <span
            className={
              'rounded-full px-2 py-0.5 text-xs font-medium ' +
              (source === 'ai'
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300')
            }
          >
            {source === 'ai' ? t('dimension.aiBadge') : t('dimension.fallbackBadge')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={() => setAllSelected(!allSelected)} className="text-blue-600 hover:underline">
            {allSelected ? t('dimension.deselectAll') : t('dimension.selectAll')}
          </button>
          <button onClick={addDimension} className="text-blue-600 hover:underline">
            + {t('action.addDimension')}
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {dimensions.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">{t('dimension.empty')}</p>
        ) : (
          <ul className="space-y-2">
            {dimensions.map((d) => {
              const habit = isHabit(d.name)
              return (
                <li
                  key={d.id}
                  className={
                    'rounded-md border p-2 ' +
                    (d.removed
                      ? 'border-dashed border-gray-300 bg-gray-50 opacity-60 dark:border-gray-600 dark:bg-gray-900'
                      : 'border-gray-200 dark:border-gray-700')
                  }
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={d.selected && !d.removed}
                      disabled={d.removed}
                      onChange={() => toggleSelected(d.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <input
                        value={d.name}
                        disabled={d.removed}
                        onChange={(e) => updateDimension(d.id, { name: e.target.value })}
                        placeholder={t('dimension.namePlaceholder')}
                        className={
                          'w-full bg-transparent text-sm font-semibold outline-none ' +
                          (d.removed ? 'line-through' : '')
                        }
                      />
                      <textarea
                        value={d.wording}
                        disabled={d.removed}
                        onChange={(e) => updateDimension(d.id, { wording: e.target.value })}
                        placeholder={t('dimension.wordingPlaceholder')}
                        rows={2}
                        className={
                          'mt-1 w-full resize-none bg-transparent text-xs text-gray-600 outline-none dark:text-gray-300 ' +
                          (d.removed ? 'line-through' : '')
                        }
                      />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                      {d.removed ? (
                        <button onClick={() => restoreDimension(d.id)} className="text-blue-600 hover:underline">
                          {t('action.restore')}
                        </button>
                      ) : (
                        <>
                          <button onClick={() => removeDimension(d.id)} className="text-gray-400 hover:text-red-500">
                            {t('action.remove')}
                          </button>
                          <button
                            onClick={() => setHabit({ name: d.name, wording: d.wording }, !habit)}
                            className={habit ? 'text-green-600' : 'text-gray-400 hover:text-blue-500'}
                            title={habit ? t('action.habitSet') : t('action.adoptHabit')}
                          >
                            {habit ? '★ ' + t('action.habitSet') : '☆ ' + t('action.adoptHabit')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  {d.removed && (
                    <p className="mt-1 text-xs text-gray-400">{t('dimension.removed')} · {t('action.restore')}↑</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

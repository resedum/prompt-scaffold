import { useMemo } from 'react'
import { useApp } from '../state/AppContext'
import { buildPreviewText, buildDimensionsText } from '../lib/compose'

export default function PreviewPanel() {
  const { text, dimensions, t, copyFull, copyDimensions, copied } = useApp()
  const selected = useMemo(
    () => dimensions.filter((d) => d.selected && !d.removed),
    [dimensions]
  )
  const preview = useMemo(() => buildPreviewText(text, selected, 'zh'), [text, selected])

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-semibold">{t('preview.title')}</h2>
        <div className="flex gap-2">
          <button onClick={copyDimensions} className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
            {t('action.copyDimensions')}
          </button>
          <button onClick={copyFull} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
            {copied ? t('action.copied') : t('action.copyFull')}
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {!text && selected.length === 0 ? (
          <p className="text-center text-xs text-gray-400">{t('preview.empty')}</p>
        ) : (
          <>
            <p className="mb-2 text-xs font-semibold text-gray-500">{t('preview.original')}</p>
            <pre className="mb-4 whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-sm dark:bg-gray-900">
              {text || '（空）'}
            </pre>
            <p className="mb-2 text-xs font-semibold text-gray-500">
              {t('preview.supplement')}（{selected.length} 条）
            </p>
            <pre className="whitespace-pre-wrap rounded-md bg-gray-50 p-2 text-sm dark:bg-gray-900">
              {selected.length ? buildDimensionsText(selected) : '（未勾选维度）'}
            </pre>
          </>
        )}
      </div>
    </div>
  )
}

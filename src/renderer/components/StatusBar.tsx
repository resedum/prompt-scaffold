import { useApp } from '../state/AppContext'

export default function StatusBar() {
  const { loading, error, source, fallbackReason, silenced, dimensions, t, dismissFallbackNotice } = useApp()

  const showFallbackNotice = source === 'fallback' && dimensions.length > 0 && !silenced

  return (
    <div className="border-t bg-white px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-gray-800">
      {error ? (
        <div className="flex items-center gap-2 text-red-600">
          <span>⚠ {t(`error.${error.code}`, {})}</span>
          <span className="text-gray-400">{error.message}</span>
        </div>
      ) : loading ? (
        <div className="flex items-center gap-2 text-blue-600">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          {t('status.generating')}
        </div>
      ) : showFallbackNotice ? (
        <div className="flex items-center gap-2 text-amber-700">
          <span>ℹ {t('fallback.notice.title')}</span>
          <span className="text-gray-400">
            {fallbackReason ? t(`fallback.reason.${fallbackReason}`) : ''}
          </span>
          <button onClick={dismissFallbackNotice} className="ml-auto text-gray-400 hover:text-gray-600">
            {t('notice.ignore')}
          </button>
        </div>
      ) : silenced && source === 'fallback' && dimensions.length > 0 ? (
        <div className="text-amber-600">
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] dark:bg-amber-900">
            {t('dimension.fallbackBadge')}
          </span>{' '}
          {t('notice.silenced')}
        </div>
      ) : (
        <div className="text-gray-400">{t('status.ready')}</div>
      )}
    </div>
  )
}

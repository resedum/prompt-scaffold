import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { bridge } from '../api/bridge'

/** summary 模式下的分享链接输入 + 抓取（失败明确提示手动粘贴） */
export default function ShareLinkInput() {
  const { t, setText } = useApp()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = async () => {
    if (!url.trim() || loading) return
    setLoading(true)
    setError(null)
    const r = await bridge.fetchShare(url.trim())
    if (r.ok) {
      // 成功后替换/追加到总结输入框（可编辑，再点「生成总结」）
      setText((prev) => (prev ? prev + '\n\n' + r.data.text : r.data.text))
      setUrl('')
    } else {
      setError(r.code === 'SHARE_FETCH_FAILED' ? t('share.failed') : r.message)
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void fetch()
          }}
          placeholder={t('share.placeholder')}
          disabled={loading}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-gray-50 px-2 py-1.5 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900"
        />
        <button
          onClick={() => void fetch()}
          disabled={loading || !url.trim()}
          className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {loading ? t('share.fetching') : t('share.fetch')}
        </button>
      </div>
      {loading && <p className="text-xs text-gray-400">{t('share.fetchingHint')}</p>}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

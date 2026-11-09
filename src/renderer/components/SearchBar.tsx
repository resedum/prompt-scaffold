import { useState } from 'react'
import { bridge } from '../api/bridge'
import type { SearchHit } from '../../shared/memory-types'

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [busy, setBusy] = useState(false)

  const doSearch = async (q: string) => {
    setQuery(q)
    if (!q.trim()) {
      setHits([])
      return
    }
    setBusy(true)
    const r = await bridge.searchMemory(q)
    setBusy(false)
    if (r.ok) setHits(r.data)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b p-2">
        <input
          value={query}
          onChange={(e) => doSearch(e.target.value)}
          placeholder="搜索笔记 + 资料抽取文本…"
          className="w-full rounded border border-gray-200 bg-transparent px-2 py-1.5 text-sm outline-none dark:border-gray-600"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {busy ? (
          <p className="p-3 text-center text-xs text-gray-400">搜索中…</p>
        ) : query.trim() && hits.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">无结果</p>
        ) : (
          <ul className="space-y-2">
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <span className={'rounded-full px-2 py-0.5 text-xs ' + (h.type === 'note' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300')}>
                    {h.type === 'note' ? '笔记' : '资料'}
                  </span>
                  <span className="text-sm font-semibold">{h.title}</span>
                </div>
                {h.snippet && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{h.snippet}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

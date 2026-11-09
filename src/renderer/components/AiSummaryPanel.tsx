import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { SummaryResult as MemorySummaryResult, SummaryRequest } from '../../shared/memory-types'

export default function AiSummaryPanel() {
  const [summaries, setSummaries] = useState<MemorySummaryResult[]>([])
  const [scope, setScope] = useState<SummaryRequest['scope']>('off')
  const [sendScope, setSendScope] = useState<SummaryRequest['sendScope']>('selected')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = async () => {
    const r = await bridge.listSummaries()
    if (r.ok) setSummaries(r.data)
  }

  useEffect(() => {
    refresh()
  }, [])

  const run = async () => {
    setBusy(true)
    setNotice(null)
    const r = await bridge.summarizeMemory({ noteIds: [], scope, sendScope })
    setBusy(false)
    if (r.ok) {
      setSummaries((prev) => [r.data, ...prev])
    } else {
      setNotice(r.message)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">AI 总结</span>
        <select value={scope} onChange={(e) => setScope(e.target.value as SummaryRequest['scope'])} className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
          <option value="off">关闭</option>
          <option value="local">本地模型</option>
          <option value="external">外部模型</option>
        </select>
        <select value={sendScope} onChange={(e) => setSendScope(e.target.value as SummaryRequest['sendScope'])} className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
          <option value="all">全部</option>
          <option value="selected">仅选中</option>
        </select>
        <button onClick={run} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '总结中…' : '总结'}
        </button>
      </div>
      {notice && <p className="px-3 py-1 text-xs text-amber-600">{notice}</p>}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {summaries.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">暂无总结（手动触发，结果本地留存）</p>
        ) : (
          <ul className="space-y-2">
            {summaries.map((s) => (
              <li key={s.id} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                  <span>{new Date(s.createdAt).toLocaleString()}</span>
                  <span>· {s.engine}</span>
                  <span>· {s.sendScope}</span>
                  <span>· {s.sourceNoteIds.length} 条</span>
                </div>
                <p className="whitespace-pre-wrap text-xs text-gray-600 dark:text-gray-300">{s.content}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

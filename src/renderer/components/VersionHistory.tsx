import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { NoteVersion } from '../../shared/memory-types'

interface Props {
  noteId: string
  onRestored?: () => void
}

export default function VersionHistory({ noteId, onRestored }: Props) {
  const [versions, setVersions] = useState<NoteVersion[]>([])

  const refresh = async () => {
    const r = await bridge.listVersions(noteId)
    if (r.ok) setVersions(r.data)
  }

  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  const restore = async (versionId: string) => {
    if (!window.confirm('回滚到该版本？当前内容会先保留一份快照。')) return
    const r = await bridge.restoreVersion(versionId)
    if (r.ok) {
      refresh()
      onRestored?.()
    } else {
      alert(r.message)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b px-3 py-2">
        <span className="text-sm font-semibold">版本历史</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {versions.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">暂无版本快照（每次修改自动留档）</p>
        ) : (
          <ul className="space-y-2">
            {versions.map((v) => (
              <li key={v.id} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">#{v.versionNo} {v.note || ''}</div>
                    <div className="text-xs text-gray-400">{new Date(v.createdAt).toLocaleString()}</div>
                    <p className="mt-1 truncate text-xs text-gray-600 dark:text-gray-300">{v.content.slice(0, 80)}</p>
                  </div>
                  <button onClick={() => restore(v.id)} className="text-xs text-blue-600 hover:underline">回滚</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

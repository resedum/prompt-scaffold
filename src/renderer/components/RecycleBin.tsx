import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { Note, Material } from '../../shared/memory-types'

export default function RecycleBin() {
  const [notes, setNotes] = useState<Note[]>([])
  const [materials, setMaterials] = useState<Material[]>([])

  const refresh = async () => {
    const r = await bridge.listRecycle()
    if (r.ok) {
      setNotes(r.data.notes)
      setMaterials(r.data.materials)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const restore = async (id: string, kind: 'note' | 'material') => {
    await bridge.restoreRecycle(id, kind)
    refresh()
  }

  const empty = async () => {
    if (!window.confirm('确定彻底清空回收站？此操作不可撤销。')) return
    await bridge.emptyRecycle()
    refresh()
  }

  const total = notes.length + materials.length

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">回收站（{total}）</span>
        <button onClick={empty} disabled={total === 0} className="rounded-md border border-gray-300 px-2 py-1 text-xs text-red-500 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700">
          清空回收站
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {total === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">回收站为空</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="flex items-center gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">笔记</span>
                <span className="min-w-0 flex-1 truncate text-sm">{n.title}</span>
                <button onClick={() => restore(n.id, 'note')} className="text-xs text-blue-600 hover:underline">恢复</button>
              </li>
            ))}
            {materials.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900 dark:text-amber-300">资料</span>
                <span className="min-w-0 flex-1 truncate text-sm">{m.title}</span>
                <button onClick={() => restore(m.id, 'material')} className="text-xs text-blue-600 hover:underline">恢复</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

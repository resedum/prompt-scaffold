import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { CycleFolder, CycleFolderInput } from '../../shared/memory-types'

export default function CycleFolderView() {
  const [folders, setFolders] = useState<CycleFolder[]>([])
  const [name, setName] = useState('')
  const [scope, setScope] = useState<CycleFolder['scope']>('custom')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')

  const refresh = async () => {
    const r = await bridge.listFolders()
    if (r.ok) setFolders(r.data)
  }

  useEffect(() => {
    refresh()
  }, [])

  const create = async () => {
    if (!name.trim()) return
    const input: CycleFolderInput = {
      name: name.trim(),
      scope,
      startDate: start || new Date().toISOString().slice(0, 10),
      endDate: end || new Date().toISOString().slice(0, 10)
    }
    await bridge.createFolder(input)
    setName('')
    refresh()
  }

  const remove = async (id: string) => {
    await bridge.deleteFolder(id)
    refresh()
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="border-b p-2">
        <div className="flex flex-wrap items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="文件夹名，如 2026-11 第2周" className="min-w-0 flex-1 rounded border border-gray-200 bg-transparent px-2 py-1 text-sm outline-none dark:border-gray-600" />
          <select value={scope} onChange={(e) => setScope(e.target.value as CycleFolder['scope'])} className="rounded border border-gray-300 bg-white px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-700">
            <option value="day">day</option>
            <option value="week">week</option>
            <option value="month">month</option>
            <option value="custom">custom</option>
          </select>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="rounded border border-gray-200 bg-transparent px-1 py-1 text-xs dark:border-gray-600" />
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded border border-gray-200 bg-transparent px-1 py-1 text-xs dark:border-gray-600" />
          <button onClick={create} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700">新建</button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {folders.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">暂无周期文件夹</p>
        ) : (
          <ul className="space-y-2">
            {folders.map((f) => (
              <li key={f.id} className="flex items-center gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold">{f.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{f.scope} · {f.startDate}~{f.endDate} · {f.noteIds.length} 条</span>
                </div>
                <button onClick={() => remove(f.id)} className="text-xs text-gray-400 hover:text-red-500">归档</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { Material } from '../../shared/memory-types'

export default function MaterialLibrary() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const r = await bridge.listMaterials()
    if (r.ok) setMaterials(r.data)
  }

  useEffect(() => {
    refresh()
  }, [])

  const add = async () => {
    setBusy(true)
    const r = await bridge.addMaterial()
    setBusy(false)
    if (r.ok && r.data) refresh()
    else if (!r.ok) alert(r.message)
  }

  const archive = async (id: string) => {
    await bridge.archiveMaterial(id)
    refresh()
  }

  const remove = async (id: string) => {
    if (!window.confirm('确定彻底删除该资料？（版本与抽取文本一并删除）')) return
    await bridge.deleteMaterial(id)
    refresh()
  }

  const statusLabel = (s: Material['extractedStatus']) => {
    if (s === 'ok') return '已抽取'
    if (s === 'partial') return '部分抽取'
    if (s === 'unsupported') return '不支持抽取'
    return '未抽取'
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-semibold">资料仓库</span>
        <button onClick={add} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '导入中…' : '＋ 导入资料'}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {materials.length === 0 ? (
          <p className="p-3 text-center text-xs text-gray-400">暂无资料：导入 PDF / Office / 文本 / 图片</p>
        ) : (
          <ul className="space-y-2">
            {materials.map((m) => (
              <li key={m.id} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{m.title}</div>
                    <div className="text-xs text-gray-400">
                      {m.fileName} · {m.category} · {(m.size / 1024).toFixed(1)} KB · {statusLabel(m.extractedStatus)}
                    </div>
                  </div>
                  <button onClick={() => archive(m.id)} className="text-xs text-gray-400 hover:text-amber-500">归档</button>
                  <button onClick={() => remove(m.id)} className="text-xs text-gray-400 hover:text-red-500">删除</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { BackupManifest, QuotaStats, CleanupItem } from '../../shared/memory-types'

export default function BackupPanel() {
  const [backups, setBackups] = useState<BackupManifest[]>([])
  const [quota, setQuota] = useState<QuotaStats | null>(null)
  const [cleanup, setCleanup] = useState<CleanupItem[]>([])
  const [busy, setBusy] = useState(false)

  const refresh = async () => {
    const [b, q] = await Promise.all([bridge.listBackups(), bridge.quotaStats()])
    if (b.ok) setBackups(b.data)
    if (q.ok) setQuota(q.data)
  }

  const refreshCleanup = async () => {
    const r = await bridge.suggestCleanup()
    if (r.ok) setCleanup(r.data)
  }

  useEffect(() => {
    refresh()
    refreshCleanup()
  }, [])

  const create = async () => {
    setBusy(true)
    const r = await bridge.createBackup()
    setBusy(false)
    if (r.ok) refresh()
    else alert(r.message)
  }

  const restore = async (id: string) => {
    if (!window.confirm('从该备份恢复？当前数据将被备份内容覆盖。')) return
    const r = await bridge.restoreBackup(id)
    if (r.ok) refresh()
    else alert(r.message)
  }

  const applyCleanup = async () => {
    const ids = cleanup.map((c) => c.id)
    if (ids.length === 0) return
    const r = await bridge.applyCleanup(ids)
    if (r.ok) {
      alert(`已清理 ${r.data.removed} 项，释放 ${(r.data.freedBytes / 1024).toFixed(1)} KB`)
      refresh()
      refreshCleanup()
    } else {
      alert(r.message)
    }
  }

  const mb = (n: number) => (n / 1024 / 1024).toFixed(2) + ' MB'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
      <div className="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">存储配额</span>
          <button onClick={create} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? '备份中…' : '立即备份'}
          </button>
        </div>
        {quota && (
          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
            <div><div className="text-lg font-semibold">{quota.notes}</div>笔记</div>
            <div><div className="text-lg font-semibold">{quota.materials}</div>资料</div>
            <div><div className="text-lg font-semibold">{quota.versions}</div>版本</div>
            <div><div className="text-lg font-semibold">{mb(quota.bytes)}</div>占用</div>
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <span className="text-sm font-semibold">本地备份（{backups.length}）</span>
        {backups.length === 0 ? (
          <p className="mt-2 text-xs text-gray-400">暂无备份</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate">{new Date(b.createdAt).toLocaleString()} · {mb(b.size)}</span>
                <button onClick={() => restore(b.id)} className="text-blue-600 hover:underline">恢复</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">清理建议（只建议，不自动删）</span>
          <button onClick={refreshCleanup} className="text-xs text-gray-400 hover:text-blue-500">刷新</button>
        </div>
        {cleanup.length === 0 ? (
          <p className="mt-2 text-xs text-gray-400">暂无清理建议</p>
        ) : (
          <>
            <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {cleanup.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 dark:bg-gray-700">{c.kind}</span>
                  <span className="min-w-0 flex-1 truncate">{c.reason}</span>
                  <span className="text-gray-400">{(c.size / 1024).toFixed(1)} KB</span>
                </li>
              ))}
            </ul>
            <button onClick={applyCleanup} className="mt-2 rounded-md border border-gray-300 px-3 py-1 text-xs text-red-500 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
              确认清理以上项目
            </button>
          </>
        )}
      </div>
    </div>
  )
}

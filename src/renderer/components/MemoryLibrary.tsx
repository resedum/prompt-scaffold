import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { bridge } from '../api/bridge'
import type { MemoryHabit, MemoryImportPreview, MemoryImportStrategy } from '../../shared/types'

/** 本地时间展示，非法值回退原字符串 */
function formatDate(iso: string, lang: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso || ''
  try {
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'zh-CN')
  } catch {
    return d.toISOString()
  }
}

/** 记忆库弹窗：可视化列表 / 单删 / 清空 / 导出 JSON / 导入 JSON（合并·覆盖） */
export default function MemoryLibrary() {
  const { prefs, savePrefs, t, lang } = useApp()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<MemoryImportPreview | null>(null)
  const [strategy, setStrategy] = useState<MemoryImportStrategy>('merge')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  if (!prefs) return null
  const habits = prefs.dimensionHabits

  const doDelete = async (h: MemoryHabit) => {
    await savePrefs({ ...prefs, dimensionHabits: habits.filter((x) => x.name !== h.name) })
  }

  const doClear = async () => {
    if (!window.confirm(t('memory.clearConfirm'))) return
    await savePrefs({ ...prefs, dimensionHabits: [] })
  }

  const doExport = async () => {
    setNotice(null)
    const r = await bridge.exportMemory()
    if (r.ok) {
      if (!r.data.canceled) setNotice(t('memory.exported', { n: r.data.count }))
    } else {
      setNotice(r.message)
    }
  }

  const doPickImport = async () => {
    setNotice(null)
    const r = await bridge.pickMemoryImport()
    if (r.ok && r.data) {
      setPreview(r.data)
      setStrategy('merge')
    } else if (!r.ok) {
      setNotice(r.message)
    }
  }

  const doApplyImport = async () => {
    if (!preview) return
    setBusy(true)
    const r = await bridge.applyMemoryImport({ habits: preview.habits, strategy })
    if (r.ok) {
      setPreview(null)
      setNotice(t('memory.imported', { added: r.data.added, overwritten: r.data.overwritten }))
    } else {
      setNotice(r.message)
    }
    setBusy(false)
  }

  const sourceBadge = (h: MemoryHabit) => {
    const imported = h.source === 'imported'
    const cls = imported
      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
      : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    const label = imported ? t('memory.source.imported') : t('memory.source.adopted')
    return <span className={'rounded-full px-2 py-0.5 text-xs font-medium ' + cls}>{label}</span>
  }

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(true)
          setNotice(null)
        }}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        🧠 {t('memory.title')}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="flex max-h-[80vh] w-[560px] flex-col rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{t('memory.title')}</h3>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                ✕
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {habits.length === 0 ? (
                <p className="p-3 text-center text-xs text-gray-400">{t('memory.empty')}</p>
              ) : (
                <ul className="space-y-2">
                  {habits.map((h) => (
                    <li key={h.name} className="rounded-md border border-gray-200 p-2 dark:border-gray-700">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{h.name}</span>
                            {sourceBadge(h)}
                          </div>
                          {h.wording && <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{h.wording}</p>}
                          <p className="mt-1 text-xs text-gray-400">{formatDate(h.updatedAt, lang)}</p>
                        </div>
                        <button onClick={() => doDelete(h)} className="shrink-0 text-xs text-gray-400 hover:text-red-500">
                          {t('memory.delete')}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {notice && <p className="mt-2 text-xs text-amber-600">{notice}</p>}

            <div className="mt-3 flex items-center justify-between border-t pt-3">
              <button
                onClick={doClear}
                disabled={habits.length === 0}
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-red-500 hover:bg-gray-100 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {t('memory.clear')}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={doExport}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  {t('memory.export')}
                </button>
                <button
                  onClick={doPickImport}
                  className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                >
                  {t('memory.import')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40" onClick={() => setPreview(null)}>
          <div className="w-[440px] rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-2 text-sm font-semibold">{t('memory.importPreview.title')}</h3>
            <p className="mb-1 text-xs text-gray-500">{t('memory.importPreview.file', { name: preview.fileName })}</p>
            <p className="mb-3 text-xs text-gray-600 dark:text-gray-300">
              {t('memory.importPreview.stats', {
                total: preview.total,
                conflict: preview.conflictCount,
                invalid: preview.invalidCount
              })}
            </p>
            <div className="mb-3 space-y-1">
              <label className="flex items-center gap-2 text-xs">
                <input type="radio" checked={strategy === 'merge'} onChange={() => setStrategy('merge')} />
                {t('memory.strategy.merge')}
              </label>
              <label className="flex items-center gap-2 text-xs">
                <input type="radio" checked={strategy === 'overwrite'} onChange={() => setStrategy('overwrite')} />
                {t('memory.strategy.overwrite')}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPreview(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                {t('action.cancel')}
              </button>
              <button
                onClick={doApplyImport}
                disabled={busy}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy ? t('status.saving') : t('memory.importApply')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

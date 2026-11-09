import { useCallback, useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { Note, PeriodScope, PeriodGroup } from '../../shared/memory-types'
import NoteEditor from './NoteEditor'
import CycleFolderView from './CycleFolderView'
import MaterialLibrary from './MaterialLibrary'
import VersionHistory from './VersionHistory'
import RecycleBin from './RecycleBin'
import BackupPanel from './BackupPanel'
import SearchBar from './SearchBar'
import PrivacySettings from './PrivacySettings'
import AiSummaryPanel from './AiSummaryPanel'
import CodeSandboxPanel from './CodeSandboxPanel'

type View = 'notes' | 'period' | 'folders' | 'materials' | 'search' | 'versions' | 'recycle' | 'backup' | 'privacy' | 'ai'

const TABS: { key: View; label: string }[] = [
  { key: 'notes', label: '记事' },
  { key: 'period', label: '时段' },
  { key: 'folders', label: '文件夹' },
  { key: 'materials', label: '资料' },
  { key: 'search', label: '搜索' },
  { key: 'versions', label: '版本' },
  { key: 'recycle', label: '回收站' },
  { key: 'backup', label: '备份' },
  { key: 'privacy', label: '隐私' },
  { key: 'ai', label: 'AI' }
]

export default function MemoryPanel() {
  const [view, setView] = useState<View>('notes')
  const [notes, setNotes] = useState<Note[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [periodScope, setPeriodScope] = useState<PeriodScope>('day')
  const [periods, setPeriods] = useState<PeriodGroup[]>([])

  const refreshNotes = useCallback(async () => {
    const r = await bridge.listNotes()
    if (r.ok) setNotes(r.data)
  }, [])

  const refreshPeriod = useCallback(async () => {
    const r = await bridge.listPeriod(periodScope)
    if (r.ok) setPeriods(r.data)
  }, [periodScope])

  useEffect(() => {
    refreshNotes()
  }, [refreshNotes])

  useEffect(() => {
    if (view === 'period') refreshPeriod()
  }, [view, refreshPeriod])

  const onSaved = async () => {
    setEditingId(null)
    setCreating(false)
    await refreshNotes()
  }

  const archive = async (id: string) => {
    await bridge.archiveNote(id)
    refreshNotes()
  }

  const editingNote = notes.find((n) => n.id === editingId) ?? null

  return (
    <div className="flex h-full flex-col">
      <div className="flex gap-1 border-b bg-gray-100 px-3 py-1.5 dark:bg-gray-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={
              'rounded-md px-3 py-1 text-sm font-medium transition-colors ' +
              (view === t.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-gray-700')
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 p-3">
        {view === 'notes' && (
          <div className="flex h-full gap-3">
            <div className="flex w-64 shrink-0 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-center justify-between border-b px-3 py-2">
                <span className="text-sm font-semibold">记事条目</span>
                <button onClick={() => { setCreating(true); setEditingId(null) }} className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700">
                  ＋ 新建
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {notes.length === 0 ? (
                  <p className="p-3 text-center text-xs text-gray-400">暂无笔记</p>
                ) : (
                  <ul className="space-y-1">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        onClick={() => { setEditingId(n.id); setCreating(false) }}
                        className={
                          'cursor-pointer rounded-md border p-2 ' +
                          (editingId === n.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-gray-200 dark:border-gray-700')
                        }
                      >
                        <div className="flex items-center gap-1">
                          {n.pinned && <span className="text-xs">📌</span>}
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">{n.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between text-xs text-gray-400">
                          <span>{new Date(n.updatedAt).toLocaleString()}</span>
                          <button onClick={(e) => { e.stopPropagation(); archive(n.id) }} className="hover:text-red-500">归档</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col">
              {creating || editingId ? (
                <NoteEditor
                  note={creating ? null : editingNote}
                  onSaved={onSaved}
                  onCancel={() => { setCreating(false); setEditingId(null) }}
                />
              ) : (
                <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-400 dark:border-gray-600">
                  选择一条笔记编辑，或点击「新建」
                </div>
              )}
            </div>
          </div>
        )}

        {view === 'period' && (
          <div className="flex h-full flex-col">
            <div className="mb-2 flex gap-1">
              {(['day', 'week', 'month'] as PeriodScope[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setPeriodScope(s)}
                  className={
                    'rounded-md px-3 py-1 text-xs ' +
                    (periodScope === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300')
                  }
                >
                  {s === 'day' ? '今天' : s === 'week' ? '本周' : '本月'}
                </button>
              ))}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {periods.map((g) => (
                <div key={g.key} className="mb-3">
                  <h4 className="mb-2 text-sm font-semibold">{g.label}（{g.notes.length} 条）</h4>
                  <ul className="space-y-2">
                    {g.notes.map((n) => (
                      <li key={n.id} className="rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
                        <div className="text-sm font-semibold">{n.title}</div>
                        <p className="mt-1 line-clamp-2 text-xs text-gray-600 dark:text-gray-300">{n.content}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {periods.length === 0 && <p className="p-4 text-center text-sm text-gray-400">该时段暂无笔记</p>}
            </div>
          </div>
        )}

        {view === 'folders' && <div className="flex h-full"><CycleFolderView /></div>}
        {view === 'materials' && <div className="flex h-full"><MaterialLibrary /></div>}
        {view === 'search' && <div className="flex h-full"><SearchBar /></div>}
        {view === 'versions' && (
          <div className="flex h-full gap-3">
            <div className="w-64 shrink-0 overflow-y-auto rounded-lg border bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
              {notes.map((n) => (
                <button key={n.id} onClick={() => setEditingId(n.id)} className="block w-full truncate rounded p-1 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700">
                  {n.title}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 flex-1">
              {editingId ? (
                <VersionHistory noteId={editingId} onRestored={refreshNotes} />
              ) : (
                <div className="flex flex-1 items-center justify-center text-sm text-gray-400">选择笔记查看版本历史</div>
              )}
            </div>
          </div>
        )}
        {view === 'recycle' && <div className="flex h-full"><RecycleBin /></div>}
        {view === 'backup' && <div className="flex h-full"><BackupPanel /></div>}
        {view === 'privacy' && <div className="flex h-full"><PrivacySettings /></div>}
        {view === 'ai' && (
          <div className="flex h-full gap-3">
            <div className="min-w-0 flex-1"><AiSummaryPanel /></div>
            <div className="min-w-0 flex-1"><CodeSandboxPanel /></div>
          </div>
        )}
      </div>
    </div>
  )
}

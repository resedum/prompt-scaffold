import { useState } from 'react'
import { bridge } from '../api/bridge'
import type { Note, NoteInput, DimensionField } from '../../shared/memory-types'
import EnhanceDialog from './EnhanceDialog'

interface Props {
  note: Note | null
  onSaved: (n: Note) => void
  onCancel: () => void
}

export default function NoteEditor({ note, onSaved, onCancel }: Props) {
  const [title, setTitle] = useState(note?.title ?? '')
  const [content, setContent] = useState(note?.content ?? '')
  const [kind, setKind] = useState<Note['kind']>(note?.kind ?? 'note')
  const [tags, setTags] = useState((note?.tags ?? []).join(', '))
  const [busy, setBusy] = useState(false)
  const [enhanceOpen, setEnhanceOpen] = useState(false)
  const [dimFields, setDimFields] = useState<DimensionField[]>(note?.dimensionFields ?? [])

  const save = async () => {
    if (!content.trim()) return
    setBusy(true)
    const input: NoteInput = {
      title,
      content,
      format: 'markdown',
      kind,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      dimensionFields: dimFields,
      aiSource: dimFields.length ? 'enhanced' : 'manual',
      pinned: note?.pinned ?? false
    }
    const r = note ? await bridge.updateNote(note.id, input) : await bridge.createNote(input)
    setBusy(false)
    if (r.ok) onSaved(r.data)
    else alert(r.message)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="标题（留空取正文首行）"
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
        />
        <select value={kind} onChange={(e) => setKind(e.target.value as Note['kind'])} className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
          <option value="note">note</option>
          <option value="todo">todo</option>
          <option value="insight">insight</option>
          <option value="snippet">snippet</option>
          <option value="constraint">constraint</option>
        </select>
        <button
          onClick={() => setEnhanceOpen(true)}
          className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          补全维度
        </button>
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="记下此刻的想法…（支持 Markdown）"
        className="min-h-0 flex-1 resize-none bg-transparent p-3 text-sm outline-none"
      />
      <div className="flex items-center gap-2 border-t px-3 py-2">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="标签，逗号分隔"
          className="min-w-0 flex-1 rounded border border-gray-200 bg-transparent px-2 py-1 text-xs outline-none dark:border-gray-600"
        />
        {dimFields.length > 0 && (
          <span className="text-xs text-gray-400">{dimFields.length} 个维度字段</span>
        )}
        <button onClick={onCancel} className="rounded-md border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
          取消
        </button>
        <button onClick={save} disabled={busy} className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '保存中…' : '保存'}
        </button>
      </div>

      {enhanceOpen && (
        <EnhanceDialog
          text={content}
          onClose={() => setEnhanceOpen(false)}
          onApply={(fields) => {
            setDimFields(fields)
            setEnhanceOpen(false)
          }}
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { DimensionField } from '../../shared/memory-types'

interface Props {
  text: string
  onClose: () => void
  onApply: (fields: DimensionField[]) => void
}

export default function EnhanceDialog({ text, onClose, onApply }: Props) {
  const [fields, setFields] = useState<DimensionField[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // 生效档位以隐私控制中心为准（主进程也会再次校验，这里仅展示、不提供覆盖入口）
  const [scope, setScope] = useState<'off' | 'local' | 'external'>('off')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    bridge.getPrivacy().then((r) => {
      if (r.ok) setScope(r.data.privacy.capabilities.enhance)
    })
  }, [])

  const run = async () => {
    setBusy(true)
    setNotice(null)
    const r = await bridge.enhanceText({ text, scope })
    setBusy(false)
    if (r.ok) {
      setFields(r.data)
      setSelected(new Set(r.data.map((_, i) => i)))
    } else {
      setNotice(r.message)
    }
  }

  const toggle = (i: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const updateValue = (i: number, value: string) => {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, value } : f)))
  }

  const apply = () => {
    const chosen = fields.filter((_, i) => selected.has(i))
    onApply(chosen)
  }

  const scopeLabel =
    scope === 'off' ? '🔒 AI 已关（规则池）' : scope === 'local' ? '🔒 本地模型' : '☁️ 外部模型'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="flex max-h-[80vh] w-[520px] flex-col rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">补全维度（AI 提议，你勾选采纳）</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs dark:bg-gray-700">{scopeLabel}</span>
          <span className="text-xs text-gray-400">档位在「隐私」设置中修改</span>
          <button onClick={run} disabled={busy} className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? '生成中…' : '生成'}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {fields.length === 0 ? (
            <p className="p-3 text-center text-xs text-gray-400">{notice ?? '点击「生成」获得维度建议'}</p>
          ) : (
            <ul className="space-y-2">
              {fields.map((f, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-gray-200 p-2 dark:border-gray-700">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="mt-1" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">{f.name}</div>
                    <textarea
                      value={f.value}
                      onChange={(e) => updateValue(i, e.target.value)}
                      rows={2}
                      className="mt-1 w-full resize-none bg-transparent text-xs text-gray-600 outline-none dark:text-gray-300"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t pt-3">
          <button onClick={onClose} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">取消</button>
          <button onClick={apply} disabled={fields.length === 0} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50">
            采纳勾选项
          </button>
        </div>
      </div>
    </div>
  )
}

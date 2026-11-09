import { useState } from 'react'
import { bridge } from '../api/bridge'
import type { AiExecutionTask } from '../../shared/memory-types'

export default function CodeSandboxPanel() {
  const [code, setCode] = useState('')
  const [language, setLanguage] = useState('javascript')
  const [task, setTask] = useState<AiExecutionTask | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (!code.trim()) return
    setBusy(true)
    const r = await bridge.runSandbox({ language, codeSnippet: code })
    setBusy(false)
    if (r.ok) setTask(r.data)
    else alert(r.message)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-lg border bg-white dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <span className="text-sm font-semibold">代码执行（本地沙箱）</span>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-700">
          <option value="javascript">javascript</option>
          <option value="typescript">typescript</option>
          <option value="python">python（暂不支持，仅本地 JS）</option>
        </select>
        <span className="text-xs text-gray-400">禁网络 / 文件 / 系统调用，代码不出机</span>
        <button onClick={run} disabled={busy} className="ml-auto rounded-md bg-blue-600 px-3 py-1 text-xs text-white hover:bg-blue-700 disabled:opacity-50">
          {busy ? '运行中…' : '运行'}
        </button>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={'// 例如：\nconst a = 1 + 2;\nconsole.log(a);'}
        className="min-h-0 flex-1 resize-none bg-transparent p-3 font-mono text-sm outline-none"
      />
      {task && (
        <div className="border-t p-2">
          <div className="mb-1 text-xs">
            状态：<span className={task.status === 'success' ? 'text-green-600' : 'text-red-500'}>{task.status}</span>
          </div>
          {task.stdout && <pre className="whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs dark:bg-gray-900">{task.stdout}</pre>}
          {task.stderr && <pre className="whitespace-pre-wrap rounded bg-red-50 p-2 text-xs text-red-600 dark:bg-red-900/30">{task.stderr}</pre>}
        </div>
      )}
    </div>
  )
}

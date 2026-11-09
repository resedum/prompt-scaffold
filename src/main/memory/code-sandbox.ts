/**
 * AI 代码执行 · 本地 node:vm 沙箱（ARCHITECTURE-v2 §6.4 / CROSS-PLATFORM R15）。
 * - 子进程用 process.execPath + ELECTRON_RUN_AS_NODE=1（打包后无独立 node，三平台通用）
 * - 白名单注入 Math/JSON/Date 等纯函数，禁 require/fs/net/process；vm timeout + 外层超时 kill
 * - 超时/异常一律 timeout/failed，绝不影响主进程
 */
import { spawn } from 'child_process'
import { join } from 'path'
import { ensureDir, JsonCollection, makeId, nowIso } from './fs-utils'
import type { SandboxInput, AiExecutionTask, AiTaskStatus } from '../../shared/memory-types'

/** vm 子进程执行器源码（独立进程跑 vm，隔离更稳；禁一切 I/O 与网络） */
const RUNNER_SOURCE = `
const vm = require('node:vm');
const code = process.argv[1] || '';
const sandbox = {
  Math: Math,
  JSON: JSON,
  Date: Date,
  TextEncoder: TextEncoder,
  TextDecoder: TextDecoder,
  Array: Array,
  Object: Object,
  String: String,
  Number: Number,
  Boolean: Boolean
};
sandbox.globalThis = sandbox;
let stdout = '';
let stderr = '';
sandbox.console = {
  log: function () { stdout += Array.prototype.map.call(arguments, String).join(' ') + '\\n'; },
  info: function () { stdout += Array.prototype.map.call(arguments, String).join(' ') + '\\n'; },
  error: function () { stderr += Array.prototype.map.call(arguments, String).join(' ') + '\\n'; },
  warn: function () { stderr += Array.prototype.map.call(arguments, String).join(' ') + '\\n'; }
};
try {
  const result = vm.runInNewContext(code, sandbox, { timeout: 10000, displayErrors: true });
  if (result !== undefined) stdout += String(result) + '\\n';
  process.stdout.write(JSON.stringify({ status: 'success', stdout: stdout, stderr: stderr }));
} catch (e) {
  const timeout = e && (e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' || /timed out/i.test(String(e && e.message)));
  stderr += String((e && e.message) || e);
  process.stdout.write(JSON.stringify({ status: timeout ? 'timeout' : 'failed', stdout: stdout, stderr: stderr }));
}
`

export interface SandboxRunOutput {
  status: AiTaskStatus
  stdout: string
  stderr: string
  result?: string
}

export class CodeSandbox {
  private tasks: JsonCollection<AiExecutionTask>

  constructor(public readonly dir: string) {
    ensureDir(dir)
    this.tasks = new JsonCollection<AiExecutionTask>(join(dir, 'ai-tasks.json'))
  }

  listTasks(): AiExecutionTask[] {
    return this.tasks.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  reload(): void {
    this.tasks.clearCache()
  }

  async run(input: SandboxInput): Promise<AiExecutionTask> {
    const task: AiExecutionTask = {
      id: makeId(),
      noteId: input.noteId,
      language: input.language,
      codeSnippet: input.codeSnippet,
      sandbox: 'local',
      status: 'running',
      stdout: '',
      stderr: '',
      result: undefined,
      createdAt: nowIso()
    }
    this.tasks.push(task)
    const out = await runInVm(input.codeSnippet, 12000)
    task.status = out.status
    task.stdout = out.stdout
    task.stderr = out.stderr
    task.result = out.result
    this.tasks.update(task.id, task)
    return task
  }
}

/** 用 process.execPath + ELECTRON_RUN_AS_NODE=1 起子进程跑 vm */
function runInVm(code: string, timeoutMs: number): Promise<SandboxRunOutput> {
  return new Promise<SandboxRunOutput>((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(process.execPath, ['--max-old-space-size=128', '-e', RUNNER_SOURCE, code], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch (e) {
      resolve({ status: 'failed', stdout: '', stderr: String(e) })
      return
    }

    let out = ''
    let errOut = ''
    let settled = false
    const finish = (r: SandboxRunOutput) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(r)
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        /* ignore */
      }
      finish({ status: 'timeout', stdout: out, stderr: errOut + '\n[执行超时，已终止]' })
    }, timeoutMs)

    child.stdout?.on('data', (d: Buffer) => {
      out += d.toString('utf-8')
    })
    child.stderr?.on('data', (d: Buffer) => {
      errOut += d.toString('utf-8')
    })
    child.on('error', (e) => finish({ status: 'failed', stdout: out, stderr: String(e) }))
    child.on('close', () => {
      try {
        const j = JSON.parse(out.trim()) as SandboxRunOutput
        finish({ status: j.status, stdout: j.stdout, stderr: j.stderr, result: j.result })
      } catch {
        finish({ status: 'failed', stdout: out, stderr: errOut || out || '沙箱子进程无有效输出' })
      }
    })
  })
}

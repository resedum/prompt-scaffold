/**
 * 隐私档位校验 + 发送范围裁剪（ARCHITECTURE-v2 §4.2 PrivacyGuard，横切所有出机动作）。
 * 纯函数/无 electron 依赖，可被单测直接覆盖。
 */
import type { AiScope, SendScope, PrivacyConfig, CapabilityKey } from '../../shared/privacy-types'
import type { Note, PrivacyPreflight } from '../../shared/memory-types'
import type { ModelConfig } from '../../shared/types'

/** 构造带错误码的 Error（ipc 层据此映射 ErrorCode） */
export function memoryError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

export class PrivacyDeniedError extends Error {
  code = 'PRIVACY_DENIED'
  constructor(public capability: CapabilityKey) {
    super('该 AI 能力未开启（隐私档位为关闭）')
    this.name = 'PrivacyDeniedError'
  }
}

export class PrivacyGuard {
  constructor(private getConfig: () => PrivacyConfig) {}

  /** 取某能力当前档位（逃生舱打开时一律 off） */
  scopeOf(cap: CapabilityKey): AiScope {
    const c = this.getConfig()
    if (c.masterAiKill) return 'off'
    return c.capabilities[cap] ?? 'off'
  }

  /** 出机动作前置校验：off 直接抛 PRIVACY_DENIED */
  check(cap: CapabilityKey): void {
    if (this.scopeOf(cap) === 'off') throw new PrivacyDeniedError(cap)
  }

  /** 默认发送范围 */
  sendScope(): SendScope {
    return this.getConfig().sendScope ?? 'selected'
  }

  /** 出机前置确认信息 */
  preflight(cap: CapabilityKey, notes: Note[], sendScope: SendScope, baseUrl: string): PrivacyPreflight {
    const scope = this.scopeOf(cap)
    const trimmed = applySendScope(notes, sendScope, new Set(notes.map((n) => n.id)))
    const text = buildSendText(trimmed)
    return {
      capability: cap,
      scope,
      engine: scope === 'local' ? 'local' : 'external',
      baseUrl,
      charCount: text.length,
      includesExtractedText: false,
      noteCount: notes.length
    }
  }
}

export interface TrimmedNotes {
  /** 全文发送的条目 */
  full: Note[]
  /** 仅「标题 + 去敏摘要」参与的条目 */
  masked: Note[]
}

/** 按发送范围裁剪：all → 全部全文；selected → 仅勾选全文，其余去敏 */
export function applySendScope(notes: Note[], scope: SendScope, selectedIds: Set<string>): TrimmedNotes {
  if (scope === 'all') return { full: notes, masked: [] }
  const full: Note[] = []
  const masked: Note[] = []
  for (const n of notes) {
    if (selectedIds.has(n.id)) full.push(n)
    else masked.push(maskNote(n))
  }
  return { full, masked }
}

/** 去敏：保留标题，清空正文与维度字段（不发送原文） */
export function maskNote(note: Note): Note {
  return {
    ...note,
    content: '',
    dimensionFields: []
  }
}

/** 生成实际外发文本（full 全文 + masked 仅标题/占位） */
export function buildSendText(trimmed: TrimmedNotes): string {
  const parts: string[] = []
  for (const n of trimmed.full) {
    parts.push(`# ${n.title ?? '未命名'}\n${n.content}`)
  }
  for (const n of trimmed.masked) {
    parts.push(`# ${n.title ?? '未命名'}\n[正文已按隐私设置省略，仅标题参与]`)
  }
  return parts.join('\n\n')
}

/** 校验发送范围参数合法（外部输入防御） */
export function isSendScope(v: unknown): v is SendScope {
  return v === 'all' || v === 'selected'
}

/** 校验 AI 档位参数合法 */
export function isAiScope(v: unknown): v is AiScope {
  return v === 'off' || v === 'local' || v === 'external'
}

/** 取当前引擎（local → 本地模型；external → 外部模型） */
export function engineOf(scope: AiScope): 'local' | 'external' | 'none' {
  if (scope === 'local') return 'local'
  if (scope === 'external') return 'external'
  return 'none'
}

/** 本地 Ollama 预设模型配置（复用 constants 中的预设） */
export function localModelConfig(modelConfig: ModelConfig): ModelConfig {
  return {
    presetId: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    apiKey: '',
    model: modelConfig.model || 'qwen2.5:7b',
    visionModel: modelConfig.visionModel || ''
  }
}

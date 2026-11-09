/**
 * AI 总结（三档，默认关；ARCHITECTURE-v2 §4.2 SummarizeService / §4.3 链路②）。
 * 复用 llm.ts；本地档接 Ollama、外部档接用户配置；发送范围经 privacy-guard 裁剪。
 */
import { join } from 'path'
import { JsonCollection, makeId, nowIso } from './fs-utils'
import { PrivacyGuard, applySendScope, buildSendText, engineOf, localModelConfig, memoryError } from './privacy-guard'
import { LLMProvider } from '../ai/llm'
import type { SummaryResult, SummaryRequest } from '../../shared/memory-types'
import type { ModelConfig } from '../../shared/types'
import type { MemoryStore } from './memory-store'

const SYSTEM_PROMPT =
  '你是本地记忆记事本的回顾助手。请基于用户给出的笔记内容，客观、简洁地总结要点（目标、结论、约束、待办）。不要编造原文没有的信息；对未提供的信息用「待补」占位；只输出总结正文，不要额外解释。'

export interface SummarizeContext {
  memoryStore: MemoryStore
  privacyGuard: PrivacyGuard
  getModelConfig: () => ModelConfig
}

export class SummarizeService {
  private summaries: JsonCollection<SummaryResult>

  constructor(
    public readonly dir: string,
    private ctx: SummarizeContext
  ) {
    this.summaries = new JsonCollection<SummaryResult>(join(dir, 'summaries.json'))
  }

  list(): SummaryResult[] {
    return this.summaries.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  reload(): void {
    this.summaries.clearCache()
  }

  async summarize(req: SummaryRequest): Promise<SummaryResult> {
    const scope = this.ctx.privacyGuard.scopeOf('summarize')
    if (scope === 'off') {
      throw memoryError('PRIVACY_DENIED', 'AI 总结未开启（隐私档位为关闭）')
    }

    const allNotes = this.ctx.memoryStore.listNotes({ archived: false })
    const selected = req.noteIds.length > 0 ? allNotes.filter((n) => req.noteIds.includes(n.id)) : allNotes
    if (selected.length === 0) throw memoryError('NOT_FOUND', '没有可总结的笔记')

    const sendScope = req.sendScope === 'all' ? 'all' : 'selected'
    const trimmed = applySendScope(selected, sendScope, new Set(req.noteIds))
    const text = buildSendText(trimmed)
    if (!text.trim()) throw memoryError('NOT_FOUND', '裁剪后没有可发送的内容')

    const engine = engineOf(scope)
    const llm = new LLMProvider(engine === 'local' ? localModelConfig(this.ctx.getModelConfig()) : this.ctx.getModelConfig())
    const content = await llm.completeText(SYSTEM_PROMPT, text)

    const result: SummaryResult = {
      id: makeId(),
      sourceNoteIds: selected.map((n) => n.id),
      engine,
      sendScope,
      content,
      createdAt: nowIso()
    }
    this.summaries.push(result)
    return result
  }
}

/**
 * Prompt 模板 + 上下文注入 + 长文本预算工具（ARCHITECTURE §6.2 PromptBuilder）。
 * 纯函数、零依赖，可单测。
 */
import type { GenerateInput, Dimension } from '../../shared/types'
import { SUMMARIZE_CHUNK_CHARS } from '../../shared/constants'

export interface PromptPair {
  system: string
  user: string
}

/** 语言路由：zh 默认中文，其余英文 */
function langOf(lang: string): 'zh' | 'en' {
  return lang === 'en' ? 'en' : 'zh'
}

function habitsBlock(habits: Dimension[]): string {
  if (!habits || habits.length === 0) return ''
  const lines = habits.map((h) => `- ${h.name}：${h.wording}`)
  return '用户长期偏好的维度措辞（如适用请采纳或参考，不要强行套用）：\n' + lines.join('\n')
}

export function buildDimensionsPrompt(input: GenerateInput, habits: Dimension[] = []): PromptPair {
  const zh = langOf(input.language) === 'zh'
  const system = zh
    ? [
        '你是一个需求澄清助手。用户写下一句模糊需求，你的任务是补全他可能遗漏的维度。',
        '严格输出 JSON，格式：{"dimensions":[{"name":"维度名","wording":"具体措辞"}]}。',
        '每条 wording 是可被直接采用或稍作修改的具体建议，不是单个词。',
        '用户未提供的信息，用「待补：xxx」占位，绝不替用户编造或填空。',
        '不要改写用户原话，补充说明以追加形式存在。',
        '只输出 JSON，不要解释、不要 markdown 代码块。',
        '输出 5–10 条维度，按重要程度排序。'
      ].join('\n')
    : [
        'You are a requirement clarification assistant. The user wrote a vague request; complete the dimensions they may have missed.',
        'Output strict JSON only: {"dimensions":[{"name":"...","wording":"..."}]}.',
        'Each "wording" must be a concrete, directly-adoptable suggestion, not a single word.',
        'For information the user did not provide, use a placeholder like "TBD: ..." — never fabricate.',
        'Do not rewrite the user\'s words; additions are appended, not substituted.',
        'Output JSON only, no explanation, no markdown fences.',
        'Output 5–10 dimensions ordered by importance.'
      ].join('\n')

  const hb = habitsBlock(habits)
  const user = [input.text, hb].filter((s) => s && s.trim()).join('\n\n')
  return { system, user }
}

export function buildSummaryPrompt(input: GenerateInput): PromptPair {
  const zh = langOf(input.language) === 'zh'
  const system = zh
    ? [
        '你是一个长对话需求整理助手。用户粘贴了一段多轮对话，请提炼他当前仍有效的核心诉求。',
        '严格输出 JSON，格式：{"summary":{"goal":"核心目标","conclusions":["已达成结论"],"constraints":["仍在生效的约束"],"open":["待确认事项"]},"dimensions":[{"name":"维度名","wording":"具体措辞"}]}。',
        '只保留「当前仍有效」的约束；已被用户明确撤回或否定的要求，不要放进 constraints。',
        '用户未提供的信息用「待补：xxx」占位，绝不编造。',
        'dimensions 用于补全该诉求可能遗漏的维度，5–10 条，wording 要具体可直接采用。',
        '只输出 JSON，不要解释、不要 markdown 代码块。'
      ].join('\n')
    : [
        'You are a long-conversation requirement organizer. The user pasted a multi-turn conversation; extract their currently-valid core requirements.',
        'Output strict JSON only: {"summary":{"goal":"...","conclusions":["..."],"constraints":["..."],"open":["..."]},"dimensions":[{"name":"...","wording":"..."}]}.',
        'Keep only constraints that are currently valid; do not include requirements the user explicitly withdrew.',
        'Use "TBD: ..." placeholders for unknown info — never fabricate.',
        'dimensions: 5–10 missing dimensions with concrete, adoptable wording.',
        'Output JSON only, no explanation, no markdown fences.'
      ].join('\n')

  return { system, user: input.text }
}

/** 按字符数粗估 token（中文 ~1.5 字/token，英文 ~4 字/token） */
export function estimateTokens(text: string): number {
  let cjk = 0
  let other = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) cjk++
    else if (!/\s/.test(ch)) other++
  }
  return Math.ceil(cjk / 1.5 + other / 4)
}

/** 固定窗口切块，尽量在换行或句末标点处断开 */
export function chunkText(text: string, chunkSize: number = SUMMARIZE_CHUNK_CHARS): string[] {
  if (!text) return []
  if (text.length <= chunkSize) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > chunkSize) {
    const window = rest.slice(0, chunkSize)
    let cut = window.lastIndexOf('\n')
    if (cut < chunkSize * 0.5) {
      const m = window.match(/[。！？.!?；;]/g)
      if (m && m.length) {
        const last = window.lastIndexOf(m[m.length - 1])
        if (last >= chunkSize * 0.5) cut = last + 1
      }
    }
    if (cut < chunkSize * 0.5 || cut <= 0) cut = chunkSize
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trimStart()
  }
  if (rest.trim()) chunks.push(rest.trim())
  return chunks.filter((c) => c.length > 0)
}

/** 截断 + 保留头尾（ARCHITECTURE §1.6 第一级策略） */
export function truncateKeepHeadTail(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const sep = '\n\n…[中段已省略]…\n\n'
  const head = Math.floor(maxChars * 0.6)
  const tail = maxChars - head - sep.length
  if (tail <= 0) return text.slice(0, maxChars)
  return text.slice(0, head) + sep + text.slice(text.length - tail)
}

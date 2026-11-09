/**
 * 容错 JSON 解析（共享知识 §10.2）。
 * AI 原始返回先剥 markdown 代码块、提取首个 JSON 对象；解析失败抛出带 code 的错误。
 * 纯函数、零依赖，可单测。
 */
import type { Dimension, DimensionResult, SummaryResult, Summary } from '../../shared/types'

export class ParseError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ParseError'
    this.code = code
  }
}

function toStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

function normalizeDimension(item: unknown): Dimension | null {
  if (!item || typeof item !== 'object') return null
  const o = item as Record<string, unknown>
  const name =
    toStr(o.name) || toStr(o.dimension) || toStr(o.label) || toStr(o.title) || ''
  const wording =
    toStr(o.wording) ||
    toStr(o.suggestion) ||
    toStr(o.description) ||
    toStr(o.content) ||
    toStr(o.text) ||
    ''
  if (!name && !wording) return null
  return { name, wording }
}

function extractArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    if (Array.isArray(o.dimensions)) return o.dimensions as unknown[]
    if (Array.isArray(o.items)) return o.items as unknown[]
    if (Array.isArray(o.result)) return o.result as unknown[]
    if (Array.isArray(o.list)) return o.list as unknown[]
  }
  return []
}

export class JsonParser {
  /** 剥 markdown 代码块并定位首个 JSON 对象/数组区间 */
  static stripCodeFence(raw: string): string {
    let s = (raw ?? '').trim()
    // 去除 ```json ... ``` 或 ``` ... ```
    const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) s = fence[1].trim()
    const start = s.search(/[[{]/)
    if (start < 0) return s
    // 从最后一个 ] 或 } 处截断，丢弃 JSON 之外的说明文字
    let end = -1
    const lastBrace = s.lastIndexOf('}')
    const lastBracket = s.lastIndexOf(']')
    end = Math.max(lastBrace, lastBracket)
    if (end < 0 || end <= start) return s
    return s.slice(start, end + 1)
  }

  static parseDimensions(raw: string): DimensionResult {
    let text: string
    try {
      text = JsonParser.stripCodeFence(raw)
    } catch {
      throw new ParseError('PARSE_ERROR', '无法定位 JSON 内容')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ParseError('PARSE_ERROR', 'JSON 语法错误')
    }
    const arr = extractArray(parsed)
    const dimensions: Dimension[] = []
    for (const item of arr) {
      const d = normalizeDimension(item)
      if (d) dimensions.push(d)
    }
    return { dimensions }
  }

  static parseSummary(raw: string): SummaryResult {
    let text: string
    try {
      text = JsonParser.stripCodeFence(raw)
    } catch {
      throw new ParseError('PARSE_ERROR', '无法定位 JSON 内容')
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new ParseError('PARSE_ERROR', 'JSON 语法错误')
    }
    const root = (parsed ?? {}) as Record<string, unknown>
    const summaryRaw = (root.summary ?? root) as Record<string, unknown>
    const toArr = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.map(toStr).filter((x) => x.length > 0)
      if (typeof v === 'string' && v.trim()) return [v.trim()]
      return []
    }
    const summary: Summary = {
      goal: toStr(summaryRaw.goal) || toStr(summaryRaw.coreGoal) || '',
      conclusions: toArr(summaryRaw.conclusions),
      constraints: toArr(summaryRaw.constraints),
      open: toArr(summaryRaw.open) || toArr(summaryRaw.openQuestions)
    }
    const arr = extractArray(root)
    const dimensions: Dimension[] = []
    for (const item of arr) {
      const d = normalizeDimension(item)
      if (d) dimensions.push(d)
    }
    return { summary, dimensions }
  }
}

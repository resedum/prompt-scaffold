/**
 * 产物拼装（渲染层纯函数）。
 * 核心交互原则：不静默改写——用户原话不被覆盖，补充说明以追加形式存在。
 */
import type { Dimension, Summary } from '../../shared/types'

export interface UiDimension extends Dimension {
  id: string
  selected: boolean
  removed: boolean
}

/** 完整指令 = 原始输入 + 追加补充说明（不覆盖原话） */
export function buildPreviewText(text: string, dims: Dimension[], lang: 'zh' | 'en'): string {
  const header =
    lang === 'zh' ? '\n——以下为补充说明（可自行取舍）——' : '\n—— Additional notes (optional) ——'
  const lines = dims.map((d) => `- ${d.name}：${d.wording}`)
  const parts = [text.trimEnd()]
  if (lines.length) parts.push(header + '\n' + lines.join('\n'))
  return parts.join('\n')
}

export function buildDimensionsText(dims: Dimension[]): string {
  return dims.map((d) => `- ${d.name}：${d.wording}`).join('\n')
}

export function buildSummaryText(summary: Summary, lang: 'zh' | 'en'): string {
  const labels =
    lang === 'zh'
      ? { goal: '核心目标', conclusions: '已达成结论', constraints: '仍在生效的约束', open: '待确认事项' }
      : { goal: 'Goal', conclusions: 'Conclusions', constraints: 'Active constraints', open: 'Open questions' }
  const lines: string[] = []
  lines.push(`【${labels.goal}】${summary.goal}`)
  if (summary.conclusions.length) {
    lines.push(`【${labels.conclusions}】`)
    summary.conclusions.forEach((c) => lines.push(`- ${c}`))
  }
  if (summary.constraints.length) {
    lines.push(`【${labels.constraints}】`)
    summary.constraints.forEach((c) => lines.push(`- ${c}`))
  }
  if (summary.open.length) {
    lines.push(`【${labels.open}】`)
    summary.open.forEach((c) => lines.push(`- ${c}`))
  }
  return lines.join('\n')
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `d-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

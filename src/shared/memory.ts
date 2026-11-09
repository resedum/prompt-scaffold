/**
 * 记忆写入原则（共享知识 §10.7 / PRD v5 §4）：AI 只能提议，不能决定。
 * 维度措辞偏好（dimensionHabits）仅「AI 提议 + 用户采纳」才写入，无自动采集。
 * 数据模型为 MemoryHabit（含来源与时间戳）；旧 {name,wording} 在 dedupeHabits 归一化时自动升级。
 * 此模块为纯函数，供渲染层「设为习惯」操作与单测复用。
 */
import type { Dimension, MemoryHabit, MemoryHabitSource } from './types'

/** 生成当前 ISO 8601 UTC 时间戳 */
export function nowIso(): string {
  return new Date().toISOString()
}

function isMemoryHabitSource(v: unknown): v is MemoryHabitSource {
  return v === 'ai-adopted' || v === 'imported' || v === 'manual'
}

function isIsoString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}

/**
 * 依据「是否采纳」决定是否写入习惯。
 * - adopted === false → 归一化后原样返回（不写入，体现「用户不采纳不落盘」）
 * - adopted === true  → 按 name 去重 upsert（同名覆盖措辞、保留原 createdAt，否则追加）
 * 统一输出 MemoryHabit[]，source 为 'ai-adopted'。
 */
export function adoptHabit(habits: Dimension[], proposed: Dimension, adopted: boolean): MemoryHabit[] {
  const base = dedupeHabits(habits)
  if (!adopted) return base

  const name = (proposed.name ?? '').trim()
  const wording = (proposed.wording ?? '').trim()
  if (!name || !wording) return base

  const now = nowIso()
  const idx = base.findIndex((h) => h.name === name)
  const item: MemoryHabit = {
    name,
    wording,
    source: 'ai-adopted',
    createdAt: idx >= 0 ? base[idx].createdAt : now,
    updatedAt: now
  }
  if (idx >= 0) base[idx] = item
  else base.push(item)
  return base
}

/**
 * 归一化 + 去重合并（加载/保存时容错）。
 * 旧 {name,wording} 自动升级为完整 MemoryHabit（source='ai-adopted'，时间戳取当前）。
 */
export function dedupeHabits(habits: Dimension[]): MemoryHabit[] {
  const seen = new Set<string>()
  const out: MemoryHabit[] = []
  const now = nowIso()
  for (const raw of habits) {
    if (!raw) continue
    const h = raw as Partial<MemoryHabit> & Dimension
    const name = (h.name ?? '').trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({
      name,
      wording: (h.wording ?? '').trim(),
      source: isMemoryHabitSource(h.source) ? h.source : 'ai-adopted',
      createdAt: isIsoString(h.createdAt) ? h.createdAt : now,
      updatedAt: isIsoString(h.updatedAt) ? h.updatedAt : now
    })
  }
  return out
}

/** 移除已采纳的习惯（「设为习惯」反选时使用），保持输入元素类型 */
export function removeHabit<T extends Dimension>(habits: T[], name: string): T[] {
  return habits.filter((h) => h.name !== name.trim())
}

/** 判断某维度是否已采纳为习惯 */
export function isAdopted(habits: Dimension[], name: string): boolean {
  return habits.some((h) => h.name === name.trim())
}

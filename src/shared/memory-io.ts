/**
 * 记忆库导入/导出/合并/校验纯函数（ARCHITECTURE v2 §2.4 + MEMORY-TOOL-ARCHITECTURE-v2 §7）。
 * - 维度措辞习惯（dimensionHabits）导入导出：serializeMemoryExport / parseMemoryImport / mergeHabits
 * - 记忆记事本全量包（notes/folders/materials/summaries/reminders）导入导出：serializeMemoryBundle / parseMemoryBundle / mergeMemoryBundle
 * 全部零依赖、可单测。
 */
import type {
  MemoryHabit,
  MemoryHabitSource,
  MemoryImportResult,
  MemoryImportStrategy
} from './types'
import type {
  Note,
  NoteKind,
  NoteFormat,
  AiSource,
  CycleFolder,
  Material,
  SummaryResult,
  ReminderTask
} from './memory-types'
import { MEMORY_EXPORT_VERSION, MEMORY_IMPORT_MAX_ITEMS } from './constants'
import { dedupeHabits, nowIso } from './memory'

/** 带错误码的导入错误（IPC 层据此映射 IMPORT_INVALID） */
export class MemoryIOError extends Error {
  code: 'IMPORT_INVALID'
  constructor(message: string) {
    super(message)
    this.name = 'MemoryIOError'
    this.code = 'IMPORT_INVALID'
  }
}

function isMemoryHabitSource(v: unknown): v is MemoryHabitSource {
  return v === 'ai-adopted' || v === 'imported' || v === 'manual'
}

function isIsoString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v))
}

/** 导出为 version 化 JSON 字符串（含去重） */
export function serializeMemoryExport(habits: MemoryHabit[]): string {
  const payload = {
    version: MEMORY_EXPORT_VERSION,
    exportedAt: nowIso(),
    habits: dedupeHabits(habits)
  }
  return JSON.stringify(payload, null, 2)
}

export interface ParsedMemoryImport {
  habits: MemoryHabit[]
  invalidCount: number
}

/**
 * 解析导入内容：兼容 {habits} / {dimensionHabits} / 裸数组，逐条归一化（源默认 imported）。
 * - JSON.parse 失败 → 抛 IMPORT_INVALID
 * - 结构无法识别 → 抛 IMPORT_INVALID
 * - name 空 → 跳过并 invalidCount++
 * - 全非法 / 超过上限 → 抛 IMPORT_INVALID
 */
export function parseMemoryImport(raw: string): ParsedMemoryImport {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new MemoryIOError('文件不是合法 JSON')
  }

  let arr: unknown[]
  if (Array.isArray(parsed)) {
    arr = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.habits)) arr = obj.habits
    else if (Array.isArray(obj.dimensionHabits)) arr = obj.dimensionHabits
    else throw new MemoryIOError('文件结构无法识别（应为 {habits:[…]} 或数组）')
  } else {
    throw new MemoryIOError('文件结构无法识别（应为 {habits:[…]} 或数组）')
  }

  const habits: MemoryHabit[] = []
  let invalidCount = 0
  const now = nowIso()
  for (const item of arr) {
    if (!item || typeof item !== 'object') {
      invalidCount++
      continue
    }
    const h = item as Record<string, unknown>
    const name = String(h.name ?? '').trim()
    if (!name) {
      invalidCount++
      continue
    }
    habits.push({
      name,
      wording: String(h.wording ?? '').trim(),
      source: isMemoryHabitSource(h.source) ? h.source : 'imported',
      createdAt: isIsoString(h.createdAt) ? (h.createdAt as string) : now,
      updatedAt: isIsoString(h.updatedAt) ? (h.updatedAt as string) : now
    })
  }

  if (habits.length === 0) throw new MemoryIOError('没有可导入的有效条目')
  if (habits.length > MEMORY_IMPORT_MAX_ITEMS) {
    throw new MemoryIOError(`条目过多（超过 ${MEMORY_IMPORT_MAX_ITEMS} 条），无法导入`)
  }
  return { habits, invalidCount }
}

/**
 * 按策略合并：先对 incoming 去重（首条生效）。
 * - overwrite：整体替换为去重后的 incoming
 * - merge：同名以导入为准（source=imported，updatedAt=now），不同名追加；统计 added/overwritten
 */
export function mergeHabits(
  current: MemoryHabit[],
  incoming: MemoryHabit[],
  strategy: MemoryImportStrategy
): MemoryImportResult {
  const inc = dedupeHabits(incoming)
  if (strategy === 'overwrite') {
    return { habits: inc, added: inc.length, overwritten: 0 }
  }

  const next = dedupeHabits(current)
  let added = 0
  let overwritten = 0
  const now = nowIso()
  for (const item of inc) {
    const idx = next.findIndex((h) => h.name === item.name)
    if (idx >= 0) {
      next[idx] = {
        name: item.name,
        wording: item.wording,
        source: 'imported',
        createdAt: item.createdAt || next[idx].createdAt,
        updatedAt: now
      }
      overwritten++
    } else {
      next.push(item)
      added++
    }
  }
  return { habits: next, added, overwritten }
}

// ============================================================================
// 记忆记事本全量包（notes / cycleFolders / materials / summaries / reminders）
// ============================================================================

export const MEMORY_BUNDLE_VERSION = 1

export interface MemoryBundle {
  version: number
  exportedAt: string
  notes: Note[]
  cycleFolders: CycleFolder[]
  materials: Material[]
  summaries: SummaryResult[]
  reminders: ReminderTask[]
}

export interface ParsedMemoryBundle {
  bundle: MemoryBundle
  invalidCount: number
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

function strOf(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function strArrOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

function isNoteKind(v: unknown): v is NoteKind {
  return v === 'note' || v === 'todo' || v === 'insight' || v === 'snippet' || v === 'constraint'
}

function isNoteFormat(v: unknown): v is NoteFormat {
  return v === 'markdown' || v === 'text'
}

function isAiSource(v: unknown): v is AiSource {
  return v === 'none' || v === 'manual' || v === 'enhanced'
}

/** 生成随机 id（渲染/主进程均可用的纯函数实现，无 node 依赖） */
export function makeBundleId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

function dedupeById<T extends { id: string }>(arr: T[]): T[] {
  const m = new Map<string, T>()
  for (const it of arr) {
    if (it && typeof it.id === 'string' && it.id) m.set(it.id, it)
  }
  return Array.from(m.values())
}

/** 归一化一条 Note（非法返回 null） */
export function normalizeNote(raw: unknown, now = nowIso()): Note | null {
  if (!isRecord(raw)) return null
  const content = strOf(raw.content)
  if (!content.trim()) return null
  return {
    id: strOf(raw.id) || makeBundleId(),
    title: raw.title == null || raw.title === '' ? undefined : strOf(raw.title),
    content,
    format: isNoteFormat(raw.format) ? raw.format : 'text',
    kind: isNoteKind(raw.kind) ? raw.kind : 'note',
    tags: strArrOf(raw.tags),
    dimensionFields: Array.isArray(raw.dimensionFields)
      ? raw.dimensionFields
          .filter(isRecord)
          .map((f) => ({ name: strOf(f.name), value: strOf(f.value) }))
      : [],
    aiSource: isAiSource(raw.aiSource) ? raw.aiSource : 'none',
    cycleFolderId: typeof raw.cycleFolderId === 'string' ? raw.cycleFolderId : undefined,
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    createdAt: isIsoString(raw.createdAt) ? (raw.createdAt as string) : now,
    updatedAt: isIsoString(raw.updatedAt) ? (raw.updatedAt as string) : now
  }
}

function normalizeCycleFolder(raw: unknown): CycleFolder | null {
  if (!isRecord(raw)) return null
  const id = strOf(raw.id) || makeBundleId()
  const name = strOf(raw.name)
  if (!name) return null
  return {
    id,
    name,
    scope: raw.scope === 'week' || raw.scope === 'month' || raw.scope === 'custom' ? raw.scope : 'day',
    startDate: strOf(raw.startDate),
    endDate: strOf(raw.endDate),
    noteIds: strArrOf(raw.noteIds),
    archived: raw.archived === true,
    createdAt: isIsoString(raw.createdAt) ? (raw.createdAt as string) : nowIso()
  }
}

function isExtractedStatus(v: unknown): v is Material['extractedStatus'] {
  return v === 'none' || v === 'ok' || v === 'partial' || v === 'unsupported'
}

function normalizeMaterial(raw: unknown): Material | null {
  if (!isRecord(raw)) return null
  const id = strOf(raw.id) || makeBundleId()
  const fileName = strOf(raw.fileName)
  if (!fileName) return null
  return {
    id,
    title: strOf(raw.title, fileName),
    fileName,
    mimeType: strOf(raw.mimeType, 'application/octet-stream'),
    category: strOf(raw.category, 'other') as Material['category'],
    blobRef: strOf(raw.blobRef),
    size: typeof raw.size === 'number' ? raw.size : 0,
    checksum: strOf(raw.checksum),
    extractedTextRef: typeof raw.extractedTextRef === 'string' ? raw.extractedTextRef : undefined,
    extractedStatus: isExtractedStatus(raw.extractedStatus) ? raw.extractedStatus : 'none',
    tags: strArrOf(raw.tags),
    currentVersionId: typeof raw.currentVersionId === 'string' ? raw.currentVersionId : undefined,
    archived: raw.archived === true,
    createdAt: isIsoString(raw.createdAt) ? (raw.createdAt as string) : nowIso(),
    updatedAt: isIsoString(raw.updatedAt) ? (raw.updatedAt as string) : nowIso()
  }
}

function normalizeSummary(raw: unknown): SummaryResult | null {
  if (!isRecord(raw)) return null
  return {
    id: strOf(raw.id) || makeBundleId(),
    sourceNoteIds: strArrOf(raw.sourceNoteIds),
    engine: raw.engine === 'local' || raw.engine === 'external' ? raw.engine : 'none',
    sendScope: raw.sendScope === 'all' ? 'all' : 'selected',
    content: strOf(raw.content),
    createdAt: isIsoString(raw.createdAt) ? (raw.createdAt as string) : nowIso()
  }
}

function normalizeReminder(raw: unknown): ReminderTask | null {
  if (!isRecord(raw)) return null
  return {
    id: strOf(raw.id) || makeBundleId(),
    noteId: typeof raw.noteId === 'string' ? raw.noteId : undefined,
    materialId: typeof raw.materialId === 'string' ? raw.materialId : undefined,
    remindAt: strOf(raw.remindAt),
    repeat: raw.repeat === 'daily' || raw.repeat === 'weekly' || raw.repeat === 'monthly' ? raw.repeat : 'none',
    status: raw.status === 'fired' || raw.status === 'dismissed' ? raw.status : 'pending',
    channel: 'tray',
    aiSummaryId: typeof raw.aiSummaryId === 'string' ? raw.aiSummaryId : undefined
  }
}

/** 序列化记忆记事本全量包 */
export function serializeMemoryBundle(bundle: MemoryBundle): string {
  return JSON.stringify(
    { ...bundle, version: MEMORY_BUNDLE_VERSION, exportedAt: nowIso() },
    null,
    2
  )
}

/** 解析记忆记事本全量包（逐条归一化，非法条目计数跳过） */
export function parseMemoryBundle(raw: string): ParsedMemoryBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new MemoryIOError('文件不是合法 JSON')
  }
  if (!isRecord(parsed)) throw new MemoryIOError('记忆包结构无效')

  const notes: Note[] = []
  let invalidCount = 0
  for (const n of Array.isArray(parsed.notes) ? parsed.notes : []) {
    const nn = normalizeNote(n)
    if (nn) notes.push(nn)
    else invalidCount++
  }
  // 与 parseMemoryImport 一致：主条目（notes）数量超上限直接拒绝，防超大导入拖垮存储
  if (notes.length > MEMORY_IMPORT_MAX_ITEMS) {
    throw new MemoryIOError(`条目过多（超过 ${MEMORY_IMPORT_MAX_ITEMS} 条），无法导入`)
  }
  const cycleFolders = (Array.isArray(parsed.cycleFolders) ? parsed.cycleFolders : [])
    .map(normalizeCycleFolder)
    .filter((x): x is CycleFolder => !!x)
  const materials = (Array.isArray(parsed.materials) ? parsed.materials : [])
    .map(normalizeMaterial)
    .filter((x): x is Material => !!x)
  const summaries = (Array.isArray(parsed.summaries) ? parsed.summaries : [])
    .map(normalizeSummary)
    .filter((x): x is SummaryResult => !!x)
  const reminders = (Array.isArray(parsed.reminders) ? parsed.reminders : [])
    .map(normalizeReminder)
    .filter((x): x is ReminderTask => !!x)

  return {
    bundle: {
      version: typeof parsed.version === 'number' ? parsed.version : MEMORY_BUNDLE_VERSION,
      exportedAt: strOf(parsed.exportedAt, nowIso()),
      notes,
      cycleFolders,
      materials,
      summaries,
      reminders
    },
    invalidCount
  }
}

/** 合并记忆包：overwrite 整体替换；merge 按 id 去重（导入方优先） */
export function mergeMemoryBundle(
  current: MemoryBundle,
  incoming: MemoryBundle,
  strategy: MemoryImportStrategy
): MemoryBundle {
  if (strategy === 'overwrite') {
    return { ...incoming, exportedAt: nowIso() }
  }
  return {
    version: current.version,
    exportedAt: nowIso(),
    notes: dedupeById([...current.notes, ...incoming.notes]),
    cycleFolders: dedupeById([...current.cycleFolders, ...incoming.cycleFolders]),
    materials: dedupeById([...current.materials, ...incoming.materials]),
    summaries: dedupeById([...current.summaries, ...incoming.summaries]),
    reminders: dedupeById([...current.reminders, ...incoming.reminders])
  }
}

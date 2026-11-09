/**
 * 记事条目 + 周期文件夹 CRUD + 天/周/月派生视图聚合（ARCHITECTURE-v2 §4.2 MemoryStore）。
 * - 存储：<memoryDir>/notes.json、cycle-folders.json、settings.json
 * - 软删除（archived）+ 回收站；显式周期文件夹与派生视图并存。
 */
import { join } from 'path'
import { ensureDir, JsonCollection, JsonFile, makeId, nowIso } from './fs-utils'
import type {
  Note,
  NoteInput,
  CycleFolder,
  CycleFolderInput,
  PeriodScope,
  PeriodGroup
} from '../../shared/memory-types'
import {
  DEFAULT_MEMORY_SETTINGS,
  type MemorySettings
} from '../../shared/privacy-types'

/** 派生周期分组键（本地时区） */
export interface PeriodKeys {
  day: string
  week: string
  month: string
}

/** 计算某 ISO 时间的本地日/周/月分组键 */
export function periodKeysOf(iso: string, now = new Date()): PeriodKeys {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    return { day: 'unknown', week: 'unknown', month: 'unknown' }
  }
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
  const week = isoWeekKey(d)
  void now
  return { day, week, month }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * 计算某日期的 ISO-8601 周键（周一为一周之始；含「含首周四的年份」归属）。
 * 用本地 getFullYear/getMonth/getDate 取日期，周计算放 UTC 以避免夏令时 off-by-one 与跨年边界错误。
 */
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day) // 移到本周周四
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

/** 按 scope 返回当前周期的分组键（用于「今天/本周/本月」派生视图） */
export function currentPeriodKey(scope: PeriodScope, now = new Date()): string {
  const keys = periodKeysOf(now.toISOString(), now)
  return keys[scope]
}

export class MemoryStore {
  private static _instance: MemoryStore | null = null

  static init(dir: string): MemoryStore {
    ensureDir(dir)
    this._instance = new MemoryStore(dir)
    return this._instance
  }

  static getInstance(): MemoryStore {
    if (!this._instance) throw new Error('MemoryStore 未初始化，请先调用 MemoryStore.init(dir)')
    return this._instance
  }

  private notes: JsonCollection<Note>
  private folders: JsonCollection<CycleFolder>
  private settings: JsonFile<MemorySettings>

  constructor(public readonly dir: string) {
    this.notes = new JsonCollection<Note>(join(dir, 'notes.json'))
    this.folders = new JsonCollection<CycleFolder>(join(dir, 'cycle-folders.json'))
    this.settings = new JsonFile<MemorySettings>(join(dir, 'settings.json'), DEFAULT_MEMORY_SETTINGS)
  }

  /** 备份恢复后重载磁盘缓存 */
  reload(): void {
    this.notes.clearCache()
    this.folders.clearCache()
    this.settings.clearCache()
  }

  // ---------- settings ----------
  getSettings(): MemorySettings {
    const s = this.settings.read()
    return {
      privacy: { ...DEFAULT_MEMORY_SETTINGS.privacy, ...s.privacy },
      version: { ...DEFAULT_MEMORY_SETTINGS.version, ...s.version },
      storage: { ...DEFAULT_MEMORY_SETTINGS.storage, ...s.storage },
      edition: { ...DEFAULT_MEMORY_SETTINGS.edition, ...s.edition }
    }
  }

  saveSettings(next: MemorySettings): MemorySettings {
    this.settings.write(next)
    return next
  }

  // ---------- Note CRUD ----------
  listNotes(opts: { archived?: boolean } = {}): Note[] {
    const archived = opts.archived ?? false
    const all = this.notes.read()
    return all
      .filter((n) => (archived ? n.archived : !n.archived))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt))
  }

  listArchivedNotes(): Note[] {
    return this.notes.read().filter((n) => n.archived)
  }

  getNote(id: string): Note | null {
    return this.notes.get(id) ?? null
  }

  createNote(input: NoteInput): Note {
    const now = nowIso()
    const title = (input.title ?? '').trim() || deriveTitle(input.content)
    const note: Note = {
      id: makeId(),
      title,
      content: input.content,
      format: input.format === 'markdown' ? 'markdown' : 'text',
      kind: input.kind,
      tags: input.tags ?? [],
      dimensionFields: input.dimensionFields ?? [],
      aiSource: input.aiSource ?? 'none',
      cycleFolderId: input.cycleFolderId,
      pinned: input.pinned ?? false,
      archived: false,
      createdAt: now,
      updatedAt: now
    }
    this.notes.push(note)
    return note
  }

  updateNote(id: string, patch: Partial<Note>): Note | null {
    const existing = this.notes.get(id)
    if (!existing) return null
    const next: Note = {
      ...existing,
      ...patch,
      id: existing.id,
      updatedAt: nowIso()
    }
    if (!next.title || !next.title.trim()) next.title = deriveTitle(next.content)
    this.notes.update(id, next)
    return next
  }

  archiveNote(id: string): boolean {
    return this.notes.update(id, { archived: true, updatedAt: nowIso() }) !== null
  }

  restoreNote(id: string): boolean {
    return this.notes.update(id, { archived: false, updatedAt: nowIso() }) !== null
  }

  /** 硬删除（清空回收站时调用；条目已软删除才可硬删） */
  deleteNote(id: string): boolean {
    return this.notes.remove(id)
  }

  // ---------- 派生视图 ----------
  listPeriod(scope: PeriodScope, anchor = new Date()): PeriodGroup[] {
    const key = currentPeriodKey(scope, anchor)
    const notes = this.listNotes({ archived: false }).filter((n) => periodKeysOf(n.createdAt)[scope] === key)
    return [
      {
        scope,
        key,
        label: periodLabel(scope, anchor),
        noteIds: notes.map((n) => n.id),
        notes
      }
    ]
  }

  // ---------- CycleFolder CRUD ----------
  listFolders(): CycleFolder[] {
    return this.folders
      .read()
      .filter((f) => !f.archived)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  getFolder(id: string): CycleFolder | null {
    return this.folders.get(id) ?? null
  }

  createFolder(input: CycleFolderInput): CycleFolder {
    const folder: CycleFolder = {
      id: makeId(),
      name: input.name,
      scope: input.scope,
      startDate: input.startDate,
      endDate: input.endDate,
      noteIds: [],
      archived: false,
      createdAt: nowIso()
    }
    this.folders.push(folder)
    return folder
  }

  updateFolder(id: string, patch: Partial<CycleFolder>): CycleFolder | null {
    return this.folders.update(id, patch)
  }

  /** 归档文件夹（软删除，不物理删除） */
  deleteFolder(id: string): boolean {
    return this.folders.update(id, { archived: true }) !== null
  }

  /** 将笔记归入/移出周期文件夹 */
  assignNoteToFolder(noteId: string, folderId: string | null): boolean {
    const note = this.notes.get(noteId)
    if (!note) return false
    const oldFolderId = note.cycleFolderId
    this.notes.update(noteId, { cycleFolderId: folderId ?? undefined, updatedAt: nowIso() })
    // 维护 folder.noteIds（保持双向一致）
    if (oldFolderId) {
      const f = this.folders.get(oldFolderId)
      if (f) this.folders.update(oldFolderId, { noteIds: f.noteIds.filter((id) => id !== noteId) })
    }
    if (folderId) {
      const f = this.folders.get(folderId)
      if (f && !f.noteIds.includes(noteId)) {
        this.folders.update(folderId, { noteIds: [...f.noteIds, noteId] })
      }
    }
    return true
  }
}

/** 空标题时取正文首行作为标题 */
export function deriveTitle(content: string): string {
  const first = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0)
  if (!first) return '未命名'
  const noMd = first.replace(/^#{1,6}\s*/, '').trim()
  return noMd.length > 40 ? noMd.slice(0, 40) + '…' : noMd
}

function periodLabel(scope: PeriodScope, anchor: Date): string {
  const y = anchor.getFullYear()
  const m = anchor.getMonth() + 1
  const d = anchor.getDate()
  if (scope === 'day') return `${y}-${pad(m)}-${pad(d)}`
  if (scope === 'month') return `${y}-${pad(m)}`
  return isoWeekKey(anchor)
}

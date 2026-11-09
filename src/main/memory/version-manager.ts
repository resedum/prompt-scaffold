/**
 * 版本快照 + 保留策略 + 历史版本清理建议（ARCHITECTURE-v2 §4.2 VersionManager / §6.3）。
 * - NoteVersion：完整文本快照，存 versions/note-versions.json
 * - 清理建议（只建议、不自动删）：旧版本 / 孤儿 blob / 过期备份
 */
import { join } from 'path'
import { readdirSync, statSync, rmSync } from 'fs'
import { ensureDir, JsonCollection, makeId, nowIso, sha256Hex } from './fs-utils'
import type { Note, NoteVersion, CleanupItem, CleanupResult, BackupManifest } from '../../shared/memory-types'

export interface CleanupContext {
  keepVersions: number
  referencedBlobs: Set<string>
  blobsDir: string
  backups: BackupManifest[]
  backupRotation: number
  /** 删除备份的回调（由 backup-manager 提供，负责同步 manifest） */
  removeBackup?: (id: string) => boolean
}

export class VersionManager {
  private noteVersions: JsonCollection<NoteVersion>

  constructor(public readonly dir: string) {
    ensureDir(join(dir, 'versions'))
    this.noteVersions = new JsonCollection<NoteVersion>(join(dir, 'versions', 'note-versions.json'))
  }

  reload(): void {
    this.noteVersions.clearCache()
  }

  /** 为一次修改前的笔记内容留快照 */
  snapshotNote(note: Note, changeNote = ''): NoteVersion {
    const existing = this.noteVersions.read().filter((v) => v.noteId === note.id)
    const version: NoteVersion = {
      id: makeId(),
      noteId: note.id,
      versionNo: existing.length + 1,
      content: note.content,
      checksum: sha256Hex(note.content),
      note: changeNote,
      createdAt: nowIso()
    }
    this.noteVersions.push(version)
    return version
  }

  listNoteVersions(noteId: string): NoteVersion[] {
    return this.noteVersions
      .read()
      .filter((v) => v.noteId === noteId)
      .sort((a, b) => b.versionNo - a.versionNo)
  }

  getVersion(versionId: string): NoteVersion | null {
    return this.noteVersions.get(versionId) ?? null
  }

  restoreNoteVersion(versionId: string): NoteVersion | null {
    return this.getVersion(versionId)
  }

  allNoteVersions(): NoteVersion[] {
    return this.noteVersions.read()
  }

  /** 生成三类可清理项（只建议） */
  suggestCleanup(ctx: CleanupContext): CleanupItem[] {
    const items: CleanupItem[] = []

    // ① 超过 keepVersions 的旧历史版本
    const byNote = new Map<string, NoteVersion[]>()
    for (const v of this.noteVersions.read()) {
      const arr = byNote.get(v.noteId) ?? []
      arr.push(v)
      byNote.set(v.noteId, arr)
    }
    const keep = Math.max(1, Math.floor(ctx.keepVersions ?? 20))
    for (const arr of byNote.values()) {
      arr.sort((a, b) => b.versionNo - a.versionNo)
      for (const v of arr.slice(keep)) {
        items.push({
          id: `version:${v.id}`,
          kind: 'version',
          targetId: v.id,
          reason: `笔记旧版本 #${v.versionNo}`,
          size: Buffer.byteLength(v.content, 'utf-8')
        })
      }
    }

    // ② 未被任何版本/资料引用的孤儿 blob
    const referenced = ctx.referencedBlobs ?? new Set<string>()
    try {
      for (const name of readdirSync(ctx.blobsDir)) {
        if (referenced.has(name)) continue
        let size = 0
        try {
          size = statSync(join(ctx.blobsDir, name)).size
        } catch {
          /* ignore */
        }
        items.push({
          id: `blob:${name}`,
          kind: 'orphan-blob',
          targetId: name,
          reason: '未被引用的内容寻址文件（可 GC）',
          size
        })
      }
    } catch {
      /* blobs 目录不存在则跳过 */
    }

    // ③ 超过 backupRotation 的过期备份
    const rotation = Math.max(0, Math.floor(ctx.backupRotation ?? 5))
    const backups = [...(ctx.backups ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    for (const b of backups.slice(rotation)) {
      items.push({
        id: `backup:${b.id}`,
        kind: 'backup',
        targetId: b.id,
        reason: '超过保留份数的旧备份',
        size: b.size
      })
    }

    return items
  }

  /** 应用清理（用户勾选后显式执行） */
  applyCleanup(items: CleanupItem[], ctx: CleanupContext): CleanupResult {
    let removed = 0
    let freedBytes = 0
    for (const item of items) {
      if (item.kind === 'version') {
        if (this.noteVersions.remove(item.targetId)) {
          removed++
          freedBytes += item.size
        }
      } else if (item.kind === 'orphan-blob') {
        try {
          rmSync(join(ctx.blobsDir, item.targetId), { force: true })
          removed++
          freedBytes += item.size
        } catch {
          /* ignore */
        }
      } else if (item.kind === 'backup') {
        const ok = ctx.removeBackup ? ctx.removeBackup(item.targetId) : false
        if (ok) {
          removed++
          freedBytes += item.size
        }
      }
    }
    return { removed, freedBytes }
  }
}

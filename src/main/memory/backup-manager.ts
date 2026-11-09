/**
 * 本地备份 + 轮转 + 恢复 + 存储配额统计（ARCHITECTURE-v2 §4.2 BackupManager / §6.3）。
 * - 备份产物入 backups/<id>/（与源数据隔离）；全量快照（JSON 集合 + blobs + extracted）
 * - 只做本地备份；云端备份归企业版（feature-gate 关）
 */
import { join } from 'path'
import { writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { ensureDir, JsonCollection, makeId, nowIso, sha256Hex, dirSize, copyDirRecursive, readJsonFile, writeJsonFile, resetDir } from './fs-utils'
import type { BackupManifest, QuotaStats } from '../../shared/memory-types'
import { DEFAULT_MEMORY_SETTINGS, type MemorySettings } from '../../shared/privacy-types'

const NOTES = 'notes.json'
const FOLDERS = 'cycle-folders.json'
const MATERIALS = 'materials.json'
const NOTE_VERSIONS = join('versions', 'note-versions.json')
const MATERIAL_VERSIONS = join('versions', 'material-versions.json')
const SUMMARIES = 'summaries.json'
const REMINDERS = 'reminders.json'
const AI_TASKS = 'ai-tasks.json'
const SETTINGS = 'settings.json'

export class BackupManager {
  private manifests: JsonCollection<BackupManifest>

  constructor(public readonly dir: string) {
    ensureDir(join(dir, 'backups'))
    this.manifests = new JsonCollection<BackupManifest>(join(dir, 'backup-manifest.json'))
  }

  list(): BackupManifest[] {
    return this.manifests.read().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  get(id: string): BackupManifest | null {
    return this.manifests.get(id) ?? null
  }

  reload(): void {
    this.manifests.clearCache()
  }

  /** 全量本地备份 */
  create(): BackupManifest {
    const id = makeId()
    const now = nowIso()
    const backupDir = join(this.dir, 'backups', id)
    ensureDir(backupDir)

    const bundle = {
      notes: readJsonFile(join(this.dir, NOTES), []),
      folders: readJsonFile(join(this.dir, FOLDERS), []),
      materials: readJsonFile(join(this.dir, MATERIALS), []),
      noteVersions: readJsonFile(join(this.dir, NOTE_VERSIONS), []),
      materialVersions: readJsonFile(join(this.dir, MATERIAL_VERSIONS), []),
      summaries: readJsonFile(join(this.dir, SUMMARIES), []),
      reminders: readJsonFile(join(this.dir, REMINDERS), []),
      aiTasks: readJsonFile(join(this.dir, AI_TASKS), []),
      settings: readJsonFile<MemorySettings>(join(this.dir, SETTINGS), DEFAULT_MEMORY_SETTINGS)
    }
    const json = JSON.stringify(bundle, null, 2)
    writeFileSync(join(backupDir, 'memory-bundle.json'), json, 'utf-8')
    copyDirRecursive(join(this.dir, 'files', 'blobs'), join(backupDir, 'blobs'))
    copyDirRecursive(join(this.dir, 'extracted'), join(backupDir, 'extracted'))

    const manifest: BackupManifest = {
      id,
      path: backupDir,
      location: 'local',
      scope: 'full',
      size: dirSize(backupDir),
      checksum: sha256Hex(json),
      createdAt: now
    }
    this.manifests.push(manifest)
    return manifest
  }

  /** 从备份恢复（写回 JSON + blobs + extracted；成功后由 facade 重载缓存） */
  restore(id: string): boolean {
    const manifest = this.manifests.get(id)
    if (!manifest) return false
    const bundleFile = join(manifest.path, 'memory-bundle.json')
    if (!existsSync(bundleFile)) return false
    try {
      const bundle = JSON.parse(readFileSync(bundleFile, 'utf-8')) as Record<string, unknown>
      if (Array.isArray(bundle.notes)) writeJsonFile(join(this.dir, NOTES), bundle.notes)
      if (Array.isArray(bundle.folders)) writeJsonFile(join(this.dir, FOLDERS), bundle.folders)
      if (Array.isArray(bundle.materials)) writeJsonFile(join(this.dir, MATERIALS), bundle.materials)
      if (Array.isArray(bundle.noteVersions)) writeJsonFile(join(this.dir, NOTE_VERSIONS), bundle.noteVersions)
      if (Array.isArray(bundle.materialVersions)) writeJsonFile(join(this.dir, MATERIAL_VERSIONS), bundle.materialVersions)
      if (Array.isArray(bundle.summaries)) writeJsonFile(join(this.dir, SUMMARIES), bundle.summaries)
      if (Array.isArray(bundle.reminders)) writeJsonFile(join(this.dir, REMINDERS), bundle.reminders)
      if (Array.isArray(bundle.aiTasks)) writeJsonFile(join(this.dir, AI_TASKS), bundle.aiTasks)
      if (bundle.settings) writeJsonFile(join(this.dir, SETTINGS), bundle.settings)
      // 先清空目标再复制，避免合并式拷贝残留已删除文件的孤儿副本
      if (existsSync(join(manifest.path, 'blobs'))) {
        resetDir(join(this.dir, 'files', 'blobs'))
        copyDirRecursive(join(manifest.path, 'blobs'), join(this.dir, 'files', 'blobs'))
      }
      if (existsSync(join(manifest.path, 'extracted'))) {
        resetDir(join(this.dir, 'extracted'))
        copyDirRecursive(join(manifest.path, 'extracted'), join(this.dir, 'extracted'))
      }
      return true
    } catch {
      return false
    }
  }

  /** 删除备份（清理建议中的用户确认执行） */
  delete(id: string): boolean {
    const manifest = this.manifests.get(id)
    if (!manifest) return false
    this.manifests.remove(id)
    try {
      rmSync(manifest.path, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
    return true
  }

  /** 存储配额统计（实时计算各目录体积 + 版本数） */
  quotaStats(): QuotaStats {
    const filesDir = join(this.dir, 'files')
    const versionsDir = join(this.dir, 'versions')
    const extractedDir = join(this.dir, 'extracted')
    const backupsDir = join(this.dir, 'backups')

    const noteVersions = readJsonFile<unknown[]>(join(this.dir, NOTE_VERSIONS), [])
    const materialVersions = readJsonFile<unknown[]>(join(this.dir, MATERIAL_VERSIONS), [])

    let jsonBytes = 0
    for (const f of [NOTES, FOLDERS, MATERIALS, SUMMARIES, REMINDERS, AI_TASKS, SETTINGS]) {
      const p = join(this.dir, f)
      try {
        if (existsSync(p)) jsonBytes += statSize(p)
      } catch {
        /* ignore */
      }
    }

    const byDir: Record<string, number> = {
      files: dirSize(filesDir),
      versions: dirSize(versionsDir),
      extracted: dirSize(extractedDir),
      backups: dirSize(backupsDir),
      json: jsonBytes
    }

    return {
      notes: readJsonFile<unknown[]>(join(this.dir, NOTES), []).length,
      materials: readJsonFile<unknown[]>(join(this.dir, MATERIALS), []).length,
      versions: (Array.isArray(noteVersions) ? noteVersions.length : 0) + (Array.isArray(materialVersions) ? materialVersions.length : 0),
      backups: this.manifests.read().length,
      bytes: Object.values(byDir).reduce((a, b) => a + b, 0),
      byDir
    }
  }
}

function statSize(p: string): number {
  try {
    return readFileSync(p).length
  } catch {
    return 0
  }
}

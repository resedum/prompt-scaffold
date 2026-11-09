/**
 * 资料仓库 + 内容寻址 blob + 资料版本（ARCHITECTURE-v2 §4.2 MaterialStore）。
 * - 二进制本体按内容 SHA-256 存 files/blobs/<sha256>（跨版本自动去重）
 * - 元数据入 materials.json；资料版本入 versions/material-versions.json
 * - 抽取文本缓存 extracted/<id>.txt（用于搜索 + 预览）
 */
import { join, basename } from 'path'
import { readFileSync, writeFileSync, existsSync, rmSync } from 'fs'
import { ensureDir, JsonCollection, makeId, nowIso, sha256Hex } from './fs-utils'
import { extractText, categoryOf, type ExtractResult } from './extract'
import type {
  Material,
  MaterialVersion,
  ExtractedStatus
} from '../../shared/memory-types'

export interface ImportedMaterial {
  material: Material
  extractedText: string
  extractStatus: ExtractedStatus
}

export class MaterialStore {
  private materials: JsonCollection<Material>
  private versions: JsonCollection<MaterialVersion>

  constructor(public readonly dir: string) {
    ensureDir(join(dir, 'files', 'blobs'))
    ensureDir(join(dir, 'extracted'))
    ensureDir(join(dir, 'versions'))
    this.materials = new JsonCollection<Material>(join(dir, 'materials.json'))
    this.versions = new JsonCollection<MaterialVersion>(join(dir, 'versions', 'material-versions.json'))
  }

  reload(): void {
    this.materials.clearCache()
    this.versions.clearCache()
  }

  list(): Material[] {
    return this.materials.read().filter((m) => !m.archived)
  }

  listArchived(): Material[] {
    return this.materials.read().filter((m) => m.archived)
  }

  get(id: string): Material | null {
    return this.materials.get(id) ?? null
  }

  blobPath(blobRef: string): string {
    return join(this.dir, 'files', 'blobs', blobRef)
  }

  readBlob(blobRef: string): Buffer | null {
    try {
      const p = this.blobPath(blobRef)
      return existsSync(p) ? readFileSync(p) : null
    } catch {
      return null
    }
  }

  readExtracted(material: Material): string {
    if (!material.extractedTextRef) return ''
    try {
      const p = join(this.dir, material.extractedTextRef)
      return existsSync(p) ? readFileSync(p, 'utf-8') : ''
    } catch {
      return ''
    }
  }

  /** 从文件路径导入资料：写 blob + 抽取文本 + 建元数据（首个版本） */
  async importFile(filePath: string): Promise<ImportedMaterial> {
    const buf = readFileSync(filePath)
    return this.importBuffer(basename(filePath), buf, '')
  }

  async importBuffer(fileName: string, buf: Buffer, mimeType = ''): Promise<ImportedMaterial> {
    const checksum = sha256Hex(buf)
    const blobRef = checksum
    const blobPath = this.blobPath(blobRef)
    if (!existsSync(blobPath)) writeFileSync(blobPath, buf)

    const category = categoryOf(fileName, mimeType)
    const extracted = await extractText(category, fileName, buf)

    const id = makeId()
    const now = nowIso()
    let extractedTextRef: string | undefined
    if (extracted.text) {
      extractedTextRef = join('extracted', `${id}.txt`)
      writeFileSync(join(this.dir, extractedTextRef), extracted.text, 'utf-8')
    }

    const material: Material = {
      id,
      title: stripExt(fileName),
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      category,
      blobRef,
      size: buf.length,
      checksum,
      extractedTextRef,
      extractedStatus: extracted.status,
      tags: [],
      archived: false,
      createdAt: now,
      updatedAt: now
    }
    this.materials.push(material)

    // 首个版本（内容寻址，与 blob 同源去重）
    const ver: MaterialVersion = {
      id: makeId(),
      materialId: id,
      versionNo: 1,
      blobRef,
      size: buf.length,
      checksum,
      note: '初始导入',
      createdAt: now
    }
    this.versions.push(ver)
    material.currentVersionId = ver.id
    this.materials.update(id, { currentVersionId: ver.id })

    return { material, extractedText: extracted.text, extractStatus: extracted.status }
  }

  updateTags(id: string, tags: string[]): Material | null {
    return this.materials.update(id, { tags, updatedAt: nowIso() })
  }

  archive(id: string): boolean {
    return this.materials.update(id, { archived: true, updatedAt: nowIso() }) !== null
  }

  restore(id: string): boolean {
    return this.materials.update(id, { archived: false, updatedAt: nowIso() }) !== null
  }

  /** 追加一个内容寻址版本并更新 currentVersionId */
  addVersion(materialId: string, buf: Buffer, note: string): MaterialVersion | null {
    const material = this.materials.get(materialId)
    if (!material) return null
    const checksum = sha256Hex(buf)
    const blobRef = checksum
    const blobPath = this.blobPath(blobRef)
    if (!existsSync(blobPath)) writeFileSync(blobPath, buf)
    const ver: MaterialVersion = {
      id: makeId(),
      materialId,
      versionNo: this.versions.read().filter((v) => v.materialId === materialId).length + 1,
      blobRef,
      size: buf.length,
      checksum,
      note,
      createdAt: nowIso()
    }
    this.versions.push(ver)
    this.materials.update(materialId, {
      blobRef,
      size: buf.length,
      checksum,
      currentVersionId: ver.id,
      updatedAt: nowIso()
    })
    return ver
  }

  listVersions(materialId: string): MaterialVersion[] {
    return this.versions
      .read()
      .filter((v) => v.materialId === materialId)
      .sort((a, b) => b.versionNo - a.versionNo)
  }

  getVersion(versionId: string): MaterialVersion | null {
    return this.versions.get(versionId) ?? null
  }

  allVersions(): MaterialVersion[] {
    return this.versions.read()
  }

  /** 硬删除资料 + 其版本元数据（blob 是否物理删除由清理建议决定，此处保守保留） */
  delete(id: string): boolean {
    const material = this.materials.get(id)
    if (!material) return false
    this.materials.remove(id)
    const vers = this.versions.read().filter((v) => v.materialId === id)
    for (const v of vers) this.versions.remove(v.id)
    if (material.extractedTextRef) {
      try {
        rmSync(join(this.dir, material.extractedTextRef), { force: true })
      } catch {
        /* ignore */
      }
    }
    return true
  }

  /** 收集所有被引用的 blobRef（用于孤儿 blob GC 建议） */
  allReferencedBlobs(): Set<string> {
    const set = new Set<string>()
    for (const m of this.materials.read()) if (m.blobRef) set.add(m.blobRef)
    for (const v of this.versions.read()) if (v.blobRef) set.add(v.blobRef)
    return set
  }
}

function stripExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(0, dot) : fileName
}

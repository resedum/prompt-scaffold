/**
 * MiniSearch 全文索引（ARCHITECTURE-v2 §4.2 SearchIndex）。
 * 文本/Markdown 直接索引；二进制资料只索引抽取文本（extracted/<id>.txt），二进制本体绝不进索引。
 * 支持序列化缓存（search-index/index.json），损坏则重建。
 */
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import MiniSearch, { type Options, type SearchResult } from 'minisearch'
import { ensureDir } from './fs-utils'
import type { Note, Material, SearchHit } from '../../shared/memory-types'

interface Doc {
  id: string
  type: 'note' | 'material'
  title: string
  text: string
  snippet: string
  updatedAt: string
}

const FIELDS = ['title', 'text'] as const

function options(): Options<Doc> {
  return {
    fields: [...FIELDS],
    storeFields: ['id', 'type', 'title', 'snippet', 'updatedAt'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 3 }
    }
  }
}

function snippetOf(text: string, max = 160): string {
  const one = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join(' ')
  return one.length > max ? one.slice(0, max) + '…' : one
}

export class SearchIndex {
  private mini: MiniSearch<Doc> | null = null
  private readonly indexFile: string

  constructor(public readonly dir: string) {
    ensureDir(join(dir, 'search-index'))
    this.indexFile = join(dir, 'search-index', 'index.json')
  }

  private index(): MiniSearch<Doc> {
    if (this.mini) return this.mini
    const opts = options()
    try {
      if (existsSync(this.indexFile)) {
        const raw = readFileSync(this.indexFile, 'utf-8')
        this.mini = MiniSearch.loadJSON<Doc>(raw, opts)
        return this.mini
      }
    } catch {
      /* 缓存损坏则重建 */
    }
    this.mini = new MiniSearch<Doc>(opts)
    return this.mini
  }

  private persist(): void {
    try {
      if (this.mini) writeFileSync(this.indexFile, JSON.stringify(this.mini.toJSON()), 'utf-8')
    } catch {
      /* 忽略序列化缓存失败 */
    }
  }

  reload(notes: Note[], materials: Material[], extractedTexts: Map<string, string>): void {
    this.rebuild(notes, materials, extractedTexts)
  }

  /** 从笔记 + 资料（含抽取文本）全量重建 */
  rebuild(notes: Note[], materials: Material[], extractedTexts: Map<string, string>): void {
    const m = new MiniSearch<Doc>(options())
    for (const n of notes) {
      m.add({
        id: n.id,
        type: 'note',
        title: n.title ?? '',
        text: n.content,
        snippet: snippetOf(n.content),
        updatedAt: n.updatedAt
      })
    }
    for (const mat of materials) {
      const text = extractedTexts.get(mat.id) ?? ''
      m.add({
        id: mat.id,
        type: 'material',
        title: mat.title,
        text,
        snippet: snippetOf(text || mat.fileName),
        updatedAt: mat.updatedAt
      })
    }
    this.mini = m
    this.persist()
  }

  addNote(note: Note): void {
    const m = this.index()
    m.discard(note.id)
    m.add({
      id: note.id,
      type: 'note',
      title: note.title ?? '',
      text: note.content,
      snippet: snippetOf(note.content),
      updatedAt: note.updatedAt
    })
    this.persist()
  }

  removeNote(id: string): void {
    this.index().discard(id)
    this.persist()
  }

  addMaterial(material: Material, extractedText: string): void {
    const m = this.index()
    m.discard(material.id)
    m.add({
      id: material.id,
      type: 'material',
      title: material.title,
      text: extractedText,
      snippet: snippetOf(extractedText || material.fileName),
      updatedAt: material.updatedAt
    })
    this.persist()
  }

  removeMaterial(id: string): void {
    this.index().discard(id)
    this.persist()
  }

  /** 读取资料抽取文本（未抽取返回空串） */
  readExtracted(material: Material): string {
    if (!material.extractedTextRef) return ''
    try {
      const p = join(this.dir, material.extractedTextRef)
      return existsSync(p) ? readFileSync(p, 'utf-8') : ''
    } catch {
      return ''
    }
  }

  search(query: string, limit = 50): SearchHit[] {
    const q = (query ?? '').trim()
    if (!q) return []
    const results: SearchResult[] = this.index().search(q, { prefix: true, fuzzy: 0.2 })
    return results.slice(0, limit).map((r) => {
      const d = r as unknown as SearchHit
      return {
        id: r.id,
        type: d.type ?? 'note',
        title: d.title ?? '',
        snippet: d.snippet ?? '',
        updatedAt: d.updatedAt ?? ''
      }
    })
  }
}

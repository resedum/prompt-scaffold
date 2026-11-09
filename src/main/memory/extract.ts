/**
 * PDF / Office / 文本 的纯文本抽取（ARCHITECTURE-v2 §6.1）。
 * - 文本/Markdown：直接按 utf-8 读取
 * - PDF：pdfjs-dist（legacy，纯 JS）
 * - Office 新格式：mammoth（docx）、jszip（xlsx/pptx 抽 sharedStrings/slide 文本）
 * - Office 旧格式（.doc/.xls/.ppt，OLE 二进制）：不支持，标记 unsupported
 * 全部零 native 依赖；抽取失败一律降级，绝不抛异常。
 */
import { extname } from 'path'
import mammoth from 'mammoth'
import JSZip from 'jszip'
import type { MaterialCategory, ExtractedStatus } from '../../shared/memory-types'

export interface ExtractResult {
  status: ExtractedStatus
  text: string
}

/** 按扩展名（小写化）+ mime 推断资料分类 */
export function categoryOf(fileName: string, mimeType = ''): MaterialCategory {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.pdf' || mimeType === 'application/pdf') return 'pdf'
  if (ext === '.md' || ext === '.markdown') return 'markdown'
  if (ext === '.txt' || mimeType.startsWith('text/')) return 'text'
  if (
    ext === '.docx' ||
    ext === '.xlsx' ||
    ext === '.pptx' ||
    ext === '.doc' ||
    ext === '.xls' ||
    ext === '.ppt' ||
    mimeType.includes('officedocument') ||
    mimeType.includes('ms-excel') ||
    mimeType.includes('msword')
  ) {
    return 'office'
  }
  if (mimeType.startsWith('image/')) return 'image'
  return 'other'
}

/** 主入口：按分类抽取纯文本（同步可读的文本直接返回；PDF/Office 异步） */
export async function extractText(
  category: MaterialCategory,
  fileName: string,
  buffer: Buffer
): Promise<ExtractResult> {
  try {
    if (category === 'text' || category === 'markdown') {
      const text = buffer.toString('utf-8')
      return { status: text.trim() ? 'ok' : 'partial', text }
    }
    if (category === 'pdf') return await extractPdf(buffer)
    if (category === 'office') return await extractOffice(fileName, buffer)
    return { status: 'unsupported', text: '' }
  } catch {
    return { status: 'unsupported', text: '' }
  }
}

/** PDF 文本层抽取（扫描版无文本层 → partial） */
async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  try {
    const workerSrc = resolvePdfWorkerSrc()
    if (workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc
    }
  } catch {
    /* worker 路径解析失败则使用 pdfjs 默认行为 */
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true
  }).promise
  const parts: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((it) => it.str ?? '').join(' ')
    if (text.trim()) parts.push(text)
  }
  const text = parts.join('\n')
  return { status: text.trim() ? 'ok' : 'partial', text }
}

/** 解析 pdfjs worker 路径（打包后主进程为 CJS，模块作用域存在 require） */
function resolvePdfWorkerSrc(): string | null {
  try {
    // CJS 下 require 可用；ESM/tsx 下不存在则走 null（typeof 守卫，安全）
    const req = typeof require === 'function' ? (require as NodeJS.Require) : undefined
    if (req && typeof req.resolve === 'function') {
      return req.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')
    }
  } catch {
    /* ignore */
  }
  return null
}

/** Office 抽取：docx → mammoth；xlsx/pptx → jszip 解包抽文本；旧格式 unsupported */
async function extractOffice(fileName: string, buffer: Buffer): Promise<ExtractResult> {
  const ext = extname(fileName).toLowerCase()
  if (ext === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    return { status: result.value.trim() ? 'ok' : 'partial', text: result.value }
  }
  if (ext === '.xlsx') {
    const text = await extractXlsx(buffer)
    return { status: text.trim() ? 'ok' : 'partial', text }
  }
  if (ext === '.pptx') {
    const text = await extractPptx(buffer)
    return { status: text.trim() ? 'ok' : 'partial', text }
  }
  // .doc/.xls/.ppt 等 OLE 二进制不支持
  return { status: 'unsupported', text: '' }
}

/** xlsx：读 sharedStrings.xml 与各 sheet 的 inlineStr */
async function extractXlsx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const shared: string[] = []
  const sharedFile = zip.file('xl/sharedStrings.xml')
  if (sharedFile) {
    const xml = await sharedFile.async('string')
    for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      const v = decodeXml(m[1]).trim()
      if (v) shared.push(v)
    }
  }
  const out: string[] = []
  const sheetFiles = Object.keys(zip.files).filter((p) => /^xl\/worksheets\/sheet\d*\.xml$/.test(p))
  for (const p of sheetFiles.slice(0, 5)) {
    const xml = await zip.file(p)!.async('string')
    for (const m of xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) {
      const v = decodeXml(m[1]).trim()
      if (v) out.push(v)
    }
  }
  if (!out.length) out.push(...shared)
  return out.join('\n')
}

/** pptx：抽每页 slide 的 <a:t> 文本 */
async function extractPptx(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const out: string[] = []
  const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d*\.xml$/.test(p))
  for (const p of slides.slice(0, 50)) {
    const xml = await zip.file(p)!.async('string')
    const texts: string[] = []
    for (const m of xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)) {
      const v = decodeXml(m[1]).trim()
      if (v) texts.push(v)
    }
    if (texts.length) out.push(texts.join(' '))
  }
  return out.join('\n')
}

/** 基础 XML 实体解码 */
function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

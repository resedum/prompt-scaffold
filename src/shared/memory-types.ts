/**
 * 记忆工具全部实体类型 + 契约（ARCHITECTURE-v2 §3.1，契约单一来源）。
 * 纯类型定义，主进程 / preload / 渲染进程三方引用，零运行时依赖。
 */

// ===== 核心：记事条目 =====
export type NoteFormat = 'text' | 'markdown'
export type NoteKind = 'note' | 'todo' | 'insight' | 'snippet' | 'constraint'
export type AiSource = 'none' | 'manual' | 'enhanced'

/** 维度增强产物，如 {name:'篇幅', value:'800字'} */
export interface DimensionField {
  name: string
  value: string
}

export interface Note {
  id: string
  /** 可选；空则取正文首行 */
  title?: string
  content: string
  format: NoteFormat
  kind: NoteKind
  tags: string[]
  dimensionFields: DimensionField[]
  aiSource: AiSource
  /** 归属显式周期文件夹（可选） */
  cycleFolderId?: string
  pinned: boolean
  /** 软删除（回收站） */
  archived: boolean
  createdAt: string
  updatedAt: string
}

// ===== 显式周期文件夹 =====
export type CycleScope = 'day' | 'week' | 'month' | 'custom'

export interface CycleFolder {
  id: string
  name: string
  scope: CycleScope
  /** ISO date (YYYY-MM-DD) */
  startDate: string
  endDate: string
  noteIds: string[]
  archived: boolean
  createdAt: string
}

// ===== 资料（含二进制）=====
export type MaterialCategory = 'text' | 'markdown' | 'pdf' | 'office' | 'image' | 'other'
export type ExtractedStatus = 'none' | 'ok' | 'partial' | 'unsupported'

export interface Material {
  id: string
  title: string
  fileName: string
  mimeType: string
  category: MaterialCategory
  /** 指向 files/blobs/<sha256>（当前版本） */
  blobRef: string
  size: number
  checksum: string
  /** 指向 extracted/<id>.txt（可搜索的抽取文本） */
  extractedTextRef?: string
  extractedStatus: ExtractedStatus
  tags: string[]
  currentVersionId?: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

// ===== 版本快照 =====
export interface NoteVersion {
  id: string
  noteId: string
  versionNo: number
  /** 完整文本快照（小） */
  content: string
  checksum: string
  /** 变更说明 */
  note: string
  createdAt: string
}

export interface MaterialVersion {
  id: string
  materialId: string
  versionNo: number
  /** 指向 blobs/<sha256>；相同内容自动去重 */
  blobRef: string
  size: number
  checksum: string
  note: string
  createdAt: string
}

// ===== 提醒 / 总结 / 代码执行 =====
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly'
export type ReminderStatus = 'pending' | 'fired' | 'dismissed'

export interface ReminderTask {
  id: string
  noteId?: string
  materialId?: string
  remindAt: string
  repeat: RepeatRule
  status: ReminderStatus
  /** MVP 仅托盘 */
  channel: 'tray'
  aiSummaryId?: string
}

export type SummaryEngine = 'local' | 'external' | 'none'
export type SummarySendScope = 'all' | 'selected'

export interface SummaryResult {
  id: string
  sourceNoteIds: string[]
  engine: SummaryEngine
  sendScope: SummarySendScope
  content: string
  createdAt: string
}

export type SandboxMode = 'local' | 'remote'
export type AiTaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'timeout' | 'denied'

export interface AiExecutionTask {
  id: string
  noteId?: string
  language: string
  codeSnippet: string
  sandbox: SandboxMode
  status: AiTaskStatus
  stdout: string
  stderr: string
  result?: string
  createdAt: string
}

// ===== 备份 =====
export type BackupLocation = 'local' | 'cloud'
export type BackupScope = 'full' | 'incremental'

export interface BackupManifest {
  id: string
  path: string
  location: BackupLocation
  scope: BackupScope
  size: number
  checksum: string
  createdAt: string
}

// ===== 派生视图 =====
export type PeriodScope = 'day' | 'week' | 'month'

export interface PeriodGroup {
  scope: PeriodScope
  key: string
  label: string
  noteIds: string[]
  notes: Note[]
}

// ===== 搜索 =====
export interface SearchHit {
  id: string
  type: 'note' | 'material'
  title: string
  snippet: string
  updatedAt: string
}

// ===== 清理 =====
export type CleanupKind = 'version' | 'orphan-blob' | 'backup'

export interface CleanupItem {
  id: string
  kind: CleanupKind
  /** 目标对象 id（版本 id / blob 文件名 / 备份 id） */
  targetId: string
  reason: string
  /** 可释放字节数（估算） */
  size: number
}

export interface CleanupResult {
  removed: number
  freedBytes: number
}

// ===== 配额统计 =====
export interface QuotaStats {
  notes: number
  materials: number
  versions: number
  backups: number
  bytes: number
  byDir: Record<string, number>
}

// ===== IPC 输入类型 =====
export interface NoteInput {
  title?: string
  content: string
  format: NoteFormat
  kind: NoteKind
  tags: string[]
  dimensionFields: DimensionField[]
  aiSource: AiSource
  cycleFolderId?: string
  pinned: boolean
}

export interface CycleFolderInput {
  name: string
  scope: CycleScope
  startDate: string
  endDate: string
}

export interface ReminderInput {
  noteId?: string
  materialId?: string
  remindAt: string
  repeat: RepeatRule
  aiSummaryId?: string
}

export interface SandboxInput {
  noteId?: string
  language: string
  codeSnippet: string
}

export interface EnhanceRequest {
  text: string
  scope: 'off' | 'local' | 'external'
}

export interface SummaryRequest {
  noteIds: string[]
  scope: 'off' | 'local' | 'external'
  sendScope: SummarySendScope
}

/** 隐私档位校验/裁剪结果（出机动作前置确认） */
export interface PrivacyPreflight {
  capability: string
  scope: 'off' | 'local' | 'external'
  engine: 'local' | 'external'
  baseUrl: string
  charCount: number
  includesExtractedText: boolean
  noteCount: number
}

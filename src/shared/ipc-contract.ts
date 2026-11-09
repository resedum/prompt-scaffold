/**
 * IPC 契约唯一来源（共享知识 §10.1 + MEMORY-TOOL-ARCHITECTURE-v2 §4.1）。
 * 所有 channel 名与渲染层 API 签名集中在此，preload 与 main 双向引用，禁止散落字符串。
 */
import type {
  GenerateInput,
  GenerateDimensionsResponse,
  SummaryResult,
  ImageData,
  Rect,
  Preferences,
  IpcResult,
  MemoryExportResult,
  MemoryImportPreview,
  MemoryImportApplyArgs,
  MemoryImportResult
} from './types'
import type {
  Note,
  NoteInput,
  CycleFolder,
  CycleFolderInput,
  Material,
  NoteVersion,
  ReminderTask,
  ReminderInput,
  SummaryResult as MemorySummaryResult,
  SummaryRequest,
  SandboxInput,
  AiExecutionTask,
  PeriodScope,
  PeriodGroup,
  SearchHit,
  CleanupItem,
  CleanupResult,
  QuotaStats,
  EnhanceRequest,
  DimensionField,
  PrivacyPreflight,
  BackupManifest
} from './memory-types'
import type { MemorySettings } from './privacy-types'

/** channel 名唯一来源 */
export const IPC = {
  aiGenerate: 'ai:generate',
  aiSummarize: 'ai:summarize',
  captureScreen: 'capture:screen',
  cropImage: 'image:crop',
  readClipboardImage: 'clipboard:read-image',
  pickImageFile: 'file:pick-image',
  readTextFile: 'file:read-text',
  copyText: 'clipboard:write-text',
  loadPrefs: 'prefs:load',
  savePrefs: 'prefs:save',
  clipboardImageEvent: 'clipboard:image-event',
  screenshotGetImage: 'screenshot:get-image',
  screenshotFinish: 'screenshot:finish',
  memoryExport: 'memory:export',
  memoryImportPick: 'memory:import-pick',
  memoryImportApply: 'memory:import-apply',
  shareFetch: 'share:fetch',

  // ---------- 记忆记事本 ----------
  memoryListNotes: 'memory:notes-list',
  memoryGetNote: 'memory:note-get',
  memoryCreateNote: 'memory:note-create',
  memoryUpdateNote: 'memory:note-update',
  memoryArchiveNote: 'memory:note-archive',
  memoryRestoreNote: 'memory:note-restore',
  memoryDeleteNote: 'memory:note-delete',
  memoryListPeriod: 'memory:period-list',
  memoryListFolders: 'memory:folders-list',
  memoryCreateFolder: 'memory:folder-create',
  memoryUpdateFolder: 'memory:folder-update',
  memoryDeleteFolder: 'memory:folder-delete',
  memoryAssignNote: 'memory:folder-assign',
  memoryListMaterials: 'material:list',
  memoryAddMaterial: 'material:add',
  memoryGetMaterial: 'material:get',
  memoryUpdateMaterialTags: 'material:update-tags',
  memoryArchiveMaterial: 'material:archive',
  memoryRestoreMaterial: 'material:restore',
  memoryDeleteMaterial: 'material:delete',
  memoryListMaterialVersions: 'material:versions',
  memorySearch: 'memory:search',
  memoryRecycleList: 'memory:recycle-list',
  memoryRecycleRestore: 'memory:recycle-restore',
  memoryRecycleEmpty: 'memory:recycle-empty',
  memoryVersionHistory: 'memory:version-history',
  memoryVersionRestore: 'memory:version-restore',
  memoryCleanupSuggest: 'memory:cleanup-suggest',
  memoryCleanupApply: 'memory:cleanup-apply',
  memoryBackupList: 'memory:backup-list',
  memoryBackupCreate: 'memory:backup-create',
  memoryBackupRestore: 'memory:backup-restore',
  memoryQuota: 'memory:quota',
  privacyGet: 'privacy:get',
  privacySave: 'privacy:save',
  privacyPreflight: 'privacy:preflight',
  sandboxRun: 'sandbox:run',
  memoryListReminders: 'memory:reminders-list',
  memoryCreateReminder: 'memory:reminder-create',
  memoryDismissReminder: 'memory:reminder-dismiss',
  memoryDeleteReminder: 'memory:reminder-delete',
  memoryListSummaries: 'memory:summaries-list',
  memorySummarize: 'memory:summarize',
  memoryEnhance: 'memory:enhance'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]

/** 渲染进程通过 contextBridge 暴露的 window.api 类型 */
export interface RendererApi {
  generateDimensions(input: GenerateInput): Promise<IpcResult<GenerateDimensionsResponse>>
  summarizeConversation(input: GenerateInput): Promise<IpcResult<SummaryResult>>
  captureScreen(): Promise<IpcResult<ImageData | null>>
  cropImage(img: ImageData, rect: Rect): Promise<IpcResult<ImageData>>
  readClipboardImage(): Promise<IpcResult<ImageData | null>>
  pickImageFile(): Promise<IpcResult<ImageData | null>>
  readTextFile(): Promise<IpcResult<string | null>>
  copyText(text: string): Promise<IpcResult<null>>
  loadPrefs(): Promise<IpcResult<Preferences>>
  savePrefs(p: Preferences): Promise<IpcResult<null>>
  onClipboardImage(cb: (img: ImageData) => void): () => void
  /** 截图遮罩窗口专用：获取待选区全屏图 */
  getScreenshotImage(): Promise<IpcResult<ImageData | null>>
  /** 截图遮罩窗口专用：提交选区（null 表示取消） */
  finishScreenshot(rect: Rect | null): Promise<IpcResult<null>>
  /** 导出记忆库 JSON */
  exportMemory(): Promise<IpcResult<MemoryExportResult>>
  /** 选文件 + 解析 + 预览（null=用户取消选择） */
  pickMemoryImport(): Promise<IpcResult<MemoryImportPreview | null>>
  /** 按 merge/overwrite 策略应用导入 */
  applyMemoryImport(args: MemoryImportApplyArgs): Promise<IpcResult<MemoryImportResult>>
  /** 抓取分享链接正文 */
  fetchShare(url: string): Promise<IpcResult<{ text: string }>>

  // ---------- 记忆记事本（notes / folders / materials / versions / backup / privacy / sandbox） ----------
  listNotes(opts?: { archived?: boolean }): Promise<IpcResult<Note[]>>
  getNote(id: string): Promise<IpcResult<Note | null>>
  createNote(input: NoteInput): Promise<IpcResult<Note>>
  updateNote(id: string, patch: Partial<Note>): Promise<IpcResult<Note>>
  archiveNote(id: string): Promise<IpcResult<null>>
  restoreNote(id: string): Promise<IpcResult<null>>
  deleteNote(id: string): Promise<IpcResult<null>>
  listPeriod(scope: PeriodScope): Promise<IpcResult<PeriodGroup[]>>
  listFolders(): Promise<IpcResult<CycleFolder[]>>
  createFolder(input: CycleFolderInput): Promise<IpcResult<CycleFolder>>
  updateFolder(id: string, patch: Partial<CycleFolder>): Promise<IpcResult<CycleFolder>>
  deleteFolder(id: string): Promise<IpcResult<null>>
  assignNoteToFolder(noteId: string, folderId: string | null): Promise<IpcResult<null>>
  listMaterials(): Promise<IpcResult<Material[]>>
  addMaterial(): Promise<IpcResult<Material | null>>
  getMaterial(id: string): Promise<IpcResult<Material | null>>
  updateMaterialTags(id: string, tags: string[]): Promise<IpcResult<Material>>
  archiveMaterial(id: string): Promise<IpcResult<null>>
  restoreMaterial(id: string): Promise<IpcResult<null>>
  deleteMaterial(id: string): Promise<IpcResult<null>>
  listMaterialVersions(id: string): Promise<IpcResult<NoteVersion[]>>
  searchMemory(query: string): Promise<IpcResult<SearchHit[]>>
  listRecycle(): Promise<IpcResult<{ notes: Note[]; materials: Material[] }>>
  restoreRecycle(id: string, kind: 'note' | 'material'): Promise<IpcResult<null>>
  emptyRecycle(): Promise<IpcResult<null>>
  listVersions(noteId: string): Promise<IpcResult<NoteVersion[]>>
  restoreVersion(versionId: string): Promise<IpcResult<Note>>
  suggestCleanup(): Promise<IpcResult<CleanupItem[]>>
  applyCleanup(ids: string[]): Promise<IpcResult<CleanupResult>>
  listBackups(): Promise<IpcResult<BackupManifest[]>>
  createBackup(): Promise<IpcResult<BackupManifest>>
  restoreBackup(id: string): Promise<IpcResult<null>>
  quotaStats(): Promise<IpcResult<QuotaStats>>
  getPrivacy(): Promise<IpcResult<MemorySettings>>
  savePrivacy(settings: MemorySettings): Promise<IpcResult<null>>
  getPreflight(capability: string, noteIds: string[]): Promise<IpcResult<PrivacyPreflight>>
  runSandbox(input: SandboxInput): Promise<IpcResult<AiExecutionTask>>
  listReminders(): Promise<IpcResult<ReminderTask[]>>
  createReminder(input: ReminderInput): Promise<IpcResult<ReminderTask>>
  dismissReminder(id: string): Promise<IpcResult<null>>
  deleteReminder(id: string): Promise<IpcResult<null>>
  listSummaries(): Promise<IpcResult<MemorySummaryResult[]>>
  summarizeMemory(input: SummaryRequest): Promise<IpcResult<MemorySummaryResult>>
  enhanceText(input: EnhanceRequest): Promise<IpcResult<DimensionField[]>>
}

/**
 * contextBridge 暴露安全 API（ARCHITECTURE §6.2 window.api + MEMORY-TOOL-ARCHITECTURE-v2）。
 * 所有 channel 与签名来自 src/shared/ipc-contract.ts（唯一来源），不散落字符串。
 */
import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-contract'
import type { RendererApi } from '../shared/ipc-contract'
import type {
  GenerateInput,
  Preferences,
  ImageData,
  Rect,
  MemoryImportApplyArgs
} from '../shared/types'
import type {
  Note,
  NoteInput,
  CycleFolder,
  CycleFolderInput,
  Material,
  NoteVersion,
  ReminderInput,
  SummaryRequest,
  SandboxInput,
  PeriodScope,
  CleanupResult,
  EnhanceRequest,
  PrivacyPreflight
} from '../shared/memory-types'
import type { MemorySettings, CapabilityKey } from '../shared/privacy-types'

const api: RendererApi = {
  generateDimensions: (input: GenerateInput) => ipcRenderer.invoke(IPC.aiGenerate, input),
  summarizeConversation: (input: GenerateInput) => ipcRenderer.invoke(IPC.aiSummarize, input),
  captureScreen: () => ipcRenderer.invoke(IPC.captureScreen),
  cropImage: (img: ImageData, rect: Rect) => ipcRenderer.invoke(IPC.cropImage, img, rect),
  readClipboardImage: () => ipcRenderer.invoke(IPC.readClipboardImage),
  pickImageFile: () => ipcRenderer.invoke(IPC.pickImageFile),
  readTextFile: () => ipcRenderer.invoke(IPC.readTextFile),
  copyText: (text: string) => ipcRenderer.invoke(IPC.copyText, text),
  loadPrefs: () => ipcRenderer.invoke(IPC.loadPrefs),
  savePrefs: (p: Preferences) => ipcRenderer.invoke(IPC.savePrefs, p),
  onClipboardImage: (cb: (img: ImageData) => void) => {
    const listener = (_e: unknown, img: ImageData) => cb(img)
    ipcRenderer.on(IPC.clipboardImageEvent, listener)
    return () => ipcRenderer.removeListener(IPC.clipboardImageEvent, listener)
  },
  getScreenshotImage: () => ipcRenderer.invoke(IPC.screenshotGetImage),
  finishScreenshot: (rect: Rect | null) => ipcRenderer.invoke(IPC.screenshotFinish, rect),
  exportMemory: () => ipcRenderer.invoke(IPC.memoryExport),
  pickMemoryImport: () => ipcRenderer.invoke(IPC.memoryImportPick),
  applyMemoryImport: (args: MemoryImportApplyArgs) => ipcRenderer.invoke(IPC.memoryImportApply, args),
  fetchShare: (url: string) => ipcRenderer.invoke(IPC.shareFetch, url),

  // ---------- 记忆记事本 ----------
  listNotes: (opts?: { archived?: boolean }) => ipcRenderer.invoke(IPC.memoryListNotes, opts),
  getNote: (id: string) => ipcRenderer.invoke(IPC.memoryGetNote, id),
  createNote: (input: NoteInput) => ipcRenderer.invoke(IPC.memoryCreateNote, input),
  updateNote: (id: string, patch: Partial<Note>) => ipcRenderer.invoke(IPC.memoryUpdateNote, id, patch),
  archiveNote: (id: string) => ipcRenderer.invoke(IPC.memoryArchiveNote, id),
  restoreNote: (id: string) => ipcRenderer.invoke(IPC.memoryRestoreNote, id),
  deleteNote: (id: string) => ipcRenderer.invoke(IPC.memoryDeleteNote, id),
  listPeriod: (scope: PeriodScope) => ipcRenderer.invoke(IPC.memoryListPeriod, scope),
  listFolders: () => ipcRenderer.invoke(IPC.memoryListFolders),
  createFolder: (input: CycleFolderInput) => ipcRenderer.invoke(IPC.memoryCreateFolder, input),
  updateFolder: (id: string, patch: Partial<CycleFolder>) => ipcRenderer.invoke(IPC.memoryUpdateFolder, id, patch),
  deleteFolder: (id: string) => ipcRenderer.invoke(IPC.memoryDeleteFolder, id),
  assignNoteToFolder: (noteId: string, folderId: string | null) => ipcRenderer.invoke(IPC.memoryAssignNote, noteId, folderId),
  listMaterials: () => ipcRenderer.invoke(IPC.memoryListMaterials),
  addMaterial: () => ipcRenderer.invoke(IPC.memoryAddMaterial),
  getMaterial: (id: string) => ipcRenderer.invoke(IPC.memoryGetMaterial, id),
  updateMaterialTags: (id: string, tags: string[]) => ipcRenderer.invoke(IPC.memoryUpdateMaterialTags, id, tags),
  archiveMaterial: (id: string) => ipcRenderer.invoke(IPC.memoryArchiveMaterial, id),
  restoreMaterial: (id: string) => ipcRenderer.invoke(IPC.memoryRestoreMaterial, id),
  deleteMaterial: (id: string) => ipcRenderer.invoke(IPC.memoryDeleteMaterial, id),
  listMaterialVersions: (id: string) => ipcRenderer.invoke(IPC.memoryListMaterialVersions, id),
  searchMemory: (query: string) => ipcRenderer.invoke(IPC.memorySearch, query),
  listRecycle: () => ipcRenderer.invoke(IPC.memoryRecycleList),
  restoreRecycle: (id: string, kind: 'note' | 'material') => ipcRenderer.invoke(IPC.memoryRecycleRestore, id, kind),
  emptyRecycle: () => ipcRenderer.invoke(IPC.memoryRecycleEmpty),
  listVersions: (noteId: string) => ipcRenderer.invoke(IPC.memoryVersionHistory, noteId),
  restoreVersion: (versionId: string) => ipcRenderer.invoke(IPC.memoryVersionRestore, versionId),
  suggestCleanup: () => ipcRenderer.invoke(IPC.memoryCleanupSuggest),
  applyCleanup: (ids: string[]) => ipcRenderer.invoke(IPC.memoryCleanupApply, ids) as Promise<import('../shared/types').IpcResult<CleanupResult>>,
  listBackups: () => ipcRenderer.invoke(IPC.memoryBackupList),
  createBackup: () => ipcRenderer.invoke(IPC.memoryBackupCreate),
  restoreBackup: (id: string) => ipcRenderer.invoke(IPC.memoryBackupRestore, id),
  quotaStats: () => ipcRenderer.invoke(IPC.memoryQuota),
  getPrivacy: () => ipcRenderer.invoke(IPC.privacyGet),
  savePrivacy: (settings: MemorySettings) => ipcRenderer.invoke(IPC.privacySave, settings),
  getPreflight: (capability: CapabilityKey, noteIds: string[]) => ipcRenderer.invoke(IPC.privacyPreflight, capability, noteIds) as Promise<import('../shared/types').IpcResult<PrivacyPreflight>>,
  runSandbox: (input: SandboxInput) => ipcRenderer.invoke(IPC.sandboxRun, input),
  listReminders: () => ipcRenderer.invoke(IPC.memoryListReminders),
  createReminder: (input: ReminderInput) => ipcRenderer.invoke(IPC.memoryCreateReminder, input),
  dismissReminder: (id: string) => ipcRenderer.invoke(IPC.memoryDismissReminder, id),
  deleteReminder: (id: string) => ipcRenderer.invoke(IPC.memoryDeleteReminder, id),
  listSummaries: () => ipcRenderer.invoke(IPC.memoryListSummaries),
  summarizeMemory: (input: SummaryRequest) => ipcRenderer.invoke(IPC.memorySummarize, input),
  enhanceText: (input: EnhanceRequest) => ipcRenderer.invoke(IPC.memoryEnhance, input)
}

contextBridge.exposeInMainWorld('api', api)

/**
 * IPC handler 路由（ARCHITECTURE §6.2 IpcRouter + MEMORY-TOOL-ARCHITECTURE-v2 §4.1）。
 * 全链路接线：AI（含规则兜底）/ 存储 / 截图 / 剪贴板 / 文件 / 记忆记事本。
 * 所有返回值遵循 { ok:true, data } | { ok:false, code, message } 契约。
 */
import { ipcMain, dialog, nativeImage } from 'electron'
import { promises as fs } from 'fs'
import { extname, basename, join } from 'path'
import { IPC } from '../shared/ipc-contract'
import type {
  GenerateInput,
  Preferences,
  ImageData,
  Rect,
  IpcResult,
  GenerateDimensionsResponse,
  SummaryResult,
  ErrorCode,
  MemoryExportResult,
  MemoryImportPreview,
  MemoryImportApplyArgs,
  MemoryImportResult
} from '../shared/types'
import type {
  Note,
  NoteInput,
  CycleFolder,
  CycleFolderInput,
  Material,
  NoteVersion,
  ReminderTask,
  ReminderInput,
  SummaryRequest,
  SandboxInput,
  PeriodScope,
  CleanupItem,
  EnhanceRequest
} from '../shared/memory-types'
import type { MemorySettings, CapabilityKey } from '../shared/privacy-types'
import { MEMORY_IMPORT_MAX_BYTES } from '../shared/constants'
import { parseMemoryImport, serializeMemoryExport, mergeHabits } from '../shared/memory-io'
import { Storage } from './storage/store'
import { LLMProvider, AppError } from './ai/llm'
import { generateFallbackDimensions, resolveGenerateError } from './ai/fallback'
import { ScreenshotService } from './screenshot'
import { ClipboardService } from './clipboard'
import { ShareLinkFetcher } from './share-fetch'
import { getMainWindow } from './window'
import { getMemorySystem, reloadMemorySystem } from './memory'
import { memoryError } from './memory/privacy-guard'
import type { CleanupContext } from './memory/version-manager'

const screenshot = new ScreenshotService()
const clipboard = new ClipboardService()
const shareFetcher = new ShareLinkFetcher()
let llm: LLMProvider | null = null

export function registerIpc(): void {
  const storage = Storage.getInstance()
  llm = new LLMProvider(storage.get('model'))

  // ---------- AI ----------
  ipcMain.handle(
    IPC.aiGenerate,
    async (_e, input: GenerateInput): Promise<IpcResult<GenerateDimensionsResponse>> => {
      try {
        const cfg = storage.get('model')
        llm?.setConfig(cfg)
        if (!canCallModel(cfg)) {
          return ok({
            dimensions: generateFallbackDimensions(input.text),
            source: 'fallback',
            fallbackReason: 'NO_KEY'
          })
        }
        try {
          const dims = await llm!.generateDimensions(input, storage.get('dimensionHabits'))
          if (!dims || dims.length === 0) {
            throw new AppError('EMPTY_RESULT', '模型未返回有效维度')
          }
          return ok({ dimensions: dims, source: 'ai' })
        } catch (err) {
          return resolveGenerateError(codeOf(err), err instanceof Error ? err.message : String(err), input.text)
        }
      } catch (err) {
        return fail(err)
      }
    }
  )

  ipcMain.handle(
    IPC.aiSummarize,
    async (_e, input: GenerateInput): Promise<IpcResult<SummaryResult>> => {
      try {
        const cfg = storage.get('model')
        llm?.setConfig(cfg)
        if (!canCallModel(cfg)) {
          return fail(new AppError('NO_KEY', '未配置 API Key'))
        }
        const result = await llm!.summarizeConversation(input)
        return ok(result)
      } catch (err) {
        return fail(err)
      }
    }
  )

  // ---------- 截图 ----------
  ipcMain.handle(IPC.captureScreen, async (): Promise<IpcResult<ImageData | null>> => {
    try {
      const img = await screenshot.captureWithSelection(getMainWindow())
      return ok(img)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.cropImage, (_e, img: ImageData, rect: Rect): IpcResult<ImageData> => {
    try {
      return ok(screenshot.crop(img, rect))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.screenshotGetImage, (): IpcResult<ImageData | null> => {
    try {
      return ok(screenshot.getPendingImage())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.screenshotFinish, (_e, rect: Rect | null): IpcResult<null> => {
    try {
      screenshot.finishSelection(rect)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 剪贴板 ----------
  ipcMain.handle(IPC.readClipboardImage, (): IpcResult<ImageData | null> => {
    try {
      return ok(clipboard.readImage())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.copyText, (_e, text: string): IpcResult<null> => {
    try {
      clipboard.writeText(String(text ?? ''))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 文件 ----------
  ipcMain.handle(IPC.pickImageFile, async (): Promise<IpcResult<ImageData | null>> => {
    try {
      const win = getMainWindow() ?? undefined
      const filters = [{ name: '图片', extensions: withUpper(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']) }]
      const res = win
        ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
        : await dialog.showOpenDialog({ properties: ['openFile'], filters })
      if (res.canceled || !res.filePaths.length) return ok(null)
      const buf = await fs.readFile(res.filePaths[0])
      const img = nativeImage.createFromBuffer(buf)
      if (img.isEmpty()) throw new AppError('FILE_READ_ERROR', '无法解析图片文件')
      const size = img.getSize()
      const mime = mimeOf(res.filePaths[0])
      return ok({ dataUrl: img.toDataURL(), mime, width: size.width, height: size.height })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.readTextFile, async (): Promise<IpcResult<string | null>> => {
    try {
      const win = getMainWindow() ?? undefined
      const opts = {
        properties: ['openFile' as const],
        filters: [{ name: '文本', extensions: withUpper(['txt', 'md', 'markdown']) }]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths.length) return ok(null)
      const text = await fs.readFile(res.filePaths[0], 'utf-8')
      return ok(text)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 偏好 ----------
  ipcMain.handle(IPC.loadPrefs, (): IpcResult<Preferences> => {
    try {
      return ok(storage.load())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.savePrefs, (_e, p: Preferences): IpcResult<null> => {
    try {
      storage.save(p)
      llm?.setConfig(p.model)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 记忆库（导入/导出） ----------
  ipcMain.handle(IPC.memoryExport, async (): Promise<IpcResult<MemoryExportResult>> => {
    try {
      const habits = storage.get('dimensionHabits')
      const json = serializeMemoryExport(habits)
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '')
      const opts = {
        title: '导出记忆库',
        defaultPath: `prompt-scaffold-memory-${date}.json`,
        filters: [{ name: 'JSON', extensions: ['json', 'JSON'] }]
      }
      const win = getMainWindow() ?? undefined
      const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
      if (res.canceled || !res.filePath) return ok({ count: 0, canceled: true })
      await fs.writeFile(res.filePath, json, 'utf-8')
      return ok({ count: habits.length, canceled: false })
    } catch (err) {
      return fail(new AppError('EXPORT_FAILED', '导出失败：' + msgOf(err)))
    }
  })

  ipcMain.handle(IPC.memoryImportPick, async (): Promise<IpcResult<MemoryImportPreview | null>> => {
    try {
      const win = getMainWindow() ?? undefined
      const opts = {
        title: '导入记忆库',
        properties: ['openFile' as const],
        filters: [{ name: 'JSON', extensions: ['json', 'JSON'] }]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths.length) return ok(null)
      const filePath = res.filePaths[0]

      let raw: string
      try {
        const stat = await fs.stat(filePath)
        if (stat.size > MEMORY_IMPORT_MAX_BYTES) {
          return fail(new AppError('IMPORT_INVALID', '文件过大（超过 5MB），无法导入'))
        }
        raw = await fs.readFile(filePath, 'utf-8')
      } catch (err) {
        return fail(new AppError('IMPORT_INVALID', '读取文件失败：' + msgOf(err)))
      }

      const { habits, invalidCount } = parseMemoryImport(raw)
      const currentNames = new Set(storage.get('dimensionHabits').map((h) => h.name))
      const conflictCount = habits.filter((h) => currentNames.has(h.name)).length
      return ok({ fileName: basename(filePath), habits, total: habits.length, conflictCount, invalidCount })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryImportApply, (_e, args: MemoryImportApplyArgs): IpcResult<MemoryImportResult> => {
    try {
      if (!args || !Array.isArray(args.habits)) {
        return fail(new AppError('IMPORT_INVALID', '导入参数无效'))
      }
      const strategy = args.strategy === 'overwrite' ? 'overwrite' : 'merge'
      const current = storage.get('dimensionHabits')
      const result = mergeHabits(current, args.habits, strategy)
      const prefs = storage.load()
      storage.save({ ...prefs, dimensionHabits: result.habits })
      return ok(result)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 分享链接抓取 ----------
  ipcMain.handle(IPC.shareFetch, async (_e, url: string): Promise<IpcResult<{ text: string }>> => {
    try {
      const text = await shareFetcher.fetchText(String(url ?? ''))
      return ok({ text })
    } catch (err) {
      return fail(err)
    }
  })

  // ==========================================================================
  // 记忆记事本（memory:* / privacy:* / sandbox:*）
  // ==========================================================================
  registerMemoryIpc()
}

function registerMemoryIpc(): void {
  const mem = () => getMemorySystem()

  // ---------- Notes ----------
  ipcMain.handle(IPC.memoryListNotes, (_e, opts?: { archived?: boolean }): IpcResult<Note[]> => {
    try {
      return ok(mem().memoryStore.listNotes(opts))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryGetNote, (_e, id: string): IpcResult<Note | null> => {
    try {
      return ok(mem().memoryStore.getNote(String(id)))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryCreateNote, (_e, input: NoteInput): IpcResult<Note> => {
    try {
      const note = mem().memoryStore.createNote(normalizeNoteInput(input))
      mem().searchIndex.addNote(note)
      return ok(note)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryUpdateNote, (_e, id: string, patch: Partial<Note>): IpcResult<Note> => {
    try {
      const store = mem().memoryStore
      const existing = store.getNote(String(id))
      if (!existing) return fail(memoryError('NOT_FOUND', '笔记不存在'))
      // 修改前留版本快照（版本控制开启且正文变化时）
      const settings = store.getSettings()
      if (
        settings.version.enabled &&
        typeof patch.content === 'string' &&
        patch.content !== existing.content
      ) {
        mem().versionManager.snapshotNote(existing, '编辑')
      }
      const updated = store.updateNote(String(id), patch)
      if (!updated) return fail(memoryError('NOT_FOUND', '笔记不存在'))
      mem().searchIndex.addNote(updated)
      return ok(updated)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryArchiveNote, (_e, id: string): IpcResult<null> => {
    try {
      mem().memoryStore.archiveNote(String(id))
      mem().searchIndex.removeNote(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryRestoreNote, (_e, id: string): IpcResult<null> => {
    try {
      mem().memoryStore.restoreNote(String(id))
      const n = mem().memoryStore.getNote(String(id))
      if (n) mem().searchIndex.addNote(n)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryDeleteNote, (_e, id: string): IpcResult<null> => {
    try {
      mem().memoryStore.deleteNote(String(id))
      mem().searchIndex.removeNote(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryListPeriod, (_e, scope: PeriodScope): IpcResult<unknown> => {
    try {
      return ok(mem().memoryStore.listPeriod(scope))
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- CycleFolders ----------
  ipcMain.handle(IPC.memoryListFolders, (): IpcResult<CycleFolder[]> => {
    try {
      return ok(mem().memoryStore.listFolders())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryCreateFolder, (_e, input: CycleFolderInput): IpcResult<CycleFolder> => {
    try {
      return ok(mem().memoryStore.createFolder(input))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryUpdateFolder, (_e, id: string, patch: Partial<CycleFolder>): IpcResult<CycleFolder | null> => {
    try {
      return ok(mem().memoryStore.updateFolder(String(id), patch))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryDeleteFolder, (_e, id: string): IpcResult<null> => {
    try {
      mem().memoryStore.deleteFolder(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryAssignNote, (_e, noteId: string, folderId: string | null): IpcResult<null> => {
    try {
      mem().memoryStore.assignNoteToFolder(String(noteId), folderId ? String(folderId) : null)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- Materials ----------
  ipcMain.handle(IPC.memoryListMaterials, (): IpcResult<Material[]> => {
    try {
      return ok(mem().materialStore.list())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryAddMaterial, async (): Promise<IpcResult<Material | null>> => {
    try {
      const win = getMainWindow() ?? undefined
      const filters = [
        {
          name: '资料文件',
          extensions: withUpper(['pdf', 'docx', 'xlsx', 'pptx', 'txt', 'md', 'markdown', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'])
        }
      ]
      const res = win
        ? await dialog.showOpenDialog(win, { properties: ['openFile'], filters })
        : await dialog.showOpenDialog({ properties: ['openFile'], filters })
      if (res.canceled || !res.filePaths.length) return ok(null)
      const imported = await mem().materialStore.importFile(res.filePaths[0])
      mem().searchIndex.addMaterial(imported.material, imported.extractedText)
      return ok(imported.material)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryGetMaterial, (_e, id: string): IpcResult<Material | null> => {
    try {
      return ok(mem().materialStore.get(String(id)))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryUpdateMaterialTags, (_e, id: string, tags: string[]): IpcResult<Material | null> => {
    try {
      return ok(mem().materialStore.updateTags(String(id), Array.isArray(tags) ? tags : []))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryArchiveMaterial, (_e, id: string): IpcResult<null> => {
    try {
      mem().materialStore.archive(String(id))
      mem().searchIndex.removeMaterial(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryRestoreMaterial, (_e, id: string): IpcResult<null> => {
    try {
      mem().materialStore.restore(String(id))
      const m = mem().materialStore.get(String(id))
      if (m) mem().searchIndex.addMaterial(m, mem().materialStore.readExtracted(m))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryDeleteMaterial, (_e, id: string): IpcResult<null> => {
    try {
      mem().materialStore.delete(String(id))
      mem().searchIndex.removeMaterial(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryListMaterialVersions, (_e, id: string): IpcResult<unknown[]> => {
    try {
      return ok(mem().materialStore.listVersions(String(id)))
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 搜索 / 回收站 ----------
  ipcMain.handle(IPC.memorySearch, (_e, query: string): IpcResult<unknown> => {
    try {
      return ok(mem().searchIndex.search(String(query ?? '')))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryRecycleList, (): IpcResult<{ notes: Note[]; materials: Material[] }> => {
    try {
      return ok({
        notes: mem().memoryStore.listArchivedNotes(),
        materials: mem().materialStore.listArchived()
      })
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryRecycleRestore, (_e, id: string, kind: string): IpcResult<null> => {
    try {
      if (kind === 'material') mem().materialStore.restore(String(id))
      else mem().memoryStore.restoreNote(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryRecycleEmpty, (): IpcResult<null> => {
    try {
      for (const n of mem().memoryStore.listArchivedNotes()) mem().memoryStore.deleteNote(n.id)
      for (const m of mem().materialStore.listArchived()) mem().materialStore.delete(m.id)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 版本 ----------
  ipcMain.handle(IPC.memoryVersionHistory, (_e, noteId: string): IpcResult<NoteVersion[]> => {
    try {
      return ok(mem().versionManager.listNoteVersions(String(noteId)))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryVersionRestore, (_e, versionId: string): IpcResult<Note> => {
    try {
      const v = mem().versionManager.getVersion(String(versionId))
      if (!v) return fail(memoryError('VERSION_NOT_FOUND', '版本不存在'))
      const note = mem().memoryStore.getNote(v.noteId)
      if (!note) return fail(memoryError('NOT_FOUND', '笔记不存在'))
      // 回滚前对当前内容再留一份快照（可撤销）
      mem().versionManager.snapshotNote(note, '回滚前快照')
      const updated = mem().memoryStore.updateNote(v.noteId, { content: v.content })
      if (!updated) return fail(memoryError('NOT_FOUND', '笔记不存在'))
      mem().searchIndex.addNote(updated)
      return ok(updated)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryCleanupSuggest, (): IpcResult<CleanupItem[]> => {
    try {
      return ok(mem().versionManager.suggestCleanup(cleanupContext()))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryCleanupApply, (_e, ids: string[]): IpcResult<unknown> => {
    try {
      const idSet = new Set(Array.isArray(ids) ? ids.map(String) : [])
      const items = mem().versionManager.suggestCleanup(cleanupContext()).filter((i) => idSet.has(i.id))
      return ok(mem().versionManager.applyCleanup(items, cleanupContext()))
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 备份 / 配额 ----------
  ipcMain.handle(IPC.memoryBackupList, (): IpcResult<unknown[]> => {
    try {
      return ok(mem().backupManager.list())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryBackupCreate, (): IpcResult<unknown> => {
    try {
      return ok(mem().backupManager.create())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryBackupRestore, (_e, id: string): IpcResult<null> => {
    try {
      const okRestore = mem().backupManager.restore(String(id))
      if (!okRestore) return fail(memoryError('BACKUP_FAILED', '备份不存在或损坏'))
      reloadMemorySystem()
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryQuota, (): IpcResult<unknown> => {
    try {
      return ok(mem().backupManager.quotaStats())
    } catch (err) {
      return fail(err)
    }
  })

  // ---------- 隐私 / 沙箱 / 提醒 / 总结 / 增强 ----------
  ipcMain.handle(IPC.privacyGet, (): IpcResult<MemorySettings> => {
    try {
      return ok(mem().memoryStore.getSettings())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.privacySave, (_e, settings: MemorySettings): IpcResult<null> => {
    try {
      mem().memoryStore.saveSettings(settings)
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.privacyPreflight, (_e, capability: CapabilityKey, noteIds: string[]): IpcResult<unknown> => {
    try {
      const all = mem().memoryStore.listNotes({ archived: false })
      const ids = new Set(Array.isArray(noteIds) ? noteIds : [])
      const selected = ids.size ? all.filter((n) => ids.has(n.id)) : all
      const cfg = mem().memoryStore.getSettings()
      const baseUrl = Storage.getInstance().get('model').baseUrl ?? ''
      return ok(mem().privacyGuard.preflight(capability, selected, cfg.privacy.sendScope, baseUrl))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.sandboxRun, async (_e, input: SandboxInput): Promise<IpcResult<unknown>> => {
    try {
      mem().privacyGuard.check('codeExec')
      return ok(await mem().sandbox.run(input))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryListReminders, (): IpcResult<ReminderTask[]> => {
    try {
      return ok(mem().reminderScheduler.list())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryCreateReminder, (_e, input: ReminderInput): IpcResult<ReminderTask> => {
    try {
      return ok(mem().reminderScheduler.create(input))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryDismissReminder, (_e, id: string): IpcResult<null> => {
    try {
      mem().reminderScheduler.dismiss(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryDeleteReminder, (_e, id: string): IpcResult<null> => {
    try {
      mem().reminderScheduler.delete(String(id))
      return ok(null)
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryListSummaries, (): IpcResult<unknown[]> => {
    try {
      return ok(mem().summarize.list())
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memorySummarize, async (_e, input: SummaryRequest): Promise<IpcResult<unknown>> => {
    try {
      return ok(await mem().summarize.summarize(input))
    } catch (err) {
      return fail(err)
    }
  })

  ipcMain.handle(IPC.memoryEnhance, async (_e, input: EnhanceRequest): Promise<IpcResult<unknown>> => {
    try {
      return ok(await mem().enhance.enhance(input))
    } catch (err) {
      return fail(err)
    }
  })
}

function cleanupContext(): CleanupContext {
  const m = getMemorySystem()
  return {
    keepVersions: m.memoryStore.getSettings().version.keepVersions,
    referencedBlobs: m.materialStore.allReferencedBlobs(),
    blobsDir: join(m.dir, 'files', 'blobs'),
    backups: m.backupManager.list(),
    backupRotation: m.memoryStore.getSettings().storage.backupRotation,
    removeBackup: (id: string) => m.backupManager.delete(id)
  }
}

function normalizeNoteInput(input: NoteInput): NoteInput {
  const kinds = new Set(['note', 'todo', 'insight', 'snippet', 'constraint'])
  const aiSources = new Set(['none', 'manual', 'enhanced'])
  return {
    title: typeof input?.title === 'string' ? input.title : undefined,
    content: typeof input?.content === 'string' ? input.content : '',
    format: input?.format === 'markdown' ? 'markdown' : 'text',
    kind: kinds.has(input?.kind as string) ? input.kind : 'note',
    tags: Array.isArray(input?.tags) ? input.tags.filter((t) => typeof t === 'string') : [],
    dimensionFields: Array.isArray(input?.dimensionFields)
      ? input.dimensionFields.filter((f) => f && typeof f.name === 'string' && typeof f.value === 'string')
      : [],
    aiSource: aiSources.has(input?.aiSource as string) ? input.aiSource : 'none',
    cycleFolderId: typeof input?.cycleFolderId === 'string' ? input.cycleFolderId : undefined,
    pinned: input?.pinned === true
  }
}

function withUpper(exts: string[]): string[] {
  const out = new Set<string>()
  for (const e of exts) {
    out.add(e)
    out.add(e.toUpperCase())
  }
  return Array.from(out)
}

function canCallModel(cfg: Preferences['model']): boolean {
  if (cfg.presetId === 'ollama') return true // 本地预设无需 key
  return (cfg.apiKey ?? '').trim().length > 0
}

function mimeOf(path: string): string {
  const ext = extname(path).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp'
  }
  return map[ext] ?? 'image/png'
}

function codeOf(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code)
  }
  return 'MODEL_ERROR'
}

function ok<T>(data: T): IpcResult<T> {
  return { ok: true, data }
}

function fail(err: unknown): IpcResult<never> {
  const code = (codeOf(err) || 'MODEL_ERROR') as ErrorCode
  const message = err instanceof Error ? err.message : String(err)
  return { ok: false, code, message }
}

function msgOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

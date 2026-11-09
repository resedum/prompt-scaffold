/**
 * 记忆系统 facade：组装全部模块 + 单例访问 + 初始化/重载（ARCHITECTURE-v2 §4.1）。
 * 数据目录 <userData>/memory/。
 */
import { join } from 'path'
import { ensureDir } from './fs-utils'
import { MemoryStore } from './memory-store'
import { MaterialStore } from './material-store'
import { SearchIndex } from './search-index'
import { VersionManager } from './version-manager'
import { BackupManager } from './backup-manager'
import { ReminderScheduler } from './reminder-scheduler'
import { SummarizeService } from './summarize'
import { EnhanceService } from './enhance'
import { CodeSandbox } from './code-sandbox'
import { PrivacyGuard } from './privacy-guard'
import { FeatureGate } from './feature-gate'
import type { ModelConfig, MemoryHabit } from '../../shared/types'
import { DEFAULT_MODEL_CONFIG } from '../../shared/constants'

export interface MemorySystem {
  dir: string
  memoryStore: MemoryStore
  materialStore: MaterialStore
  searchIndex: SearchIndex
  versionManager: VersionManager
  backupManager: BackupManager
  reminderScheduler: ReminderScheduler
  summarize: SummarizeService
  enhance: EnhanceService
  sandbox: CodeSandbox
  privacyGuard: PrivacyGuard
  featureGate: FeatureGate
}

export interface MemoryDeps {
  getModelConfig: () => ModelConfig
  getHabits: () => MemoryHabit[]
}

let system: MemorySystem | null = null
let getModelConfigFn: () => ModelConfig = () => DEFAULT_MODEL_CONFIG
let getHabitsFn: () => MemoryHabit[] = () => []

/** 初始化记忆系统（应用启动时调用一次） */
export function initMemorySystem(userDataDir: string, deps: MemoryDeps): MemorySystem {
  getModelConfigFn = deps.getModelConfig
  getHabitsFn = deps.getHabits
  const dir = join(userDataDir, 'memory')
  ensureDir(dir)
  system = build(dir)
  rebuildIndex()
  system.reminderScheduler.start()
  return system
}

/** 备份恢复后重载磁盘缓存 + 重建索引 */
export function reloadMemorySystem(): MemorySystem | null {
  if (!system) return null
  system.memoryStore.reload()
  system.materialStore.reload()
  system.versionManager.reload()
  system.backupManager.reload()
  system.summarize.reload()
  system.sandbox.reload()
  system.reminderScheduler.reload()
  rebuildIndex()
  return system
}

export function getMemorySystem(): MemorySystem {
  if (!system) throw new Error('记忆系统未初始化，请先调用 initMemorySystem(userDataDir, deps)')
  return system
}

function build(dir: string): MemorySystem {
  const memoryStore = new MemoryStore(dir)
  const materialStore = new MaterialStore(dir)
  const versionManager = new VersionManager(dir)
  const searchIndex = new SearchIndex(dir)
  const backupManager = new BackupManager(dir)
  const reminderScheduler = new ReminderScheduler(dir)
  const featureGate = new FeatureGate(() => memoryStore.getSettings().edition)
  const privacyGuard = new PrivacyGuard(() => memoryStore.getSettings().privacy)
  const summarize = new SummarizeService(dir, {
    memoryStore,
    privacyGuard,
    getModelConfig: () => getModelConfigFn()
  })
  const enhance = new EnhanceService({
    privacyGuard,
    getModelConfig: () => getModelConfigFn(),
    getHabits: () => getHabitsFn()
  })
  const sandbox = new CodeSandbox(dir)

  return {
    dir,
    memoryStore,
    materialStore,
    searchIndex,
    versionManager,
    backupManager,
    reminderScheduler,
    summarize,
    enhance,
    sandbox,
    privacyGuard,
    featureGate
  }
}

function rebuildIndex(): void {
  if (!system) return
  const texts = new Map<string, string>()
  for (const m of system.materialStore.list()) {
    texts.set(m.id, system.materialStore.readExtracted(m))
  }
  system.searchIndex.rebuild(system.memoryStore.listNotes({ archived: false }), system.materialStore.list(), texts)
}

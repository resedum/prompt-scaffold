/**
 * JSON 文件 + 原子写存储（ARCHITECTURE §1.5）。
 * - 存储位置：app.getPath('userData')/preferences.json
 * - 写入：临时文件 + rename 原子替换
 * - 内存缓存 + 防抖落盘（300ms）
 * - 纯 Node fs 实现，零 native 依赖。
 *
 * 崩溃修复（ARCHITECTURE v2 §1.2）：writeNow() 全程 try-catch，
 * 失败时降级为直接写，仍失败则保留内存缓存并单次重试，绝不向定时器回调抛异常。
 */
import { existsSync, readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'
import type { Preferences } from '../../shared/types'
import { DEFAULT_MODEL_CONFIG, STORAGE_DEBOUNCE_MS, STORAGE_RETRY_MS } from '../../shared/constants'
import { dedupeHabits } from '../../shared/memory'

export const DEFAULT_PREFERENCES: Preferences = {
  model: DEFAULT_MODEL_CONFIG,
  language: 'zh',
  ui: { theme: 'light', trayEnabled: true },
  dimensionHabits: []
}

export class Storage {
  private static _instance: Storage | null = null

  static init(userDataDir: string): void {
    this._instance = new Storage(join(userDataDir, 'preferences.json'))
  }

  static getInstance(): Storage {
    if (!this._instance) throw new Error('Storage 未初始化，请先调用 Storage.init(userDataDir)')
    return this._instance
  }

  private filePath: string
  private cache: Preferences | null = null
  private writeTimer: NodeJS.Timeout | null = null
  private retryTimer: NodeJS.Timeout | null = null

  private constructor(filePath: string) {
    this.filePath = filePath
  }

  /** 容错读取：文件缺失/损坏时回退默认值（JSON 容错） */
  load(): Preferences {
    if (this.cache) return this.cache
    try {
      if (existsSync(this.filePath)) {
        const raw = readFileSync(this.filePath, 'utf-8')
        const parsed = JSON.parse(raw) as Partial<Preferences>
        this.cache = {
          model: { ...DEFAULT_MODEL_CONFIG, ...(parsed.model ?? {}) },
          language: parsed.language === 'en' ? 'en' : 'zh',
          ui: { theme: 'light', trayEnabled: true, ...(parsed.ui ?? {}) },
          dimensionHabits: dedupeHabits(Array.isArray(parsed.dimensionHabits) ? parsed.dimensionHabits : [])
        }
      } else {
        this.cache = { ...DEFAULT_PREFERENCES, dimensionHabits: [] }
      }
    } catch {
      this.cache = { ...DEFAULT_PREFERENCES, dimensionHabits: [] }
    }
    return this.cache
  }

  save(p: Preferences): void {
    this.cache = p
    this.scheduleWrite()
  }

  get<K extends keyof Preferences>(k: K): Preferences[K] {
    return this.load()[k]
  }

  set<K extends keyof Preferences>(k: K, v: Preferences[K]): void {
    const next = { ...this.load(), [k]: v }
    this.save(next)
  }

  /** 立即落盘（app 退出前调用）：同步清 write/retry 两个定时器 */
  flush(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.writeTimer = null
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    if (this.cache) this.writeNow()
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => {
      this.writeTimer = null
      this.writeNow()
    }, STORAGE_DEBOUNCE_MS)
  }

  /** 写入失败后的单次重试（防抖 1s，同一时刻至多一个待执行重试） */
  private scheduleRetry(): void {
    if (this.retryTimer) return
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      this.writeNow()
    }, STORAGE_RETRY_MS)
  }

  /**
   * 落盘：tmp 原子写 → rename；rename 失败降级直接写；仍失败保留缓存并重试。
   * 全程 try-catch，绝不向定时器回调抛异常（否则主进程 uncaughtException → 闪退）。
   */
  private writeNow(): void {
    if (!this.cache) return
    const payload = JSON.stringify(this.cache, null, 2)
    const tmp = this.filePath + '.tmp'
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      writeFileSync(tmp, payload, 'utf-8')
      try {
        renameSync(tmp, this.filePath)
      } catch (renameErr) {
        // 跨平台稳健原子替换（R9）：Windows 目标存在/被占用时 rename 可能 EEXIST/EPERM，
        // 先移除目标再重试一次；仍失败才降级直接写。
        if (isRetryableRename(renameErr)) {
          try {
            rmSync(this.filePath, { force: true })
          } catch {
            /* 移除失败则忽略，继续重试 rename */
          }
          try {
            renameSync(tmp, this.filePath)
            return
          } catch {
            /* 重试失败，走降级直写 */
          }
        }
        throw renameErr
      }
    } catch (err) {
      try {
        // 降级：rename 失败（目标被占用 / 文件系统不支持原子替换）→ 直接覆盖写
        writeFileSync(this.filePath, payload, 'utf-8')
        console.warn('[store] 原子替换失败，已降级为直接写入', errMsg(err))
      } catch (err2) {
        // 直接写也失败：保留内存缓存（数据仍在 this.cache，不丢），稍后重试
        console.error('[store] 落盘失败，保留内存缓存并重试', errMsg(err2))
        this.scheduleRetry()
      }
    } finally {
      try {
        unlinkSync(tmp)
      } catch {
        /* 忽略残留 tmp 清理失败 */
      }
    }
  }
}

/** 脱敏错误格式化（不含 apiKey，仅 name/message） */
function errMsg(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/** rename 失败且属于「目标已存在/被占用」时可重试的跨平台错误码（R9） */
function isRetryableRename(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

/**
 * 记忆系统文件与 JSON 存储工具（纯 Node fs，零 native 依赖）。
 * 提供跨平台稳健原子写（R9）、内容哈希、JSON 集合/对象读写、目录体积统计。
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
  mkdirSync,
  readdirSync,
  statSync,
  cpSync
} from 'fs'
import { dirname, join } from 'path'
import { createHash, randomUUID } from 'crypto'

/** 当前 ISO 8601 UTC 时间戳 */
export function nowIso(): string {
  return new Date().toISOString()
}

/** 生成随机 id（主进程使用 crypto.randomUUID） */
export function makeId(): string {
  return randomUUID()
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

/** 清空并重建目录（备份恢复前清目标，避免合并式拷贝残留孤儿文件） */
export function resetDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
}

/** 计算内容 SHA-256（十六进制） */
export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

/** rename 失败且属于「目标已存在/被占用」时可重试的跨平台错误码（R9） */
function isRetryableRename(err: unknown): boolean {
  const code = (err as { code?: string })?.code
  return code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY' || code === 'EACCES'
}

/**
 * 跨平台稳健原子写（R9）：
 * 先写 tmp 再 rename；Windows 目标存在/被占用导致 rename EEXIST/EPERM 时，
 * 先移除目标再重试一次；仍失败才降级为直接覆盖写。全程不向调用方抛异常（除 fs 硬错误）。
 */
export function writeFileAtomic(filePath: string, data: string | Buffer): void {
  const tmp = filePath + '.tmp'
  ensureDir(dirname(filePath))
  try {
    writeFileSync(tmp, data)
    try {
      renameSync(tmp, filePath)
    } catch (err) {
      if (isRetryableRename(err)) {
        try {
          rmSync(filePath, { force: true })
        } catch {
          /* 移除失败则忽略，继续重试 rename */
        }
        try {
          renameSync(tmp, filePath)
          return
        } catch {
          /* 重试失败，走降级直写 */
        }
      }
      throw err
    }
  } catch {
    // 降级：直接覆盖写（仍失败则向上抛，由上层决定是否重试）
    writeFileSync(filePath, data)
  } finally {
    try {
      rmSync(tmp, { force: true })
    } catch {
      /* 忽略残留 tmp 清理失败 */
    }
  }
}

/** 容错读取 JSON 文件；缺失/损坏返回 fallback */
export function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (existsSync(filePath)) {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as T
    }
  } catch {
    /* 忽略解析错误 */
  }
  return fallback
}

/** 原子写入 JSON 文件（2 空格缩进） */
export function writeJsonFile<T>(filePath: string, value: T): void {
  writeFileAtomic(filePath, JSON.stringify(value, null, 2))
}

/** 单对象 JSON 文件（内存缓存 + 原子落盘） */
export class JsonFile<T> {
  private cache: T | null = null

  constructor(
    private filePath: string,
    private fallback: T
  ) {}

  read(): T {
    if (this.cache !== null) return this.cache
    this.cache = readJsonFile<T>(this.filePath, this.fallback)
    return this.cache
  }

  write(value: T): void {
    this.cache = value
    writeJsonFile(this.filePath, value)
  }

  clearCache(): void {
    this.cache = null
  }

  update(patch: Partial<T>): T {
    const next = { ...this.read(), ...patch }
    this.write(next)
    return next
  }
}

/** JSON 数组集合（按 id 索引，内存缓存 + 原子落盘） */
export class JsonCollection<T extends { id: string }> {
  private cache: T[] | null = null

  constructor(private filePath: string) {}

  read(): T[] {
    if (this.cache !== null) return this.cache
    const raw = readJsonFile<unknown>(this.filePath, [])
    this.cache = Array.isArray(raw) ? (raw as T[]) : []
    return this.cache
  }

  writeAll(items: T[]): void {
    this.cache = items
    writeJsonFile(this.filePath, items)
  }

  push(item: T): void {
    this.writeAll([...this.read(), item])
  }

  clearCache(): void {
    this.cache = null
  }

  get(id: string): T | undefined {
    return this.read().find((x) => x.id === id)
  }

  update(id: string, patch: Partial<T>): T | null {
    const items = this.read()
    const idx = items.findIndex((x) => x.id === id)
    if (idx < 0) return null
    items[idx] = { ...items[idx], ...patch }
    this.writeAll(items)
    return items[idx]
  }

  remove(id: string): boolean {
    const items = this.read()
    const next = items.filter((x) => x.id !== id)
    if (next.length === items.length) return false
    this.writeAll(next)
    return true
  }
}

/** 递归统计目录字节数（失败返回 0） */
export function dirSize(dir: string): number {
  try {
    let total = 0
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name)
      if (entry.isDirectory()) total += dirSize(p)
      else if (entry.isFile()) {
        try {
          total += statSync(p).size
        } catch {
          /* 忽略单个文件统计失败 */
        }
      }
    }
    return total
  } catch {
    return 0
  }
}

/** 递归拷贝目录（Node ≥16.7；失败静默返回，由调用方决定提示） */
export function copyDirRecursive(src: string, dest: string): void {
  try {
    cpSync(src, dest, { recursive: true, force: true })
  } catch {
    /* 忽略：备份时拷贝 blob 失败只影响备份完整性提示 */
  }
}

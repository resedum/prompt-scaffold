/**
 * QA 独立复现验证（不依赖工程师的 qa-store.test.ts）。
 * 针对问题1「写入 API key 闪退」，从全新视角验证 writeNow() 的降级链：
 *   1) renameSync 抛 EPERM → 降级直接写（并证明降级路径真实生效，而非 rename 正常成功）
 *   2) rename + writeFileSync 双双失败 → 不抛异常 + 保留内存缓存（恢复后能写出）
 *   3) 走 scheduleWrite 的 300ms 定时器回调路径（真正的闪退向量）→ 同样不抛异常
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Storage } from '../src/main/storage/store'

/** 取得可变的 CJS fs 模块对象（绕过 ESM 只读命名空间），用于注入 renameSync/writeFileSync 故障 */
const rawFs = eval('require("fs")') as typeof import('fs')

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ps-qa-indep-'))
}

function eperm(): Error & { code: string } {
  const e = new Error('EPERM: operation not permitted, rename') as Error & { code: string }
  e.code = 'EPERM'
  return e
}

test('独立复现①：renameSync 抛 EPERM 时 writeNow 走降级直接写，且不向上抛异常', () => {
  const dir = tmpDir()
  const origRename = rawFs.renameSync
  const origWrite = rawFs.writeFileSync
  // 记录 writeFileSync 被调用的路径，用于证明「降级直接写」确实发生：
  // 只有当 rename 真正失败时，才会出现对目标文件（preferences.json）的直接写调用。
  const written: string[] = []
  try {
    rawFs.writeFileSync = ((p: unknown, ...rest: unknown[]) => {
      written.push(String(p))
      return (origWrite as (...a: unknown[]) => void)(p as never, ...rest)
    }) as typeof rawFs.writeFileSync
    rawFs.renameSync = (() => {
      throw eperm()
    }) as typeof rawFs.renameSync

    Storage.init(dir)
    const s = Storage.getInstance()
    const p = s.load()
    p.dimensionHabits = [
      {
        name: '篇幅',
        wording: '800字',
        source: 'ai-adopted',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]

    s.save(p)
    // flush 同步调用 writeNow，必须不抛异常（否则主进程 uncaughtException → 闪退）
    assert.doesNotThrow(() => s.flush())

    // 关键断言：确实先写 tmp、再因 rename 失败而降级直写目标文件
    assert.ok(written.some((x) => x.endsWith('preferences.json.tmp')), '应写临时文件')
    assert.ok(written.some((x) => x.endsWith('preferences.json')), 'rename 失败后应降级直接写目标文件')

    // 落盘结果正确、无 tmp 残留
    assert.ok(existsSync(join(dir, 'preferences.json')), '降级后文件应存在')
    assert.ok(!existsSync(join(dir, 'preferences.json.tmp')), '临时文件应被清理')
    const onDisk = JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf-8'))
    assert.equal(onDisk.dimensionHabits[0].name, '篇幅')
  } finally {
    rawFs.renameSync = origRename
    rawFs.writeFileSync = origWrite
    rmSync(dir, { recursive: true, force: true })
  }
})

test('独立复现②：rename + writeFileSync 双双失败 → 不抛异常 + 保留内存缓存（恢复后可写出）', () => {
  const dir = tmpDir()
  const origRename = rawFs.renameSync
  const origWrite = rawFs.writeFileSync
  try {
    rawFs.renameSync = (() => {
      throw eperm()
    }) as typeof rawFs.renameSync
    rawFs.writeFileSync = (() => {
      throw new Error('EIO: disk unavailable')
    }) as typeof rawFs.writeFileSync

    Storage.init(dir)
    const s = Storage.getInstance()
    const p = s.load()
    p.dimensionHabits = [
      {
        name: '语气',
        wording: '正式',
        source: 'ai-adopted',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ]
    s.save(p)
    // 双重失败时仍不得抛异常（数据仍在 this.cache）
    assert.doesNotThrow(() => s.flush())
    assert.ok(!existsSync(join(dir, 'preferences.json')), '磁盘不可用时文件不应存在')
  } finally {
    // 恢复 fs 后再次 flush：证明缓存未被丢弃，能重新写出
    rawFs.renameSync = origRename
    rawFs.writeFileSync = origWrite
  }

  try {
    const s = Storage.getInstance()
    assert.doesNotThrow(() => s.flush())
    const onDisk = JSON.parse(readFileSync(join(dir, 'preferences.json'), 'utf-8'))
    assert.equal(onDisk.dimensionHabits[0].name, '语气', '恢复后应写出此前保留在内存缓存里的数据')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('独立复现③：走 300ms 定时器回调路径（真正的闪退向量）同样不抛异常', async () => {
  const dir = tmpDir()
  const origRename = rawFs.renameSync
  try {
    rawFs.renameSync = (() => {
      throw eperm()
    }) as typeof rawFs.renameSync

    Storage.init(dir)
    const s = Storage.getInstance()
    const p = s.load()
    p.language = 'en'
    s.save(p) // 只 save 不 flush，触发 scheduleWrite 的 300ms setTimeout 回调

    // 若 writeNow 在定时器回调里抛异常，node:test 会捕获 uncaughtException 使本测试失败。
    // 等待超过 300ms 防抖窗口，让回调真实执行。
    await new Promise((r) => setTimeout(r, 500))
    assert.ok(existsSync(join(dir, 'preferences.json')), '定时器回调里 rename 失败应降级直写成功')
  } finally {
    rawFs.renameSync = origRename
    rmSync(dir, { recursive: true, force: true })
  }
})

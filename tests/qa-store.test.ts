/**
 * QA 独立补充测试：JSON 原子写存储。
 * 覆盖硬约束 #1（零 native 编译 + JSON 原子写）的存储层落点。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Storage, DEFAULT_PREFERENCES } from '../src/main/storage/store'

/**
 * 取得原始 fs 模块（绕过 tsx/esbuild 对 `import * as fs` 的只读 ESM 包装），
 * 用于在单测里模拟 Windows 下目标文件被占用导致的 renameSync 失败。
 */
const rawFs = eval('require("fs")') as typeof import('fs')

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ps-qa-'))
}

test('QA·原子写：save + flush 后文件存在，且无 .tmp 残留', () => {
  const dir = tmpDir()
  try {
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
    s.flush()
    assert.ok(existsSync(join(dir, 'preferences.json')), 'preferences.json 应已写入')
    assert.ok(!existsSync(join(dir, 'preferences.json.tmp')), '临时文件应已被 rename 替换')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('QA·load 往返：保存后可读回', () => {
  const dir = tmpDir()
  try {
    Storage.init(dir)
    const s = Storage.getInstance()
    const p = s.load()
    p.language = 'en'
    s.save(p)
    s.flush()
    Storage.init(dir) // 重建实例，强制从磁盘读取
    assert.equal(Storage.getInstance().load().language, 'en')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('QA·损坏 JSON 回退默认值（不抛异常）', () => {
  const dir = tmpDir()
  try {
    writeFileSync(join(dir, 'preferences.json'), '{ 不是合法 JSON', 'utf-8')
    Storage.init(dir)
    const loaded = Storage.getInstance().load()
    assert.equal(loaded.language, DEFAULT_PREFERENCES.language)
    assert.deepEqual(loaded.dimensionHabits, [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('QA·文件缺失回退默认值', () => {
  const dir = tmpDir()
  try {
    Storage.init(dir)
    const loaded = Storage.getInstance().load()
    assert.equal(loaded.model.model, DEFAULT_PREFERENCES.model.model)
    assert.equal(loaded.ui.theme, 'light')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('QA·加载时对 dimensionHabits 去重并清洗空白', () => {
  const dir = tmpDir()
  try {
    writeFileSync(
      join(dir, 'preferences.json'),
      JSON.stringify({
        dimensionHabits: [
          { name: '篇幅', wording: '800字' },
          { name: '篇幅', wording: '重复' },
          { name: '', wording: 'x' }
        ]
      }),
      'utf-8'
    )
    Storage.init(dir)
    const loaded = Storage.getInstance().load()
    assert.equal(loaded.dimensionHabits.length, 1)
    assert.equal(loaded.dimensionHabits[0].name, '篇幅')
    assert.equal(loaded.dimensionHabits[0].wording, '800字')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('QA·崩溃修复：renameSync 失败时降级直接写，不抛异常', () => {
  const dir = tmpDir()
  const patched = rawFs as unknown as { renameSync: typeof rawFs.renameSync }
  const origRename = patched.renameSync
  try {
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
    // 模拟 Windows 下目标文件被占用导致 renameSync 抛 EPERM
    patched.renameSync = (() => {
      const e = new Error('EPERM: operation not permitted, rename') as Error & { code: string }
      e.code = 'EPERM'
      throw e
    }) as typeof rawFs.renameSync
    s.save(p)
    // writeNow 全程 try-catch，绝不向定时器回调抛异常（否则主进程 uncaughtException → 闪退）
    assert.doesNotThrow(() => s.flush())
    // 降级为直接覆盖写应成功
    assert.ok(existsSync(join(dir, 'preferences.json')), '降级后应直接写入成功')
    assert.ok(!existsSync(join(dir, 'preferences.json.tmp')), '临时文件应被清理')
  } finally {
    patched.renameSync = origRename
    rmSync(dir, { recursive: true, force: true })
  }
})

/**
 * 记忆工具个人版核心纯逻辑单测：
 * - memory-io 全量包（notes/folders/materials…）序列化/解析/合并
 * - platform 穷尽分发
 * - privacy-guard 发送范围裁剪 / 去敏
 * - version-manager 版本快照 + 清理建议/应用
 * - memory-store 派生周期 + CRUD
 * - code-sandbox 本地 node:vm 沙箱（真实执行 + 禁 require）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  serializeMemoryBundle,
  parseMemoryBundle,
  mergeMemoryBundle,
  normalizeNote
} from '../src/shared/memory-io'
import { PLATFORM, onPlatform, type PlatformName } from '../src/shared/platform'
import { applySendScope, maskNote, buildSendText, PrivacyGuard } from '../src/main/memory/privacy-guard'
import { VersionManager } from '../src/main/memory/version-manager'
import { MemoryStore, periodKeysOf, currentPeriodKey, deriveTitle } from '../src/main/memory/memory-store'
import { CodeSandbox } from '../src/main/memory/code-sandbox'
import type { Note } from '../src/shared/memory-types'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ps-mem-'))
}

function makeNote(id: string, content: string, extra: Partial<Note> = {}): Note {
  return {
    id,
    title: 't-' + id,
    content,
    format: 'markdown',
    kind: 'note',
    tags: [],
    dimensionFields: [],
    aiSource: 'manual',
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra
  }
}

// ---------- memory-io 全量包 ----------
test('memory-io 全量包：序列化后可解析回等量数据', () => {
  const json = serializeMemoryBundle({
    version: 1,
    exportedAt: '2026-01-01T00:00:00.000Z',
    notes: [makeNote('n1', 'hello')],
    cycleFolders: [],
    materials: [],
    summaries: [],
    reminders: []
  })
  const { bundle, invalidCount } = parseMemoryBundle(json)
  assert.equal(bundle.notes.length, 1)
  assert.equal(bundle.notes[0].content, 'hello')
  assert.equal(invalidCount, 0)
})

test('memory-io 全量包：非法 note 跳过并计数', () => {
  const r = parseMemoryBundle(
    JSON.stringify({ notes: [{ id: 'x', content: '' }, { id: 'y', content: 'ok' }] })
  )
  assert.equal(r.bundle.notes.length, 1)
  assert.equal(r.invalidCount, 1)
})

test('memory-io 合并：overwrite 整体替换；merge 按 id 去重（导入方优先）', () => {
  const cur = {
    version: 1, exportedAt: '', notes: [makeNote('a', 'A'), makeNote('b', 'B')],
    cycleFolders: [], materials: [], summaries: [], reminders: []
  }
  const inc = {
    version: 1, exportedAt: '', notes: [makeNote('b', 'B2'), makeNote('c', 'C')],
    cycleFolders: [], materials: [], summaries: [], reminders: []
  }
  const merged = mergeMemoryBundle(cur, inc, 'merge')
  assert.equal(merged.notes.length, 3)
  assert.equal(merged.notes.find((n) => n.id === 'b')?.content, 'B2')
  const over = mergeMemoryBundle(cur, inc, 'overwrite')
  assert.equal(over.notes.length, 2)
})

test('memory-io：normalizeNote 填充默认值并校验 content', () => {
  const n = normalizeNote({ content: '正文', format: 'markdown', kind: 'snippet' })
  assert.ok(n)
  assert.equal(n!.format, 'markdown')
  assert.equal(n!.kind, 'snippet')
  assert.equal(n!.archived, false)
  assert.equal(normalizeNote({ content: '   ' }), null)
})

// ---------- platform ----------
test('platform：PLATFORM 收敛为三平台之一且 onPlatform 穷尽分发', () => {
  const valid: PlatformName[] = ['win32', 'darwin', 'linux']
  assert.ok(valid.includes(PLATFORM))
  const got = onPlatform<number>({ win32: () => 1, darwin: () => 2, linux: () => 3 })
  const expect = PLATFORM === 'win32' ? 1 : PLATFORM === 'darwin' ? 2 : 3
  assert.equal(got, expect)
})

// ---------- privacy-guard ----------
test('privacy：all 全文发送；selected 未勾选条目去敏', () => {
  const notes = [makeNote('1', 'secret-a'), makeNote('2', 'secret-b')]
  const all = applySendScope(notes, 'all', new Set())
  assert.equal(all.full.length, 2)
  assert.equal(all.masked.length, 0)

  const sel = applySendScope(notes, 'selected', new Set(['1']))
  assert.equal(sel.full.length, 1)
  assert.equal(sel.masked.length, 1)
  assert.equal(sel.masked[0].content, '')
})

test('privacy：maskNote 只保留标题，清空正文与维度字段', () => {
  const masked = maskNote(makeNote('1', 'secret', { dimensionFields: [{ name: '篇幅', value: '800字' }] }))
  assert.equal(masked.content, '')
  assert.equal(masked.dimensionFields.length, 0)
  assert.equal(masked.title, 't-1')
})

test('privacy：buildSendText 对去敏条目只发标题占位', () => {
  const text = buildSendText({ full: [makeNote('1', 'body')], masked: [makeNote('2', 'secret')] })
  assert.ok(text.includes('body'))
  assert.ok(!text.includes('secret'))
})

test('privacy：PrivacyGuard.check 在 off 时抛 PRIVACY_DENIED', () => {
  const g = new PrivacyGuard(() => ({
    masterAiKill: false,
    capabilities: { enhance: 'off', summarize: 'external', remind: 'off', codeExec: 'off' },
    sendScope: 'selected'
  }))
  assert.throws(() => g.check('enhance'), (e) => (e as { code?: string }).code === 'PRIVACY_DENIED')
  assert.doesNotThrow(() => g.check('summarize'))
})

// ---------- version-manager ----------
test('version：snapshot + 清理建议（超出 keepVersions + 孤儿 blob）', () => {
  const dir = tmpDir()
  const blobsDir = join(dir, 'files', 'blobs')
  try {
    const vm = new VersionManager(dir)
    const note = makeNote('n1', 'v1')
    vm.snapshotNote(note, 'v1')
    vm.snapshotNote({ ...note, content: 'v2' }, 'v2')
    vm.snapshotNote({ ...note, content: 'v3' }, 'v3')

    // 制造孤儿 blob
    mkdirSync(blobsDir, { recursive: true })
    writeFileSync(join(blobsDir, 'orphan-abc'), 'data')

    const items = vm.suggestCleanup({
      keepVersions: 2,
      referencedBlobs: new Set(),
      blobsDir,
      backups: [],
      backupRotation: 5
    })
    const versionItems = items.filter((i) => i.kind === 'version')
    const blobItems = items.filter((i) => i.kind === 'orphan-blob')
    assert.equal(versionItems.length, 1) // 3 版保留 2，清 1
    assert.equal(blobItems.length, 1)
    assert.equal(blobItems[0].targetId, 'orphan-abc')

    const result = vm.applyCleanup(items, {
      keepVersions: 2,
      referencedBlobs: new Set(),
      blobsDir,
      backups: [],
      backupRotation: 5
    })
    assert.ok(result.removed >= 2)
    assert.ok(!existsSync(join(blobsDir, 'orphan-abc')))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- memory-store ----------
test('memory-store：派生周期键 + CRUD + 软删除', () => {
  const dir = tmpDir()
  try {
    const store = new MemoryStore(dir)
    const keys = periodKeysOf('2026-11-08T12:00:00.000Z')
    assert.equal(keys.day, '2026-11-08')
    assert.equal(keys.month, '2026-11')
    assert.ok(/^2026-W/.test(keys.week))

    const n = store.createNote({
      title: '', content: '# 标题\n正文', format: 'markdown', kind: 'note',
      tags: ['a'], dimensionFields: [], aiSource: 'manual', pinned: false
    })
    assert.equal(n.title, '标题')
    assert.equal(store.listNotes().length, 1)

    store.archiveNote(n.id)
    assert.equal(store.listNotes().length, 0)
    assert.equal(store.listArchivedNotes().length, 1)
    store.restoreNote(n.id)
    assert.equal(store.listNotes().length, 1)

    const folder = store.createFolder({ name: 'W', scope: 'week', startDate: '2026-11-02', endDate: '2026-11-08' })
    store.assignNoteToFolder(n.id, folder.id)
    assert.equal(store.getFolder(folder.id)?.noteIds.includes(n.id), true)

    assert.equal(currentPeriodKey('day', new Date('2026-11-08T12:00:00Z')).length > 0, true)
    assert.ok(deriveTitle('').length > 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ---------- code-sandbox ----------
test('sandbox：本地 node:vm 执行纯 JS 成功并输出结果', async () => {
  const dir = tmpDir()
  try {
    const sandbox = new CodeSandbox(dir)
    const task = await sandbox.run({ language: 'javascript', codeSnippet: 'const a = 1 + 2; console.log("sum=" + a); a;' })
    assert.equal(task.status, 'success')
    assert.ok(task.stdout.includes('sum=3'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('sandbox：禁 require（代码不出机，无 fs/net/process）', async () => {
  const dir = tmpDir()
  try {
    const sandbox = new CodeSandbox(dir)
    const task = await sandbox.run({ language: 'javascript', codeSnippet: 'const fs = require("fs"); fs.readFileSync("/etc/passwd");' })
    assert.notEqual(task.status, 'success')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

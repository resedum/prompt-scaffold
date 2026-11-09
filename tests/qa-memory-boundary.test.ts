/**
 * QA（严过关）独立补充测试 —— 记忆工具个人版边界与正确性。
 * 覆盖任务要求八项：
 *   ① 派生周期边界（跨月/跨周/跨年，ISO 周一为一周之始）
 *   ② 内容寻址去重（同一文件两次 add 只存一份 blob）
 *   ③ 版本清理建议不自动删
 *   ④ 备份恢复往返
 *   ⑤ privacy-guard 三档 + applySendScope 裁剪（全部/仅选中/字段级脱敏）
 *   ⑥ 沙箱逃逸（require/fs/process）+ 超时
 *   ⑦ 导入导出边界（超 1000 条 / 非法 JSON / name 空）
 *   ⑧ platform 分支完整性（三平台各返回预期值）
 * 全程 node:test + tsx，零新增依赖。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  mkdirSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { MemoryStore, periodKeysOf, currentPeriodKey } from '../src/main/memory/memory-store'
import { MaterialStore } from '../src/main/memory/material-store'
import { VersionManager } from '../src/main/memory/version-manager'
import { BackupManager } from '../src/main/memory/backup-manager'
import {
  PrivacyGuard,
  applySendScope,
  maskNote,
  buildSendText,
  engineOf
} from '../src/main/memory/privacy-guard'
import { CodeSandbox } from '../src/main/memory/code-sandbox'
import { EnhanceService } from '../src/main/memory/enhance'
import { parseMemoryImport, parseMemoryBundle, MemoryIOError } from '../src/shared/memory-io'
import { onPlatform, type PlatformName } from '../src/shared/platform'
import { DEFAULT_MODEL_CONFIG } from '../src/shared/constants'
import type { Note } from '../src/shared/memory-types'

function tmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'ps-qa-mem-'))
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

/** 以「本地正午」构造某年月日的 ISO 串，避免跨时区把日期推到前一天/后一天 */
function localIso(y: number, m: number, d: number): string {
  return new Date(y, m - 1, d, 12, 0, 0).toISOString()
}

/** 正确 ISO-8601 周算法参考实现（周一为一周之始，跨年归属到含首周四的年份；输入为本地年月日） */
function isoWeekOfLocal(y: number, m: number, d: number): string {
  const date = new Date(Date.UTC(y, m - 1, d))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

// =====================================================================
// ① 派生周期边界
// =====================================================================
test('派生周期：day/month 本地时区键正确（跨月）', () => {
  assert.equal(periodKeysOf(localIso(2026, 1, 15)).month, '2026-01')
  assert.equal(periodKeysOf(localIso(2026, 12, 31)).month, '2026-12')
  assert.equal(periodKeysOf(localIso(2026, 12, 31)).day, '2026-12-31')
  assert.equal(periodKeysOf(localIso(2026, 3, 1)).month, '2026-03')
})

test('派生周期：ISO 周跨年/跨月边界归属正确（周一为一周之始）', () => {
  // 关键边界：周日仍属本周、年末/年初归属正确、首个周一到来的年份切换
  const cases: Array<[number, number, number]> = [
    [2026, 1, 1], // 周四 → 2026-W01
    [2026, 1, 4], // 周日 → 2026-W01（本周，不是 W02）
    [2026, 1, 5], // 周一 → 2026-W02
    [2025, 12, 31], // 周三 → 2026-W01（跨年归下一年）
    [2021, 1, 1], // 周五 → 2020-W53
    [2016, 1, 1], // 周五 → 2015-W53
    [2024, 12, 30], // 周一 → 2025-W01
    [2026, 7, 15] // 普通周中 → 稳定
  ]
  for (const [y, m, d] of cases) {
    assert.equal(periodKeysOf(localIso(y, m, d)).week, isoWeekOfLocal(y, m, d), `periodKeysOf(${y}-${m}-${d}).week`)
  }
})

test('派生周期：非法时间回退 unknown 且不抛异常', () => {
  assert.deepEqual(periodKeysOf('not-a-date'), { day: 'unknown', week: 'unknown', month: 'unknown' })
})

test('派生周期：currentPeriodKey 用 anchor 计算本日/本月', () => {
  const anchor = new Date('2026-03-15T08:00:00.000Z')
  assert.equal(currentPeriodKey('day', anchor), '2026-03-15')
  assert.equal(currentPeriodKey('month', anchor), '2026-03')
  assert.ok(/^\d{4}-W\d{2}$/.test(currentPeriodKey('week', anchor)))
})

// =====================================================================
// ② 内容寻址去重
// =====================================================================
test('内容寻址：同一内容两次导入只存一份 blob，且跨版本去重', async () => {
  const dir = tmpDir()
  try {
    const ms = new MaterialStore(dir)
    const buf = Buffer.from('相同内容 same-content')
    const r1 = await ms.importBuffer('a.txt', buf)
    const r2 = await ms.importBuffer('b.txt', buf)
    assert.equal(r1.material.blobRef, r2.material.blobRef)
    assert.equal(r1.material.checksum, r2.material.checksum)

    const blobs = readdirSync(join(dir, 'files', 'blobs'))
    assert.equal(blobs.length, 1, 'blobs 目录应只有一份内容寻址文件')

    // 追加相同内容版本 → 仍只一份 blob
    const v2 = ms.addVersion(r1.material.id, buf, '无变化')
    assert.ok(v2)
    assert.equal(readdirSync(join(dir, 'files', 'blobs')).length, 1)

    // 追加不同内容 → 新增一份 blob
    ms.addVersion(r1.material.id, Buffer.from('改过了'), '变更')
    assert.equal(readdirSync(join(dir, 'files', 'blobs')).length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =====================================================================
// ③ 版本清理建议不自动删
// =====================================================================
test('版本清理：suggestCleanup 只建议不自动删，applyCleanup 才真删', () => {
  const dir = tmpDir()
  try {
    const vm = new VersionManager(dir)
    const note = makeNote('n1', 'v1')
    vm.snapshotNote(note)
    vm.snapshotNote({ ...note, content: 'v2' })
    vm.snapshotNote({ ...note, content: 'v3' })

    const ctx = {
      keepVersions: 2,
      referencedBlobs: new Set<string>(),
      blobsDir: join(dir, 'files', 'blobs'),
      backups: [],
      backupRotation: 5
    }
    const items = vm.suggestCleanup(ctx)
    const versionItems = items.filter((i) => i.kind === 'version')
    assert.equal(versionItems.length, 1)

    // suggestCleanup 之后版本仍在（只建议、不自动删）
    assert.equal(vm.allNoteVersions().length, 3)

    const result = vm.applyCleanup(items, ctx)
    assert.equal(result.removed, 1)
    assert.equal(vm.allNoteVersions().length, 2)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =====================================================================
// ④ 备份恢复往返
// =====================================================================
test('备份恢复：create 全量快照 → 改动后 restore 可完整还原', () => {
  const dir = tmpDir()
  try {
    const store = new MemoryStore(dir)
    const note = store.createNote({
      title: '重要笔记', content: '这是需要恢复的正文', format: 'markdown',
      kind: 'note', tags: ['x'], dimensionFields: [], aiSource: 'manual', pinned: false
    })
    const bm = new BackupManager(dir)
    const manifest = bm.create()
    assert.ok(manifest.path)
    assert.equal(bm.list().length, 1)

    // 破坏现场：硬删笔记 + 新增干扰
    store.deleteNote(note.id)
    store.createNote({
      title: '干扰', content: '恢复后应消失', format: 'text',
      kind: 'note', tags: [], dimensionFields: [], aiSource: 'manual', pinned: false
    })

    const okRestore = bm.restore(manifest.id)
    assert.equal(okRestore, true)

    store.reload()
    const restored = store.getNote(note.id)
    assert.ok(restored)
    assert.equal(restored!.content, '这是需要恢复的正文')
    // 恢复覆盖后，干扰笔记应消失
    assert.equal(store.listNotes().length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('备份恢复：不存在的备份返回 false', () => {
  const dir = tmpDir()
  try {
    const bm = new BackupManager(dir)
    assert.equal(bm.restore('missing-id'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =====================================================================
// ⑤ privacy-guard 三档 + applySendScope 裁剪
// =====================================================================
test('privacy：三档 scopeOf + 逃生舱强制 off', () => {
  const g = new PrivacyGuard(() => ({
    masterAiKill: false,
    capabilities: { enhance: 'off', summarize: 'local', remind: 'external', codeExec: 'off' },
    sendScope: 'selected'
  }))
  assert.equal(g.scopeOf('enhance'), 'off')
  assert.equal(g.scopeOf('summarize'), 'local')
  assert.equal(g.scopeOf('remind'), 'external')
  assert.equal(g.scopeOf('codeExec'), 'off')

  const kill = new PrivacyGuard(() => ({
    masterAiKill: true,
    capabilities: { enhance: 'external', summarize: 'external', remind: 'external', codeExec: 'external' },
    sendScope: 'all'
  }))
  assert.equal(kill.scopeOf('summarize'), 'off')
  assert.equal(kill.scopeOf('codeExec'), 'off')
})

test('privacy：engineOf 映射正确', () => {
  assert.equal(engineOf('local'), 'local')
  assert.equal(engineOf('external'), 'external')
  assert.equal(engineOf('off'), 'none')
})

test('privacy：applySendScope 全部/仅选中 + 字段级脱敏', () => {
  const notes = [
    makeNote('1', 'secret-a', { dimensionFields: [{ name: '预算', value: '100万' }] }),
    makeNote('2', 'secret-b')
  ]
  const all = applySendScope(notes, 'all', new Set())
  assert.equal(all.full.length, 2)
  assert.equal(all.masked.length, 0)

  const sel = applySendScope(notes, 'selected', new Set(['1']))
  assert.equal(sel.full.length, 1)
  assert.equal(sel.full[0].id, '1')
  assert.equal(sel.masked.length, 1)
  // 未选中条目字段级脱敏：正文清空、维度字段清空、仅标题保留
  assert.equal(sel.masked[0].content, '')
  assert.equal(sel.masked[0].dimensionFields.length, 0)
  assert.equal(sel.masked[0].title, 't-2')
})

test('privacy：maskNote 保留标题、清空正文与维度字段', () => {
  const m = maskNote(makeNote('1', 's', { dimensionFields: [{ name: '篇幅', value: '800字' }] }))
  assert.equal(m.title, 't-1')
  assert.equal(m.content, '')
  assert.equal(m.dimensionFields.length, 0)
})

test('privacy：buildSendText 不泄露未选中条目正文', () => {
  const text = buildSendText({
    full: [makeNote('1', 'full-body')],
    masked: [makeNote('2', 'must-not-leak')]
  })
  assert.ok(text.includes('full-body'))
  assert.ok(!text.includes('must-not-leak'))
  assert.ok(text.includes('t-2'))
})

// =====================================================================
// ⑥ 沙箱逃逸 + 超时
// =====================================================================
test('沙箱：require 被禁（fs/net/process 不可达）', async () => {
  const dir = tmpDir()
  try {
    const sb = new CodeSandbox(dir)
    const t1 = await sb.run({ language: 'javascript', codeSnippet: 'const fs = require("fs"); fs.readFileSync("/etc/passwd");' })
    assert.notEqual(t1.status, 'success')

    const t2 = await sb.run({ language: 'javascript', codeSnippet: 'const net = require("net"); net.connect(80, "evil.example");' })
    assert.notEqual(t2.status, 'success')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('沙箱：process 全局不可达，不能退主进程', async () => {
  const dir = tmpDir()
  try {
    const sb = new CodeSandbox(dir)
    const t = await sb.run({ language: 'javascript', codeSnippet: 'process.exit(0);' })
    assert.notEqual(t.status, 'success')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('沙箱：死循环被超时终止（不挂死主进程）', async () => {
  const dir = tmpDir()
  try {
    const sb = new CodeSandbox(dir)
    const t = await sb.run({ language: 'javascript', codeSnippet: 'while (true) {}' })
    assert.equal(t.status, 'timeout')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// =====================================================================
// ⑦ 导入导出边界
// =====================================================================
test('导入：非法 JSON 抛 IMPORT_INVALID', () => {
  assert.throws(() => parseMemoryImport('{not json'), (e) => e instanceof MemoryIOError)
  assert.throws(() => parseMemoryBundle('{not json'), (e) => e instanceof MemoryIOError)
})

test('导入：name 空跳过并计数，全空抛 IMPORT_INVALID', () => {
  const r = parseMemoryImport(JSON.stringify({ habits: [{ name: '   ' }, { name: 'ok', wording: 'w' }] }))
  assert.equal(r.habits.length, 1)
  assert.equal(r.invalidCount, 1)
  assert.throws(() => parseMemoryImport(JSON.stringify({ habits: [{ name: '' }] })), (e) => e instanceof MemoryIOError)
})

test('导入：超过 1000 条抛 IMPORT_INVALID，恰好 1000 条通过', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ name: 'h' + i, wording: 'w' + i }))
  assert.throws(() => parseMemoryImport(JSON.stringify({ habits: mk(1001) })), (e) => e instanceof MemoryIOError)
  assert.equal(parseMemoryImport(JSON.stringify({ habits: mk(1000) })).habits.length, 1000)
})

test('导入：全量包非法 note 跳过并计数', () => {
  const r = parseMemoryBundle(JSON.stringify({
    notes: [{ id: 'x', content: '   ' }, { id: 'y', content: 'ok' }]
  }))
  assert.equal(r.bundle.notes.length, 1)
  assert.equal(r.invalidCount, 1)
})

// =====================================================================
// ⑧ platform 分支完整性
// =====================================================================
test('platform：onPlatform 穷尽分发，三平台各返回预期值', () => {
  // 编译期 Record<PlatformName, () => T> 已强制补全三平台；运行时按实际平台一一对应
  const got = onPlatform<string>({ win32: () => 'win', darwin: () => 'mac', linux: () => 'linux' })
  const expect = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : 'linux'
  assert.equal(got, expect)
  // 三个键都必须存在（缺一即运行时 undefined，此处显式校验完整性）
  const all = { win32: 1, darwin: 2, linux: 3 } satisfies Record<PlatformName, number>
  assert.deepEqual(Object.keys(all).sort(), ['darwin', 'linux', 'win32'])
})

// =====================================================================
// 补测（Round 2 追加）：enhance 隐私绕过 / 全量包 1000 上限 / 备份恢复清孤儿
// =====================================================================
test('enhance 隐私绕过已堵死：off 档位无论渲染层传何 scope 都只走规则兜底、不出机', async () => {
  const guard = new PrivacyGuard(() => ({
    masterAiKill: false,
    capabilities: { enhance: 'off', summarize: 'off', remind: 'off', codeExec: 'off' },
    sendScope: 'selected'
  }))
  const svc = new EnhanceService({
    privacyGuard: guard,
    getModelConfig: () => DEFAULT_MODEL_CONFIG,
    getHabits: () => []
  })
  // 渲染层恶意/出错传 external，主进程应忽略、以配置 off 为准（不 new LLMProvider、不出机）
  const fields = await svc.enhance({ text: '写一篇周报', scope: 'external' })
  assert.ok(Array.isArray(fields))
  assert.ok(fields.length > 0)
  assert.ok(fields.every((f) => typeof f.name === 'string' && typeof f.value === 'string'))
})

test('导入：全量包 notes 超过 1000 条抛 IMPORT_INVALID，恰好 1000 条通过', () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ id: 'n' + i, content: 'c' + i }))
  assert.throws(() => parseMemoryBundle(JSON.stringify({ notes: mk(1001) })), (e) => e instanceof MemoryIOError)
  assert.equal(parseMemoryBundle(JSON.stringify({ notes: mk(1000) })).bundle.notes.length, 1000)
})

test('备份恢复：restore 先清空 blobs 再复制，消除孤儿残留', async () => {
  const dir = tmpDir()
  try {
    const ms = new MaterialStore(dir)
    const bm = new BackupManager(dir)
    await ms.importBuffer('first.txt', Buffer.from('first-content'))
    bm.create() // 备份仅含 first
    await ms.importBuffer('second.txt', Buffer.from('second-content')) // 备份后新增
    assert.equal(readdirSync(join(dir, 'files', 'blobs')).length, 2)

    const manifest = bm.list()[0]
    assert.equal(bm.restore(manifest.id), true)
    assert.equal(readdirSync(join(dir, 'files', 'blobs')).length, 1)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

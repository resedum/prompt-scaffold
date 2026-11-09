/**
 * 记忆库导入/导出纯函数单测（ARCHITECTURE v2 §2.4 / T04）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseMemoryImport,
  serializeMemoryExport,
  mergeHabits,
  MemoryIOError
} from '../src/shared/memory-io'
import { dedupeHabits } from '../src/shared/memory'
import type { MemoryHabit } from '../src/shared/types'

const NOW = '2026-01-01T00:00:00.000Z'

function habit(name: string, wording: string, source: MemoryHabit['source'] = 'imported'): MemoryHabit {
  return { name, wording, source, createdAt: NOW, updatedAt: NOW }
}

function codeOf(e: unknown): string | undefined {
  return (e as { code?: string }).code
}

test('解析：兼容 {habits} 结构', () => {
  const r = parseMemoryImport(
    JSON.stringify({ version: 1, exportedAt: NOW, habits: [{ name: '篇幅', wording: '800字' }] })
  )
  assert.equal(r.habits.length, 1)
  assert.equal(r.habits[0].name, '篇幅')
  assert.equal(r.habits[0].source, 'imported')
  assert.equal(r.invalidCount, 0)
})

test('解析：兼容旧 {dimensionHabits} 结构', () => {
  const r = parseMemoryImport(JSON.stringify({ dimensionHabits: [{ name: '语气', wording: '正式' }] }))
  assert.equal(r.habits.length, 1)
  assert.equal(r.habits[0].name, '语气')
})

test('解析：兼容裸数组', () => {
  const r = parseMemoryImport(JSON.stringify([{ name: '篇幅', wording: '800字' }]))
  assert.equal(r.habits.length, 1)
})

test('解析：非法 JSON 抛 IMPORT_INVALID', () => {
  assert.throws(() => parseMemoryImport('{ 不是 JSON'), (e) => codeOf(e) === 'IMPORT_INVALID')
})

test('解析：name 空跳过并计数', () => {
  const r = parseMemoryImport(
    JSON.stringify([{ name: '', wording: 'x' }, { name: '  ', wording: 'y' }, { name: '语气', wording: '正式' }])
  )
  assert.equal(r.habits.length, 1)
  assert.equal(r.invalidCount, 2)
})

test('解析：全部非法抛 IMPORT_INVALID', () => {
  assert.throws(() => parseMemoryImport(JSON.stringify([{ name: '', wording: 'x' }])), (e) => codeOf(e) === 'IMPORT_INVALID')
})

test('解析：超过 1000 条抛 IMPORT_INVALID', () => {
  const items = Array.from({ length: 1001 }, (_, i) => ({ name: `维度${i}`, wording: 'w' }))
  assert.throws(() => parseMemoryImport(JSON.stringify(items)), (e) => codeOf(e) === 'IMPORT_INVALID')
})

test('导出往返：serialize 后可 parse 回等量条目', () => {
  const json = serializeMemoryExport([habit('篇幅', '800字', 'ai-adopted')])
  const parsed = JSON.parse(json)
  assert.equal(parsed.version, 1)
  assert.equal(typeof parsed.exportedAt, 'string')
  const r = parseMemoryImport(json)
  assert.equal(r.habits.length, 1)
  assert.equal(r.habits[0].name, '篇幅')
})

test('merge：同名覆盖，不同名追加', () => {
  const current = [habit('篇幅', '800字', 'ai-adopted'), habit('语气', '正式', 'ai-adopted')]
  const incoming = [habit('篇幅', '一页以内'), habit('结构', '结论先行')]
  const r = mergeHabits(current, incoming, 'merge')
  assert.equal(r.added, 1)
  assert.equal(r.overwritten, 1)
  assert.equal(r.habits.length, 3)
  const cover = r.habits.find((h) => h.name === '篇幅')
  assert.equal(cover?.wording, '一页以内')
  assert.equal(cover?.source, 'imported')
})

test('merge：同策略保留未冲突现有记忆', () => {
  const current = [habit('语气', '正式', 'ai-adopted')]
  const incoming = [habit('结构', '结论先行')]
  const r = mergeHabits(current, incoming, 'merge')
  assert.equal(r.habits.length, 2)
  assert.ok(r.habits.some((h) => h.name === '语气' && h.source === 'ai-adopted'))
})

test('overwrite：清空现有，仅保留去重后的导入内容', () => {
  const current = [habit('篇幅', '800字', 'ai-adopted')]
  const incoming = [habit('结构', '结论先行'), habit('结构', '重复')]
  const r = mergeHabits(current, incoming, 'overwrite')
  assert.equal(r.habits.length, 1)
  assert.equal(r.habits[0].name, '结构')
  assert.equal(r.added, 1)
  assert.equal(r.overwritten, 0)
})

test('迁移归一化：旧 {name,wording} 升级为 ai-adopted + 时间戳', () => {
  const r = dedupeHabits([{ name: '篇幅', wording: '800字' }])
  assert.equal(r.length, 1)
  assert.equal(r[0].source, 'ai-adopted')
  assert.ok(!Number.isNaN(Date.parse(r[0].createdAt)))
  assert.ok(!Number.isNaN(Date.parse(r[0].updatedAt)))
})

/**
 * QA 边界补充测试：记忆库导入/导出纯函数边界（ARCHITECTURE v2 §2.4）。
 * 覆盖：条数上限边界、非法条目类型、source 归一化、wording 缺失、结构无法识别、导出去重、merge 边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMemoryImport, serializeMemoryExport, mergeHabits, MemoryIOError } from '../src/shared/memory-io'
import type { MemoryHabit } from '../src/shared/types'

const NOW = '2026-01-01T00:00:00.000Z'
const codeOf = (e: unknown): string | undefined => (e as { code?: string }).code

test('边界：恰好 1000 条合法可导入（不触发上限）', () => {
  const items = Array.from({ length: 1000 }, (_, i) => ({ name: `维度${i}`, wording: 'w' }))
  const r = parseMemoryImport(JSON.stringify(items))
  assert.equal(r.habits.length, 1000)
  assert.equal(r.invalidCount, 0)
})

test('边界：数组含 null/数字/字符串等非对象条目 → 计数跳过', () => {
  const r = parseMemoryImport(JSON.stringify([null, 42, 'str', { name: '有效', wording: 'x' }]))
  assert.equal(r.habits.length, 1)
  assert.equal(r.invalidCount, 3)
})

test('边界：wording 缺失默认空串，source 非法默认 imported', () => {
  const r = parseMemoryImport(JSON.stringify([{ name: '篇幅', source: 'bogus' }]))
  assert.equal(r.habits[0].wording, '')
  assert.equal(r.habits[0].source, 'imported')
})

test('边界：source=manual 被保留（合法来源白名单）', () => {
  const r = parseMemoryImport(JSON.stringify([{ name: '篇幅', source: 'manual' }]))
  assert.equal(r.habits[0].source, 'manual')
})

test('边界：{habits: 非数组} 抛 IMPORT_INVALID', () => {
  assert.throws(() => parseMemoryImport(JSON.stringify({ habits: 'oops' })), (e) => codeOf(e) === 'IMPORT_INVALID')
})

test('边界：空对象 {} 抛 IMPORT_INVALID', () => {
  assert.throws(() => parseMemoryImport(JSON.stringify({})), (e) => codeOf(e) === 'IMPORT_INVALID')
})

test('边界：createdAt/updatedAt 非法时间戳回退为当前时间', () => {
  const r = parseMemoryImport(JSON.stringify([{ name: '篇幅', createdAt: 'not-a-date', updatedAt: '' }]))
  assert.ok(!Number.isNaN(Date.parse(r.habits[0].createdAt)))
  assert.ok(!Number.isNaN(Date.parse(r.habits[0].updatedAt)))
})

test('导出：输入含重复 name 时输出被去重', () => {
  const dup: MemoryHabit[] = [
    { name: '篇幅', wording: '800字', source: 'ai-adopted', createdAt: NOW, updatedAt: NOW },
    { name: '篇幅', wording: '重复', source: 'ai-adopted', createdAt: NOW, updatedAt: NOW }
  ]
  const parsed = JSON.parse(serializeMemoryExport(dup))
  assert.equal(parsed.habits.length, 1)
  assert.equal(parsed.version, 1)
})

test('merge：incoming 含空 name 条目被去重函数过滤，不影响计数', () => {
  const current: MemoryHabit[] = []
  const incoming: MemoryHabit[] = [
    { name: '', wording: 'x', source: 'imported', createdAt: NOW, updatedAt: NOW },
    { name: '结构', wording: '结论先行', source: 'imported', createdAt: NOW, updatedAt: NOW }
  ]
  const r = mergeHabits(current, incoming, 'merge')
  assert.equal(r.habits.length, 1)
  assert.equal(r.added, 1)
})

test('merge：同名覆盖时 createdAt 采用导入条目自带值', () => {
  const current: MemoryHabit[] = [
    { name: '篇幅', wording: '旧', source: 'ai-adopted', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-01-01T00:00:00.000Z' }
  ]
  const incoming: MemoryHabit[] = [
    { name: '篇幅', wording: '新', source: 'imported', createdAt: '2026-06-06T00:00:00.000Z', updatedAt: '2026-06-06T00:00:00.000Z' }
  ]
  const r = mergeHabits(current, incoming, 'merge')
  assert.equal(r.overwritten, 1)
  assert.equal(r.habits[0].createdAt, '2026-06-06T00:00:00.000Z')
  assert.equal(r.habits[0].source, 'imported')
})

test('MemoryIOError：code 恒为 IMPORT_INVALID', () => {
  const e = new MemoryIOError('x')
  assert.equal(e.code, 'IMPORT_INVALID')
})

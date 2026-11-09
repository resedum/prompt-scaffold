import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adoptHabit, dedupeHabits, removeHabit, isAdopted } from '../src/shared/memory'
import type { MemoryHabit } from '../src/shared/types'

test('记忆写入原则：不采纳则不写入', () => {
  const habits = [{ name: '篇幅', wording: '800字' }]
  const next = adoptHabit(habits, { name: '语气', wording: '正式' }, false)
  assert.equal(next.length, 1)
  assert.equal(next[0].name, '篇幅')
})

test('记忆写入原则：AI 提议 + 用户采纳才写入', () => {
  const habits = [{ name: '篇幅', wording: '800字' }]
  const next = adoptHabit(habits, { name: '语气', wording: '正式' }, true)
  assert.equal(next.length, 2)
  assert.ok(next.some((h) => h.name === '语气' && h.wording === '正式'))
})

test('采纳同名维度：覆盖而非重复', () => {
  const habits = [{ name: '篇幅', wording: '800字' }]
  const next = adoptHabit(habits, { name: '篇幅', wording: '一页以内' }, true)
  assert.equal(next.length, 1)
  assert.equal(next[0].wording, '一页以内')
})

test('空提议不写入', () => {
  const habits: { name: string; wording: string }[] = []
  const next = adoptHabit(habits, { name: '', wording: '' }, true)
  assert.equal(next.length, 0)
})

test('dedupeHabits：按 name 去重并清洗空白', () => {
  const r = dedupeHabits([
    { name: ' 篇幅 ', wording: ' 800字 ' },
    { name: '篇幅', wording: '重复' },
    { name: '', wording: 'x' }
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].name, '篇幅')
  assert.equal(r[0].wording, '800字')
})

test('isAdopted：判断是否已采纳', () => {
  const habits = [{ name: '语气', wording: '正式' }]
  assert.equal(isAdopted(habits, '语气'), true)
  assert.equal(isAdopted(habits, '篇幅'), false)
})

test('removeHabit：反选移除已采纳习惯', () => {
  const habits = [
    { name: '语气', wording: '正式' },
    { name: '篇幅', wording: '800字' }
  ]
  const next = removeHabit(habits, '语气')
  assert.equal(next.length, 1)
  assert.equal(next[0].name, '篇幅')
})

test('dedupeHabits：旧 {name,wording} 自动迁移为 MemoryHabit（source=ai-adopted）', () => {
  const r = dedupeHabits([{ name: '篇幅', wording: '800字' }])
  assert.equal(r.length, 1)
  assert.equal(r[0].source, 'ai-adopted')
  assert.ok(!Number.isNaN(Date.parse(r[0].createdAt)))
  assert.ok(!Number.isNaN(Date.parse(r[0].updatedAt)))
})

test('adoptHabit：采纳后带 source 与时间戳', () => {
  const next = adoptHabit([], { name: '语气', wording: '正式' }, true)
  const h = next[0] as MemoryHabit
  assert.equal(h.source, 'ai-adopted')
  assert.ok(!Number.isNaN(Date.parse(h.createdAt)))
  assert.ok(!Number.isNaN(Date.parse(h.updatedAt)))
})

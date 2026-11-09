/**
 * QA 独立补充测试：产物拼装（不静默改写 / 追加不覆盖 / 空输入边界）。
 * 覆盖硬约束 #3（交互原则）在渲染层纯函数上的落点。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPreviewText, buildDimensionsText, buildSummaryText } from '../src/renderer/lib/compose'
import type { Summary } from '../src/shared/types'

test('QA·不静默改写：原始输入原样保留，补充说明以追加形式存在', () => {
  const text = '帮我写一份季度汇报（要包含数据）'
  const out = buildPreviewText(text, [{ name: '篇幅', wording: '控制在 800 字以内' }], 'zh')
  // 原始输入必须在最前且逐字保留
  assert.ok(out.startsWith(text), '原始输入应位于最前且原样保留')
  // 补充说明为追加段，带分隔标题
  assert.ok(out.includes('补充说明'))
  assert.ok(out.includes('- 篇幅：控制在 800 字以内'))
})

test('QA·不静默改写：无勾选维度时仅返回原始输入（不含补充头）', () => {
  const text = '原始需求原文，不含任何改写'
  assert.equal(buildPreviewText(text, [], 'zh'), text)
})

test('QA·空输入 + 有维度：仍能生成补充段', () => {
  const out = buildPreviewText('', [{ name: '篇幅', wording: '800字' }], 'zh')
  assert.ok(out.includes('补充说明'))
  assert.ok(out.includes('800字'))
})

test('QA·buildDimensionsText：空数组返回空串', () => {
  assert.equal(buildDimensionsText([]), '')
})

test('QA·buildSummaryText：完整结构各段齐备', () => {
  const summary: Summary = { goal: '写报告', conclusions: ['c1'], constraints: ['k1'], open: ['o1'] }
  const s = buildSummaryText(summary, 'zh')
  assert.ok(s.includes('核心目标') && s.includes('写报告'))
  assert.ok(s.includes('已达成结论') && s.includes('c1'))
  assert.ok(s.includes('仍在生效的约束') && s.includes('k1'))
  assert.ok(s.includes('待确认事项') && s.includes('o1'))
})

test('QA·buildSummaryText：空结构不崩', () => {
  const empty: Summary = { goal: '', conclusions: [], constraints: [], open: [] }
  assert.ok(buildSummaryText(empty, 'zh').includes('核心目标'))
})

/**
 * QA 独立补充测试：容错 JSON 解析（剥代码块 / 提取首个 JSON / 坏 JSON 抛错）。
 * 覆盖团队验收 C② 的额外边界。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JsonParser, ParseError } from '../src/main/ai/parse'

test('QA·剥 markdown 代码块并剥离前后说明文字', () => {
  const raw = '好的，下面是结果：\n```json\n{"dimensions":[{"name":"语气","wording":"正式"}]}\n```\n希望对你有帮助'
  const r = JsonParser.parseDimensions(raw)
  assert.equal(r.dimensions.length, 1)
  assert.equal(r.dimensions[0].name, '语气')
  assert.equal(r.dimensions[0].wording, '正式')
})

test('QA·纯数组 JSON（无 dimensions 包裹）', () => {
  const r = JsonParser.parseDimensions('[{"name":"a","wording":"b"}]')
  assert.equal(r.dimensions.length, 1)
})

test('QA·兼容别名字段 label / suggestion', () => {
  const r = JsonParser.parseDimensions('{"dimensions":[{"label":"篇幅","suggestion":"800字"}]}')
  assert.equal(r.dimensions[0].name, '篇幅')
  assert.equal(r.dimensions[0].wording, '800字')
})

test('QA·坏 JSON 抛 ParseError 且 code=PARSE_ERROR', () => {
  assert.throws(
    () => JsonParser.parseDimensions('{{{bad'),
    (e: unknown) => e instanceof ParseError && e.code === 'PARSE_ERROR'
  )
})

test('QA·parseSummary 坏 JSON 抛 PARSE_ERROR', () => {
  assert.throws(
    () => JsonParser.parseSummary('not json at all'),
    (e: unknown) => (e as { code?: string })?.code === 'PARSE_ERROR'
  )
})

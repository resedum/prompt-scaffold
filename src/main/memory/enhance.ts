/**
 * 维度清单增强输入（复用 Scaffold 能力；ARCHITECTURE-v2 §4.2 EnhanceService / §4.3 链路①）。
 * - off：仅规则维度池兜底（不调用模型）
 * - local：Ollama 生成
 * - external：llm.ts 生成（复用 generateDimensions + dimensionHabits）
 * 输出 DimensionField[]（{name, value}），供 EnhanceDialog 勾选后采纳。
 */
import { PrivacyGuard, localModelConfig, memoryError } from './privacy-guard'
import { LLMProvider } from '../ai/llm'
import { generateFallbackDimensions } from '../ai/fallback'
import type { EnhanceRequest, DimensionField } from '../../shared/memory-types'
import type { ModelConfig, MemoryHabit, Dimension } from '../../shared/types'

export interface EnhanceContext {
  privacyGuard: PrivacyGuard
  getModelConfig: () => ModelConfig
  getHabits: () => MemoryHabit[]
}

export class EnhanceService {
  constructor(private ctx: EnhanceContext) {}

  async enhance(req: EnhanceRequest): Promise<DimensionField[]> {
    // 隐私档位一律以 privacyGuard 为准，绝不采信渲染层传入的 scope（防绕过：三档默认关闭是硬约束）
    const scope = this.ctx.privacyGuard.scopeOf('enhance')
    if (scope === 'off') {
      // 仅规则维度池兜底，不调用模型
      return toFields(generateFallbackDimensions(req.text))
    }

    const cfg = scope === 'local' ? localModelConfig(this.ctx.getModelConfig()) : this.ctx.getModelConfig()
    const llm = new LLMProvider(cfg)
    try {
      const dims = await llm.generateDimensions(
        { text: req.text, images: [], language: 'zh' },
        this.ctx.getHabits()
      )
      if (!dims || dims.length === 0) return toFields(generateFallbackDimensions(req.text))
      return toFields(dims)
    } catch {
      // 本地模型不可达 / 请求失败 → 规则兜底，不冒充 AI（返回为空 UI 明示）
      if (scope === 'local') throw memoryError('MODEL_ERROR', '本地模型不可达，请确认 Ollama 已启动')
      return toFields(generateFallbackDimensions(req.text))
    }
  }
}

function toFields(dims: Dimension[]): DimensionField[] {
  return dims.map((d) => ({ name: d.name, value: d.wording }))
}

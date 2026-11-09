/**
 * 双版本能力开关（ARCHITECTURE-v2 §5.2 FeatureGate，唯一裁决点）。
 * 个人版：企业版能力恒 false；企业版按 features 映射开启。
 */
import type { EditionConfig, FeatureKey } from '../../shared/privacy-types'
import { memoryError } from './privacy-guard'

export class FeatureGate {
  constructor(private getEdition: () => EditionConfig) {}

  edition(): 'personal' | 'enterprise' {
    return this.getEdition().edition ?? 'personal'
  }

  isEnabled(feature: FeatureKey): boolean {
    const e = this.getEdition()
    if (e.edition !== 'enterprise') return false
    return e.features[feature] === true
  }

  /** 企业版能力入口守卫：未开启抛 PRIVACY_DENIED */
  ensure(feature: FeatureKey): void {
    if (!this.isEnabled(feature)) {
      throw memoryError('PRIVACY_DENIED', `该功能为企业版专属，当前版本未开启（${feature}）`)
    }
  }
}

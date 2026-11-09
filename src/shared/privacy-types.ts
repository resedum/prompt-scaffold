/**
 * 隐私 / 权限 / 版本 / 存储 / 双版本配置类型（ARCHITECTURE-v2 §3.1）。
 * 纯类型 + 默认值，主进程与渲染进程共用，零运行时依赖。
 */

/** AI 范围三档：关 / 本地模型 / 外部模型 */
export type AiScope = 'off' | 'local' | 'external'

/** 外部模型下的发送范围：全部 / 仅选中 */
export type SendScope = 'all' | 'selected'

/** 可独立配档的 AI 能力键 */
export type CapabilityKey = 'enhance' | 'summarize' | 'remind' | 'codeExec'

export interface PrivacyConfig {
  /** 一键全关 AI 逃生舱 */
  masterAiKill: boolean
  /** 各能力三档 */
  capabilities: Record<CapabilityKey, AiScope>
  /** 外部模型时的默认发送范围 */
  sendScope: SendScope
}

export interface VersionConfig {
  /** 版本控制开关（用户自选） */
  enabled: boolean
  /** 保留最近 N 版 */
  keepVersions: number
  /** 或保留最近 M 天（可选） */
  keepDays?: number
  /** 二进制版本策略 */
  binaryPolicy: 'content-addressed' | 'reference-only' | 'off'
}

export interface StorageConfig {
  /** 三维度清理提醒阈值（用户分别设置） */
  cleanupReminder: {
    byVersions: number[]
    byBytes: number[]
    byIntervalDays: number[]
  }
  backupPolicy: 'off' | 'local' | 'cloud'
  backupRotation: number
}

export interface EditionConfig {
  edition: 'personal' | 'enterprise'
  features: Record<string, boolean>
  licenseValidUntil?: string
}

/** settings.json 的完整结构 */
export interface MemorySettings {
  privacy: PrivacyConfig
  version: VersionConfig
  storage: StorageConfig
  edition: EditionConfig
}

export const DEFAULT_PRIVACY_CONFIG: PrivacyConfig = {
  masterAiKill: false,
  capabilities: {
    enhance: 'off',
    summarize: 'off',
    remind: 'off',
    codeExec: 'off'
  },
  sendScope: 'selected'
}

export const DEFAULT_VERSION_CONFIG: VersionConfig = {
  enabled: true,
  keepVersions: 20,
  keepDays: undefined,
  binaryPolicy: 'content-addressed'
}

export const DEFAULT_STORAGE_CONFIG: StorageConfig = {
  cleanupReminder: {
    byVersions: [3, 5, 10],
    byBytes: [1024 * 1024 * 1024, 2 * 1024 * 1024 * 1024],
    byIntervalDays: [7, 15, 30]
  },
  backupPolicy: 'off',
  backupRotation: 5
}

export const DEFAULT_EDITION_CONFIG: EditionConfig = {
  edition: 'personal',
  features: {
    teamSpace: false,
    auditLog: false,
    remoteSandbox: false,
    cloudBackup: false
  },
  licenseValidUntil: undefined
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  privacy: DEFAULT_PRIVACY_CONFIG,
  version: DEFAULT_VERSION_CONFIG,
  storage: DEFAULT_STORAGE_CONFIG,
  edition: DEFAULT_EDITION_CONFIG
}

/** 企业版能力键（个人版恒 false，由 feature-gate 裁决） */
export type FeatureKey = 'teamSpace' | 'auditLog' | 'remoteSandbox' | 'cloudBackup'

/**
 * 轻量 i18n：两语言字典 + 翻译函数（无需重型库）。
 */
import type { Language } from '../../shared/types'
import zh from './zh'
import en from './en'

export type Lang = Language

export const dictionaries: Record<Lang, Record<string, string>> = { zh, en }

/** 取词；缺失时返回 key 本身（避免空白） */
export function translate(lang: Lang, key: string, params?: Record<string, string | number>): string {
  let s = dictionaries[lang][key] ?? dictionaries.zh[key] ?? key
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replaceAll(`{${k}}`, String(v))
    }
  }
  return s
}

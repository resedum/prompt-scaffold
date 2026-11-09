/**
 * 应用状态与动作（渲染层）。
 * 三大链路：文字生成 / 图片识别 / 对话总结；记忆偏好、静默期、复制均在此编排。
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { bridge } from '../api/bridge'
import { translate } from '../i18n'
import type {
  Dimension,
  GenerateInput,
  ImageData,
  Language,
  Preferences,
  Summary,
  ErrorCode,
  DimensionSource
} from '../../shared/types'
import { SILENCE_IGNORE_THRESHOLD, SILENCE_STORAGE_KEY } from '../../shared/constants'
import { adoptHabit, removeHabit, isAdopted } from '../../shared/memory'
import { makeId, buildPreviewText, buildDimensionsText, buildSummaryText, type UiDimension } from '../lib/compose'

export type Mode = 'dimension' | 'summary' | 'memory'

export interface AppError {
  code: ErrorCode
  message: string
}

export interface AppStateAndActions {
  // 状态
  mode: Mode
  text: string
  images: ImageData[]
  dimensions: UiDimension[]
  source: DimensionSource
  fallbackReason?: string
  summary: Summary | null
  summaryDimensions: UiDimension[]
  loading: boolean
  error: AppError | null
  prefs: Preferences | null
  lang: Language
  theme: 'light' | 'dark'
  silenced: boolean
  copied: boolean
  // 动作
  t: (key: string, params?: Record<string, string | number>) => string
  setMode: (m: Mode) => void
  setText: (s: string | ((prev: string) => string)) => void
  addImage: (img: ImageData) => void
  removeImage: (i: number) => void
  clearAll: () => void
  generate: () => Promise<void>
  summarize: () => Promise<void>
  toggleSelected: (id: string) => void
  setAllSelected: (v: boolean) => void
  updateDimension: (id: string, patch: Partial<Dimension>) => void
  removeDimension: (id: string) => void
  restoreDimension: (id: string) => void
  addDimension: () => void
  setHabit: (dim: Dimension, adopted: boolean) => void
  isHabit: (name: string) => boolean
  updateSummary: (patch: Partial<Summary>) => void
  copyFull: () => Promise<void>
  copyDimensions: () => Promise<void>
  copySummary: () => Promise<void>
  doScreenshot: () => Promise<void>
  pasteImage: () => Promise<void>
  pickImage: () => Promise<void>
  readTextFile: () => Promise<void>
  savePrefs: (p: Preferences) => Promise<void>
  setLang: (l: Language) => void
  setTheme: (t: 'light' | 'dark') => void
  dismissFallbackNotice: () => void
}

function toUi(dims: Dimension[], selected = true): UiDimension[] {
  return dims.map((d) => ({ ...d, id: makeId(), selected, removed: false }))
}

export function useAppState(): AppStateAndActions {
  const [mode, setMode] = useState<Mode>('dimension')
  const [text, setText] = useState('')
  const [images, setImages] = useState<ImageData[]>([])
  const [dimensions, setDimensions] = useState<UiDimension[]>([])
  const [source, setSource] = useState<DimensionSource>('fallback')
  const [fallbackReason, setFallbackReason] = useState<string | undefined>()
  const [summary, setSummary] = useState<Summary | null>(null)
  const [summaryDimensions, setSummaryDimensions] = useState<UiDimension[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<AppError | null>(null)
  const [prefs, setPrefs] = useState<Preferences | null>(null)
  const [silenced, setSilenced] = useState<boolean>(false)
  const [copied, setCopied] = useState(false)

  const lang: Language = prefs?.language ?? 'zh'
  const theme = prefs?.ui.theme ?? 'light'

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => translate(lang, key, params),
    [lang]
  )

  // 载入偏好 + 静默期计数
  useEffect(() => {
    bridge.loadPrefs().then((r) => {
      if (r.ok) setPrefs(r.data)
    })
    const n = Number(localStorage.getItem(SILENCE_STORAGE_KEY) ?? '0')
    setSilenced(n >= SILENCE_IGNORE_THRESHOLD)
  }, [])

  // 主题切换
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // 剪贴板图片事件订阅（预留，当前由粘贴事件/按钮触发）
  useEffect(() => {
    return bridge.onClipboardImage((img) => addImage(img))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const addImage = useCallback((img: ImageData) => {
    setImages((prev) => {
      if (prev.some((p) => p.dataUrl === img.dataUrl)) return prev
      return [...prev, img]
    })
  }, [])

  const removeImage = useCallback((i: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== i))
  }, [])

  const clearAll = useCallback(() => {
    setText('')
    setImages([])
    setDimensions([])
    setSummary(null)
    setSummaryDimensions([])
    setError(null)
    setFallbackReason(undefined)
  }, [])

  const generate = useCallback(async () => {
    if (loading) return
    if (!text.trim() && images.length === 0) {
      setError({ code: 'EMPTY_RESULT', message: t('dimension.empty') })
      return
    }
    setLoading(true)
    setError(null)
    const input: GenerateInput = { text, images, language: lang }
    const r = await bridge.generateDimensions(input)
    if (r.ok) {
      setDimensions(toUi(r.data.dimensions, true))
      setSource(r.data.source)
      setFallbackReason(r.data.fallbackReason)
    } else {
      setError({ code: r.code, message: r.message })
    }
    setLoading(false)
  }, [loading, text, images, lang, t])

  const summarize = useCallback(async () => {
    if (loading) return
    if (!text.trim()) {
      setError({ code: 'EMPTY_RESULT', message: t('summary.empty') })
      return
    }
    setLoading(true)
    setError(null)
    const input: GenerateInput = { text, images, language: lang }
    const r = await bridge.summarizeConversation(input)
    if (r.ok) {
      setSummary(r.data.summary)
      setSummaryDimensions(toUi(r.data.dimensions, true))
    } else {
      setError({ code: r.code, message: r.message })
    }
    setLoading(false)
  }, [loading, text, images, lang, t])

  const toggleSelected = useCallback((id: string) => {
    setDimensions((prev) => prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)))
  }, [])

  const setAllSelected = useCallback((v: boolean) => {
    setDimensions((prev) => prev.map((d) => ({ ...d, selected: v })))
  }, [])

  const updateDimension = useCallback((id: string, patch: Partial<Dimension>) => {
    setDimensions((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))
  }, [])

  // 已撤回项保留标记而非删除（交互原则：不静默改写）
  const removeDimension = useCallback((id: string) => {
    setDimensions((prev) => prev.map((d) => (d.id === id ? { ...d, removed: true, selected: false } : d)))
  }, [])

  const restoreDimension = useCallback((id: string) => {
    setDimensions((prev) => prev.map((d) => (d.id === id ? { ...d, removed: false } : d)))
  }, [])

  const addDimension = useCallback(() => {
    setDimensions((prev) => [
      ...prev,
      { id: makeId(), name: '', wording: '', selected: true, removed: false }
    ])
  }, [])

  const isHabit = useCallback(
    (name: string) => isAdopted(prefs?.dimensionHabits ?? [], name),
    [prefs]
  )

  const setHabit = useCallback(
    (dim: Dimension, adopted: boolean) => {
      if (!prefs) return
      // 采纳 → upsert；反选 → 移除（支持「设为习惯」的取消）
      const dimensionHabits = adopted
        ? adoptHabit(prefs.dimensionHabits, dim, true)
        : removeHabit(prefs.dimensionHabits, dim.name)
      const next: Preferences = { ...prefs, dimensionHabits }
      setPrefs(next)
      bridge.savePrefs(next)
    },
    [prefs]
  )

  const updateSummary = useCallback((patch: Partial<Summary>) => {
    setSummary((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  const selectedActive = useMemo(
    () => dimensions.filter((d) => d.selected && !d.removed),
    [dimensions]
  )

  const copyFull = useCallback(async () => {
    const s = buildPreviewText(text, selectedActive, lang)
    await bridge.copyText(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [text, selectedActive, lang])

  const copyDimensions = useCallback(async () => {
    const s = buildDimensionsText(selectedActive)
    await bridge.copyText(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [selectedActive])

  const copySummary = useCallback(async () => {
    if (!summary) return
    const s = buildSummaryText(summary, lang)
    await bridge.copyText(s)
    setCopied(true)
    setTimeout(() => setCopied(false), 1200)
  }, [summary, lang])

  const doScreenshot = useCallback(async () => {
    const r = await bridge.captureScreen()
    if (r.ok && r.data) addImage(r.data)
    else if (!r.ok) setError({ code: r.code, message: r.message })
  }, [addImage])

  const pasteImage = useCallback(async () => {
    const r = await bridge.readClipboardImage()
    if (r.ok && r.data) addImage(r.data)
    else if (r.ok && !r.data) setError({ code: 'CLIPBOARD_EMPTY', message: t('error.CLIPBOARD_EMPTY') })
    else if (!r.ok) setError({ code: r.code, message: r.message })
  }, [addImage, t])

  const pickImage = useCallback(async () => {
    const r = await bridge.pickImageFile()
    if (r.ok && r.data) addImage(r.data)
    else if (!r.ok) setError({ code: r.code, message: r.message })
  }, [addImage])

  const readTextFile = useCallback(async () => {
    const r = await bridge.readTextFile()
    if (r.ok && r.data) setText((prev) => (prev ? prev + '\n\n' + r.data! : r.data!))
    else if (!r.ok) setError({ code: r.code, message: r.message })
  }, [])

  const savePrefs = useCallback(async (p: Preferences) => {
    setPrefs(p)
    await bridge.savePrefs(p)
  }, [])

  const setLang = useCallback(
    (l: Language) => {
      if (prefs) void savePrefs({ ...prefs, language: l })
    },
    [prefs, savePrefs]
  )

  const setTheme = useCallback(
    (th: 'light' | 'dark') => {
      if (prefs) void savePrefs({ ...prefs, ui: { ...prefs.ui, theme: th } })
    },
    [prefs, savePrefs]
  )

  // 静默期：连续忽略提醒 N 次后不再主动弹提醒（交互原则：知道什么时候闭嘴）
  const dismissFallbackNotice = useCallback(() => {
    const n = Number(localStorage.getItem(SILENCE_STORAGE_KEY) ?? '0') + 1
    localStorage.setItem(SILENCE_STORAGE_KEY, String(n))
    setSilenced(n >= SILENCE_IGNORE_THRESHOLD)
  }, [])

  return {
    mode, text, images, dimensions, source, fallbackReason, summary, summaryDimensions,
    loading, error, prefs, lang, theme, silenced, copied,
    t, setMode, setText, addImage, removeImage, clearAll, generate, summarize,
    toggleSelected, setAllSelected, updateDimension, removeDimension, restoreDimension,
    addDimension, setHabit, isHabit, updateSummary, copyFull, copyDimensions, copySummary,
    doScreenshot, pasteImage, pickImage, readTextFile, savePrefs, setLang, setTheme,
    dismissFallbackNotice
  }
}

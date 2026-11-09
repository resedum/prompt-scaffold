import { useEffect, useState } from 'react'
import { useApp } from '../state/AppContext'
import { MODEL_PRESETS, DEFAULT_MODEL_CONFIG } from '../../shared/constants'
import type { ModelConfig, Preferences } from '../../shared/types'

export default function ModelSettings() {
  const { prefs, t, savePrefs, setLang, setTheme, lang, theme } = useApp()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ModelConfig>(prefs?.model ?? DEFAULT_MODEL_CONFIG)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (prefs) setDraft(prefs.model)
  }, [prefs, open])

  if (!prefs) return null

  const applyPreset = (id: string) => {
    const p = MODEL_PRESETS.find((x) => x.id === id)
    if (!p) return
    setDraft({ presetId: p.id, baseUrl: p.baseUrl, apiKey: draft.apiKey, model: p.model, visionModel: p.visionModel })
  }

  const save = async () => {
    const next: Preferences = { ...prefs, model: draft }
    await savePrefs(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
      >
        ⚙ {t('settings.title')}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="w-[460px] max-h-[80vh] overflow-y-auto rounded-lg bg-white p-4 shadow-xl dark:bg-gray-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-3 text-sm font-semibold">{t('settings.title')}</h3>

            <label className="mb-1 block text-xs text-gray-500">{t('settings.preset')}</label>
            <select
              value={draft.presetId}
              onChange={(e) => applyPreset(e.target.value)}
              className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            >
              {MODEL_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs text-gray-500">{t('settings.baseUrl')}</label>
            <input
              value={draft.baseUrl}
              onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
              className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            />

            <label className="mb-1 block text-xs text-gray-500">{t('settings.apiKey')}</label>
            <input
              type="password"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder="sk-…"
              className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            />
            {!draft.apiKey && draft.presetId !== 'ollama' && (
              <p className="mb-3 text-xs text-amber-600">{t('settings.noKeyHint')}</p>
            )}

            <label className="mb-1 block text-xs text-gray-500">{t('settings.model')}</label>
            <input
              value={draft.model}
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              className="mb-3 w-full rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            />

            <label className="mb-1 block text-xs text-gray-500">{t('settings.visionModel')}</label>
            <input
              value={draft.visionModel}
              onChange={(e) => setDraft({ ...draft, visionModel: e.target.value })}
              placeholder="glm-4v-flash / gpt-4o / llava"
              className="mb-1 w-full rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
            />
            {!draft.visionModel && <p className="mb-3 text-xs text-gray-400">{t('settings.visionHint')}</p>}

            <div className="mb-3 flex items-center gap-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('settings.language')}</label>
                <select
                  value={lang}
                  onChange={(e) => setLang(e.target.value as 'zh' | 'en')}
                  className="rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">{t('settings.theme')}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}
                  className="rounded-md border border-gray-300 bg-gray-50 p-2 text-sm dark:border-gray-600 dark:bg-gray-900"
                >
                  <option value="light">{t('settings.theme.light')}</option>
                  <option value="dark">{t('settings.theme.dark')}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
                {t('action.cancel')}
              </button>
              <button onClick={save} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">
                {saved ? t('settings.saved') : t('action.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

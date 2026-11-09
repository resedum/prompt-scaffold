import { useCallback } from 'react'
import { useApp } from '../state/AppContext'
import ShareLinkInput from './ShareLinkInput'
import type { ImageData } from '../../shared/types'

/** 文字输入面板 + 图片拖入/粘贴 + 生成/截图动作 */
export default function InputPanel() {
  const {
    mode, text, setText, loading, t, generate, summarize,
    doScreenshot, pasteImage, pickImage, readTextFile, clearAll, addImage
  } = useApp()

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      for (const f of files) {
        if (f.type.startsWith('image/')) {
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = String(reader.result)
            const img = new Image()
            img.onload = () => addImage({ dataUrl, mime: f.type || 'image/png', width: img.width, height: img.height })
            img.src = dataUrl
          }
          reader.readAsDataURL(f)
        } else if (f.type.startsWith('text/') || /\.(txt|md|markdown)$/i.test(f.name)) {
          const reader = new FileReader()
          reader.onload = () => setText((prev) => (prev ? prev + '\n\n' + String(reader.result) : String(reader.result)))
          reader.readAsText(f)
        }
      }
    },
    [addImage, setText]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      {mode === 'summary' && <ShareLinkInput />}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        placeholder={mode === 'dimension' ? t('input.placeholder') : t('input.summaryHint')}
        rows={5}
        className="w-full resize-none rounded-md border border-gray-300 bg-gray-50 p-2 text-sm outline-none focus:border-blue-500 dark:border-gray-600 dark:bg-gray-900"
      />
      <p className="text-xs text-gray-400">{t('input.charCount', { n: text.length })}</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={mode === 'dimension' ? generate : summarize}
          disabled={loading}
          className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? t('status.generating') : mode === 'dimension' ? t('action.generate') : t('action.summarize')}
        </button>
        <button
          onClick={doScreenshot}
          disabled={loading}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {t('action.screenshot')}
        </button>
        <button
          onClick={pasteImage}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {t('action.pasteImage')}
        </button>
        <button
          onClick={pickImage}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {t('action.pickImage')}
        </button>
        <button
          onClick={readTextFile}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {t('action.pickText')}
        </button>
        <button
          onClick={clearAll}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {t('action.clear')}
        </button>
      </div>
    </div>
  )
}

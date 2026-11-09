import { useEffect } from 'react'
import { AppProvider, useApp } from './state/AppContext'
import ModeTabs from './components/ModeTabs'
import InputPanel from './components/InputPanel'
import ImagePanel from './components/ImagePanel'
import DimensionList from './components/DimensionList'
import SummaryView from './components/SummaryView'
import PreviewPanel from './components/PreviewPanel'
import ModelSettings from './components/ModelSettings'
import MemoryLibrary from './components/MemoryLibrary'
import MemoryPanel from './components/MemoryPanel'
import StatusBar from './components/StatusBar'

function PasteListener() {
  const { addImage } = useApp()
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (!file) continue
          const reader = new FileReader()
          reader.onload = () => {
            const dataUrl = String(reader.result)
            const img = new Image()
            img.onload = () => addImage({ dataUrl, mime: file.type || 'image/png', width: img.width, height: img.height })
            img.src = dataUrl
          }
          reader.readAsDataURL(file)
        }
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [addImage])
  return null
}

function Shell() {
  const { mode, t } = useApp()
  return (
    <div className="flex h-screen flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <PasteListener />
      <header className="flex items-center justify-between border-b bg-white px-4 py-2 dark:border-gray-700 dark:bg-gray-800">
        <h1 className="text-sm font-semibold">{t('app.title')}</h1>
        <div className="flex items-center gap-2">
          <MemoryLibrary />
          <ModelSettings />
        </div>
      </header>
      <ModeTabs />
      <main className="flex min-h-0 flex-1 gap-3 p-3">
        {mode === 'memory' ? (
          <section className="flex min-w-0 flex-1 flex-col">
            <MemoryPanel />
          </section>
        ) : (
          <>
            <section className="flex min-w-0 flex-1 flex-col gap-2">
              <InputPanel />
              <ImagePanel />
              {mode === 'dimension' ? <DimensionList /> : <SummaryView />}
            </section>
            <section className="flex w-[42%] min-w-[320px] flex-col">
              <PreviewPanel />
            </section>
          </>
        )}
      </main>
      <StatusBar />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}

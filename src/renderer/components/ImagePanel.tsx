import { useApp } from '../state/AppContext'

export default function ImagePanel() {
  const { images, removeImage, t, pickImage } = useApp()
  return (
    <div className="rounded-lg border bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t('image.title')}</h2>
        <button onClick={pickImage} className="text-xs text-blue-600 hover:underline">
          {t('image.dragHint')}
        </button>
      </div>
      {images.length === 0 ? (
        <p className="text-xs text-gray-400">{t('image.empty')}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="group relative">
              <img src={img.dataUrl} alt="" className="h-20 w-20 rounded-md border object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white group-hover:flex"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * 截图遮罩窗口内容（独立窗口，hash=#screenshot 时渲染）。
 * 展示全屏截图，拖拽框选 → finishScreenshot(rect)；Esc 或右键取消。
 */
import { useCallback, useEffect, useState } from 'react'
import { bridge } from '../api/bridge'
import type { ImageData, Rect } from '../../shared/types'

interface Pt {
  x: number
  y: number
}

export default function ScreenshotOverlay() {
  const [img, setImg] = useState<ImageData | null>(null)
  const [start, setStart] = useState<Pt | null>(null)
  const [cur, setCur] = useState<Pt | null>(null)

  useEffect(() => {
    bridge.getScreenshotImage().then((r) => {
      if (r.ok && r.data) setImg(r.data)
      else bridge.finishScreenshot(null)
    })
  }, [])

  const rect = useCallback((): Rect | null => {
    if (!start || !cur) return null
    const x = Math.min(start.x, cur.x)
    const y = Math.min(start.y, cur.y)
    const w = Math.abs(cur.x - start.x)
    const h = Math.abs(cur.y - start.y)
    if (w < 4 || h < 4) return null
    return { x, y, w, h }
  }, [start, cur])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 2) {
      bridge.finishScreenshot(null)
      return
    }
    setStart({ x: e.clientX, y: e.clientY })
    setCur({ x: e.clientX, y: e.clientY })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    if (start) setCur({ x: e.clientX, y: e.clientY })
  }

  const onMouseUp = () => {
    if (start) {
      bridge.finishScreenshot(rect())
      setStart(null)
      setCur(null)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') bridge.finishScreenshot(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const sel = rect()

  return (
    <div
      className="relative h-screen w-screen select-none overflow-hidden bg-black"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onContextMenu={(e) => e.preventDefault()}
      style={{ cursor: 'crosshair' }}
    >
      {img && (
        <img src={img.dataUrl} alt="" className="h-full w-full object-fill" draggable={false} />
      )}
      {/* 暗化遮罩 */}
      <div className="pointer-events-none absolute inset-0 bg-black/30" />
      {/* 选区高亮 */}
      {sel && (
        <div
          className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/10"
          style={{ left: sel.x, top: sel.y, width: sel.w, height: sel.h }}
        >
          <span className="absolute -top-6 left-0 rounded bg-blue-500 px-1 text-xs text-white">
            {sel.w} × {sel.h}
          </span>
        </div>
      )}
      <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded bg-black/70 px-3 py-1 text-xs text-white">
        拖拽框选截图区域 · Esc 取消
      </div>
    </div>
  )
}

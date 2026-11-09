import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ScreenshotOverlay from './components/ScreenshotOverlay'
import './styles/global.css'

// 截图遮罩窗口复用同一渲染层 bundle，通过 hash 路由区分
const isOverlay = window.location.hash === '#screenshot'

const container = document.getElementById('root')
if (!container) throw new Error('root element not found')

createRoot(container).render(
  <StrictMode>{isOverlay ? <ScreenshotOverlay /> : <App />}</StrictMode>
)

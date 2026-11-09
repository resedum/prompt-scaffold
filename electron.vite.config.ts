import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// electron-vite 三段构建：main（主进程）/ preload（预加载）/ renderer（渲染层）。
// externalizeDepsPlugin 将 dependencies（如 openai）保持为外部 require，由 electron-builder 打包进 node_modules。
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react()]
  }
})

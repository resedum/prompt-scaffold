# Third-Party Notices

本项目使用了以下第三方开源软件。我们感谢各项目的作者与贡献者。

## 运行时依赖（打包进应用）

| 依赖 | 许可证 | 说明 |
|---|---|---|
| [openai](https://github.com/openai/openai-node) | Apache-2.0 | OpenAI API 客户端 |
| [minisearch](https://github.com/lucaong/minisearch) | MIT | 本地全文搜索 |
| [pdfjs-dist](https://github.com/mozilla/pdf.js) | Apache-2.0 | PDF 文本抽取 |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | BSD-2-Clause | docx → 文本 |
| [jszip](https://github.com/Stuk/jszip) | MIT OR GPL-3.0-or-later | Office 文件解包（**本项目选用 MIT 许可选项**） |
| [react](https://github.com/facebook/react) / [react-dom](https://github.com/facebook/react) | MIT | UI 框架 |

## 构建 / 开发依赖（不进入运行时产物）

| 依赖 | 许可证 |
|---|---|
| [electron](https://github.com/electron/electron) | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | MIT |
| [electron-vite](https://github.com/alex8088/electron-vite) | MIT |
| [vite](https://github.com/vitejs/vite) | MIT |
| [typescript](https://github.com/microsoft/TypeScript) | Apache-2.0 |
| [tailwindcss](https://github.com/tailwindlabs/tailwindcss) | MIT |
| [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) | MIT |
| [tsx](https://github.com/privatenumber/tsx) | MIT |
| [autoprefixer](https://github.com/postcss/autoprefixer) / [postcss](https://github.com/postcss/postcss) | MIT |

## 关于 jszip 的双许可

`jszip` 采用 `MIT OR GPL-3.0-or-later` 双许可。**本项目明确选择 MIT 许可选项**，不采用 GPL，以避免 GPL 的 copyleft 传染性影响。

## 版权声明

各依赖的完整版权声明与许可证全文随各包分发（位于 `node_modules/<包名>/LICENSE*`）。本项目自身采用 [MIT](./LICENSE) 许可。

图标资源（`resources/*.png`）由 `scripts/gen-icons.mjs` 纯代码生成，为原创内容，无第三方素材。

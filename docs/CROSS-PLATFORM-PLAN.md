# 记忆工具 · 个人版 —— 三平台（Windows / Linux / macOS）适配方案

> 架构师：高见远 ｜ 日期：2026-11-08
> 输入：`MEMORY-TOOL-ARCHITECTURE-v2.md`（权威规格）+ `MEMORY-PERSONAL-README.md`（功能范围）+ 现有 `src/` 全量代码审查
> 目标：**「我电脑上能用、别人电脑用不了」必须归零** —— 运行时代码零平台专有调用、路径/分隔符/大小写/换行全收敛、三平台可构建可验证。
> 技术栈已定：Electron + React + TypeScript + Tailwind + openai SDK + MiniSearch，**零 native 编译依赖**（这条是跨平台能成立的根基，必须守住）。

---

## 0. 一句话结论

现有代码**整体已相当干净**（路径全用 `path` 模块、无硬编码 `C:\`、无 `PowerShell/cmd/注册表` 运行时调用、换行已用 `\r?\n` 兼容），**真正的跨平台风险集中在 3 处**：① `electron-builder.yml` 里 `electronDist` 钉死了 Windows 的 Electron 发行包、且缺 `mac/linux` 配置段；② 托盘图标没有 macOS 模板图、也没有按平台选尺寸；③ macOS 下没有应用菜单导致 `Cmd+C/V/Q/A` 快捷键全部失效。此外截图服务的 Retina 缩放、原子写的 Windows 语义差异是「能用但可能出小错」的二等风险。改完这几点 + 补齐三平台构建脚本/CI，即可满足「三平台都要」。

---

## 1. 现有代码跨平台风险审查（逐条：文件:行 + 问题 + 改法）

> 分级：🔴 阻断（不修则某平台无法打包/核心功能失效）｜🟠 高危（某平台体验/正确性受损）｜🟡 中低（边界场景，建议修）｜🔵 前瞻（当前代码没有、但记忆工具新模块会踩）

### 1.1 打包配置

| # | 位置 | 问题 | 改法 |
|---|---|---|---|
| R1 🔴 | `electron-builder.yml:14` | `electronDist: node_modules/electron/dist` 把**本机（Windows）的 Electron 发行目录**硬塞给 electron-builder，导致 mac/linux 打包时拿到的是 Windows 版 Electron，**直接打不出 mac/linux 安装包**。这是三平台最大阻断点。 | **删除该行**（让 electron-builder 按目标平台自动下载正确发行包）；如确需本机加速，也只应在 Windows 构建环境用环境变量注入，绝不能写死进仓库配置。 |
| R2 🔴 | `electron-builder.yml` 整体 | 只有 `win` 段，无 `mac`/`linux` 段；`win.icon` 是 `icon.png`（缺多尺寸 `.ico`）；缺 mac 的 `category`、linux 的 `maintainer`（deb 打包**必填**，缺失会直接报错）。 | 按 §3.1 补全 `win/mac/linux` 三段完整配置。 |
| R3 🟡 | `resources/` 目录 | 只有 `icon.png`(256) + `tray-icon.png`(32)。mac 需要 `.icns`、Windows 理想 `.ico`、Linux 需要多尺寸 PNG；mac 托盘需要单色模板图。 | 见 §3.4 图标方案：以 **512×512 `icon.png` 为单一来源**，让 electron-builder 自动转 `.ico/.icns`（实测本机 `dist/.icon-ico/icon.ico` 已被自动生成，证明该路径可行）；托盘补 `tray-iconTemplate.png`（单色）+ `@2x`。 |
| R4 🟡 | `scripts/gen_icons.py` | 只生成 PNG，且依赖 Python；CI 机器需额外装 Python。 | 保留脚本生成 PNG 源图即可；`.ico/.icns` 交给 electron-builder 自动转换，避免在 CI 引入 icns 转换工具链。若想离线可复现，再加一个 `scripts/gen-icons.mjs`（Node + zlib 手写 PNG 同款逻辑，去掉 Python 依赖）。 |

### 1.2 主进程运行时代码

| # | 位置 | 问题 | 改法 |
|---|---|---|---|
| R5 🔴 | `src/main/window.ts:29` + 全工程无 `Menu.setApplicationMenu` | `autoHideMenuBar: true` 只在 Win/Linux 生效；**macOS 的应用菜单是全局菜单栏，且 `Cmd+C / Cmd+V / Cmd+A / Cmd+Q / Cmd+W` 这些快捷键在 Electron 里必须靠应用菜单的 role 项才能触发**。当前没设菜单 → mac 用户复制粘贴、全选、退出全失效，属「在别人（mac）电脑上不能正常用」。 | 在 `index.ts` 或新 `src/main/menu.ts` 里，**仅 macOS** 设一个最小菜单：`app` 子菜单（`about/quit`）+ `edit` 子菜单（`undo/redo/cut/copy/paste/selectAll`，全用 role）；Win/Linux 维持隐藏菜单不变（Chromium 在输入框内自带 Ctrl+C/V）。 |
| R6 🟠 | `src/main/tray.ts:12-27` | 托盘图标：统一 `tray-icon.png` 并 `.resize({width:16,height:16})`。问题：① mac 需要**模板图（单色+alpha，命名 `xxxTemplate.png` 或 `setTemplateImage(true)`）**才能随深/浅色菜单栏自适应，彩色图在 mac 上会发灰/难看不协调；② mac 托盘标准是 16pt（Retina 需 32px @2x），硬 resize 到 16 会糊；③ Linux 部分桌面（GNOME 默认）无托盘，需 `appindicator` 扩展，且对图标尺寸敏感。 | 抽出 `getTrayIconPath()` + `loadTrayIcon()` 按 `process.platform` 选择：mac 用 `tray-iconTemplate.png`（不 resize，`nativeImage.createFromPath` 后 `setTemplateImage(true)`，自动适配 @2x）；win 用 `.ico` 优先、缺省 PNG resize 16；linux 用 PNG resize 16/22 并按桌面能力 try-catch 降级（托盘创建失败只记日志、不闪退——现有 try-catch 已具备，保留）。 |
| R7 🟠 | `src/main/screenshot.ts:19-31,38-49,101-112` | 截图服务：① 只取 `getPrimaryDisplay()`，**多显示器只截主屏**（README 无此承诺，属「首版主屏优先」，可接受但要写明）；② **未处理 `display.scaleFactor`**——mac Retina（scaleFactor=2）下 `screen` 返回逻辑坐标、`desktopCapturer` 缩略图可能是物理像素，`thumbnailSize:{width,height}` 用逻辑尺寸请求会导致缩略图与遮罩窗口、裁剪坐标三者错位，**mac 上框选出来的图会偏/错**；③ 全屏遮罩窗口在 mac 全屏/多 Space 下需 `setAlwaysOnTop(true,'screen-saver')` + `setVisibleOnAllWorkspaces(true)` 才能盖住全屏。 | 见 §4.5：按 `display.scaleFactor` 把逻辑 rect 统一换算到缩略图物理像素再 `crop`；遮罩窗口加 mac 专属 `alwaysOnTop` 层级；多显示器后置但要留 `screen.getAllDisplays()` 扩展点。 |
| R8 🟡 | `src/main/index.ts:51-54` | `window-all-closed` 里 `if (process.platform !== 'darwin') {}` 空分支：语义是「所有平台都不退出、靠托盘退出」，但写法让「darwin」成为一个没内容的分支，且没有集中管理平台差异。另外**没有 `app.setAppUserModelId(APP_ID)`**（Windows 通知/任务栏分组需要）和 mac 的 `app.dock` 决策。 | 见 §2：建 `src/shared/platform.ts` 集中平台常量；补 `app.setAppUserModelId(APP_ID)`（Windows 通知前置，见 R12）；mac 是否 `app.dock.hide()` 由「托盘常驻」产品决策定（默认不 hide，保持窗口可见更简单）。 |
| R9 🟡 | `src/main/storage/store.ts:122` | `renameSync(tmp, this.filePath)` 原子替换：POSIX（mac/linux）`rename` 直接覆盖旧文件，Windows 的覆盖语义历史上更苛刻（目标存在/被占用时可能 EEXIST/EPERM），当前虽有「降级直接写 + warn」兜底，但意味着 **Windows 上每次保存都可能走非原子路径并刷 warn 日志**。 | 改成稳健的跨平台原子写：先 `writeFileSync(tmp)`，`renameSync` 失败且 `err.code` 为 `EEXIST/EPERM` 时，`rmSync(this.filePath,{force:true})` 后再 rename 一次，仍失败再降级直写。保留现有 try-catch 与重试，不新增依赖。 |
| R10 🟡 | `src/main/share-fetch.ts:20-21` | 抓分享链接的 UA 硬编码 `Windows NT 10.0; Win64; x64`，三平台都伪装成 Windows Chrome。属「故意伪装」非正确性问题，但三平台都用同一个 Windows UA，在反爬判定上更易被识别为机器人。 | 可选优化：按 `process.platform` 生成对应平台的桌面 Chrome UA（darwin→Macintosh、linux→X11）。低优先，不改也不影响功能。 |
| R11 🟡 | `src/main/ipc.ts:150-156,171-176,213,232` | 文件对话框 `filters.extensions` 只写了小写（`['png','jpg','md',...]`）。**Linux 的 GTK 文件对话框按扩展名过滤是大小写敏感的**，`IMAGE.PNG`、`README.MD` 这类大写扩展名文件会被过滤掉看不到。 | 扩展名数组同时补大写变体（如 `['png','PNG','jpg','jpeg','JPG','JPEG']`），或去掉 filters 让用户自由选。mac/Win 对话框大小写不敏感、无影响。 |

### 1.3 渲染层 / 共享层

| # | 位置 | 问题 | 改法 |
|---|---|---|---|
| R12 ✅ | 全 `src/` | **已确认无硬编码 `C:\`、无反斜杠路径字面量、无 `;` 分隔符假设、无 `PowerShell/cmd/chcp/注册表` 运行时调用**；路径全部走 `path.join/dirname/basename/extname`；换行在 `share-text.ts:36` 用 `split(/\r?\n/)` 兼容 CRLF/LF；时间戳统一 `toISOString()`（ISO 8601 UTC）。 | 保持，并在 §2 用 lint/脚本把「不得引入」固化为规则。 |
| R13 🟡 | `src/main/ipc.ts:291-301` + `src/shared/*` | `mimeOf()` 用 `extname().toLowerCase()` 后查表——已正确 lower，无大小写问题（✅）。数据文件命名 `defaultPath` 用相对文件名，✅。 | 无需改。 |
| R14 ✅ | `src/renderer/**` | 渲染层无平台 API 调用；`localStorage`、`navigator.clipboard`（通过 paste 事件）均跨平台；CSP `connect-src 'self' ws://localhost:* http://localhost:*` 只放行本地（AI 调用在主进程、不经过渲染层），✅。 | 无需改。 |

### 1.4 前瞻（记忆工具新增模块会踩的坑，实现时直接照做）

| # | 位置（未来） | 风险 | 提前定下的做法 |
|---|---|---|---|
| R15 🔵 | `src/main/memory/code-sandbox.ts` | 本地 `node:vm` 沙箱外层要 `child_process` 起子进程跑 vm 并加 `--max-old-space-size` 超时 kill。打包后的 Electron 应用里**没有独立 `node` 可执行文件**，Windows 上 `spawn('node')` 必失败。 | 一律用 `process.execPath` + 环境变量 `ELECTRON_RUN_AS_NODE=1`（三平台通用：Win 是 electron.exe、mac/linux 是 Electron 二进制，带该环境变量即以纯 Node 模式运行）。 |
| R16 🔵 | 托盘提醒（ReminderScheduler） | 用 `new Notification()`：Windows 必须先 `app.setAppUserModelId(APP_ID)` 否则通知不显示/不归组；macOS 首次要系统通知授权（用户拒绝则静默降级为托盘提醒）；Linux 走 libnotify（个别发行版缺 `libnotify` 会失败）。 | 统一封装 `notify.ts`：`Notification.isSupported()` 判断 → 不支持的平台降级为托盘气泡/状态栏；`try-catch` 包住，绝不因通知失败闪退。 |
| R17 🔵 | 全局快捷键唤起（README「快捷键唤起」） | `globalShortcut.register` 在 macOS 需「辅助功能/输入监控」授权，未授权注册返回 false；且与系统/其他 App 快捷键可能冲突。 | 封装 `shortcut.ts`：注册返回 false 时静默降级（UI 提示「快捷键未生效」），并在设置里允许用户改键/关闭；不强制。 |
| R18 🔵 | PDF/Office 抽取（pdfjs-dist/mammoth/jszip） | 均为纯 JS/WASM，✅ 跨平台；`tesseract.js`（OCR）为纯 WASM，✅。 | 保持「零 native」红线：**禁止**引入任何需要 node-gyp 编译的依赖（如 sharp、sqlite3、better-sqlite3、canvas）。新增依赖前必须 `npm i` 后确认无 `node-gyp rebuild` 动作。 |

---

## 2. 跨平台代码规范 Checklist（工程师逐条执行）

> 目标：把「平台差异」收敛到极少数几个点，其余 99% 代码**不感知平台**。下面每条是「必须遵守」，违反 = 跨平台 bug。

### 2.1 路径与文件

1. **永远不写路径字符串字面量**：`'C:\\...'`、`'a\\b'`、`'a/b'` 一律禁止；目录拼接只用 `path.join(...)`，多段路径解析只用 `path.resolve(...)`。
2. **PATH 环境变量 / 命令搜索路径**的分隔符：Windows 是 `;`、POSIX 是 `:`，必须用 `path.delimiter`，绝不写死 `;` 或 `:`。
3. **绝对路径判断**：用 `path.isAbsolute()`；取根目录用 `path.parse(p).root`；**不要**用 `p[0] === 'C'` 或 `p.startsWith('\\')`。
4. **路径分隔符**（需要展示/拼接时）用 `path.sep`；需要把用户输入里的 `\` 和 `/` 统一时，用 `path.normalize()`。
5. **数据目录/用户目录**：只允许 `app.getPath('userData')` / `app.getPath('documents')` / `app.getPath('home')` 等 Electron 标准接口，**禁止**手拼 `%APPDATA%` / `~/Library/Application Support` / `~/.config`。

### 2.2 大小写

6. **文件扩展名/后缀匹配**：一律先 `.toLowerCase()` 再比较（现有 `mimeOf()` 已示范）。
7. **文件名比较/去重**：不要依赖「大小写不敏感」。若要按名去重，明确语义（用户可见的名字建议按**大小写敏感**处理，与 Linux 一致；如确有 Windows 兼容需求，用 `.toLowerCase()` 归一化并写清注释）。
8. **文件对话框 filters**：扩展名同时给大小写两种（见 R11），或干脆不设 filters。

### 2.3 换行与文本

9. **跨平台文本**：对外写文件/网络协议用 `\n`（LF）；读外部文本时用 `split(/\r?\n/)` 兼容（现有 `share-text.ts` 已示范）；**禁止**假设输入一定是 `\r\n` 或一定是 `\n`。
10. **生成给 AI 的 prompt / 拼接展示文本**：统一 `\n` join，不要混入 `\r`。

### 2.4 平台分支

11. **集中平台判定**：新建 `src/shared/platform.ts`，全工程只允许通过它取平台，禁止散落 `process.platform === '...'` 魔法串：

```ts
// src/shared/platform.ts
export type PlatformName = 'win32' | 'darwin' | 'linux'
export const PLATFORM: PlatformName = (() => {
  const p = process.platform
  if (p === 'win32' || p === 'darwin' || p === 'linux') return p
  return 'linux' // 兜底：其余平台按 linux 保守处理
})()
export const IS_MAC = PLATFORM === 'darwin'
export const IS_WIN = PLATFORM === 'win32'
export const IS_LINUX = PLATFORM === 'linux'

/** 强制穷尽的平台分发：缺某个平台 TS 直接报错 */
export function onPlatform<T>(handlers: Record<PlatformName, () => T>): T {
  return handlers[PLATFORM]()
}
```

12. **平台分支必须穷尽**：用 `onPlatform({ win32: () => ..., darwin: () => ..., linux: () => ... })`，让 `Record<PlatformName, ...>` 的类型检查强制补全，杜绝「写了 win 忘了 mac」。
13. **能用跨平台 API 就不分支**：先查 Electron/Node 是否有统一 API（`dialog`、`clipboard`、`app.getPath`、`shell.openPath`、`Notification`），实在没有才 `onPlatform`。

### 2.5 图标与资源

14. 图标单一来源 `resources/icon.png`（512×512），由 electron-builder 自动转 `.ico/.icns`；托盘图标按平台取（见 §4.1）。
15. mac 托盘必须用**单色模板图**（`setTemplateImage(true)`），不要给彩色。
16. 资源路径加载：dev 用 `join(__dirname,'../../resources/...')`、packaged 用 `join(process.resourcesPath,'...')`（现有 `tray.ts` 已示范），继续沿用，不写绝对路径。

### 2.6 快捷键 / 托盘 / 通知 / 菜单

17. mac 必须设应用菜单（否则 Cmd+C/V/Q/A 失效）；Win/Linux 隐藏菜单即可（见 §4.2）。
18. 全局快捷键要 try-catch 并容忍注册失败（mac 需授权）；托盘创建失败只记日志不闪退；通知要先 `Notification.isSupported()` 再发、失败降级。
19. Windows 启动后尽早 `app.setAppUserModelId(APP_ID)`（通知/任务栏正确归组）。

### 2.7 进程 / 沙箱

20. 需要跑 Node 子进程时，用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`，**禁止** `spawn('node')`（打包后不存在独立 node）。
21. 任何原生/重依赖引入前，确认「纯 JS/WASM、无 node-gyp」，守住零 native 红线。

---

## 3. 三平台打包方案

### 3.1 `electron-builder.yml` 完整配置（建议替换现文件）

```yaml
# 应用标识
appId: com.promptscaffold.app
productName: Prompt Scaffold

directories:
  output: dist
  buildResources: resources

files:
  - out/**
  - package.json

# 托盘图标等随包资源（mac 模板图也一起带上）
extraResources:
  - from: resources/tray-icon.png
    to: tray-icon.png
  - from: resources/tray-iconTemplate.png
    to: tray-iconTemplate.png
  - from: resources/tray-iconTemplate@2x.png
    to: tray-iconTemplate@2x.png

asar: true
npmRebuild: false          # 零 native 依赖，跳过 rebuild，避免 CI 上误触发 node-gyp
# 注意：删除 electronDist —— 它是 Windows 本机 Electron 发行目录，会毁掉 mac/linux 打包

# ---------- Windows ----------
win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.png        # electron-builder 会自动转 .ico（本机已实测生成 dist/.icon-ico/icon.ico）
  artifactName: ${productName}-Setup-${version}-${arch}.${ext}

nsis:
  oneClick: false
  allowToChangeInstallationDirectory: true
  artifactName: ${productName}-Setup-${version}.${ext}

# ---------- macOS ----------
mac:
  target:
    - target: dmg
      arch: [x64, arm64]          # Intel + Apple Silicon
    - target: zip
      arch: [x64, arm64]
  icon: resources/icon.png        # electron-builder 在 mac 上会自动转 .icns；如需离线可复现可预生成 icon.icns
  category: public.app-category.productivity
  hardenedRuntime: true           # 启用 Hardened Runtime（公证前置；无证书时也建议开启）
  gatekeeperAssess: false         # 未签名/未公证时不卡 Gatekeeper 评估
  # identity: null                 # 显式跳过签名（本地无开发者证书时），见 §3.4
  artifactName: ${productName}-${version}-${arch}.${ext}

# ---------- Linux ----------
linux:
  target:
    - target: AppImage
      arch: [x64]
    - target: deb
      arch: [x64]
  icon: resources/icon.png        # AppImage 可用单张 PNG；deb 建议提供多尺寸 icons 目录（可选）
  category: Utility
  maintainer: prompt-scaffold-team <dev@example.com>   # deb 必填
  synopsis: 需求底稿与记忆记事本（本地桌面版）
  description: Prompt Scaffold —— 输入前维度清单澄清、长对话需求守门、记忆记事本（个人版，本地运行，零上传）
  artifactName: ${productName}-${version}-${arch}.${ext}
```

要点说明：
- **`directories.output: dist`** 与现有 `dist/` 目录重合没问题（electron-builder 清掉并重建）。如介意可改成 `release/`。
- **`electronDist` 必须删除**（R1）。
- mac 的 `category` 必填（否则打包警告/商店分类缺失）；linux 的 `maintainer` 是 **deb 打包硬性必填**，缺了直接报错。
- `arch: [x64, arm64]`：Apple Silicon 用户越来越多，mac 建议双架构；Win/Linux 先 x64（如需 arm64 后续加）。

### 3.2 本机能打什么、不能打什么

| 目标产物 | 本机（Windows）能打吗 | 说明 |
|---|---|---|
| Windows NSIS 安装包 `.exe` | ✅ 能 | `npm run dist:win`，本机唯一能「完整产出 + 本地实测」的安装包 |
| Linux `.AppImage` / `.deb` | 🟡 技术上 electron-builder 支持从 Windows 交叉产出（AppImage/deb 本质是归档+脚本，不依赖 mac 工具链），但**结果未经 Linux 实机验证，不保证** | 推荐走 Linux 原生 CI 打包（§3.3），本机交叉产出仅作临时验证 |
| macOS `.dmg` / `.zip` | ❌ 不能 | Apple 强制：dmg 制作与签名/公证必须在 macOS 上，Windows 无任何合法途径产出 |

**结论（转达用户）**：本机 = 只负责「Windows 安装包 + 三平台都能编译通过的代码」；Linux/mac 的安装包 = 用「同一套代码 + 三平台 CI」在对应系统上自动产出，用户只需在 GitHub 上配置一条流水线（或把仓库推到 GitLab/Gitee 用等价流水线）。

### 3.3 Linux / macOS 如何产出：三平台构建脚本 + CI 流水线

#### 3.3.1 `package.json` 补脚本（跨平台 npm 命令，替代平台专属 shell）

```jsonc
"scripts": {
  // ... 保留现有
  "dist:win":   "electron-vite build && electron-builder --win",
  "dist:mac":   "electron-vite build && electron-builder --mac",
  "dist:linux": "electron-vite build && electron-builder --linux",
  "dist:all":   "electron-vite build && electron-builder --win --mac --linux",
  "icons":      "python scripts/gen_icons.py"
}
```

> npm scripts 本身跨平台（npm 会调对应 shell），比手写三份 `.sh` 更省心；需要「本机一键三连」时再补 `.sh` 包装即可。

#### 3.3.2 GitHub Actions 三平台矩阵流水线（`.github/workflows/build.yml`）

```yaml
name: Build

on:
  push:
    tags: ['v*']
  workflow_dispatch:          # 允许手动触发

jobs:
  test:                       # 先跑静态 + 单测（三平台任一 OS 即可，选 linux 最快）
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test

  build:
    needs: test
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: windows-latest
            script: dist:win
            artifacts: dist/*.exe
          - os: macos-latest
            script: dist:mac
            artifacts: dist/*.dmg
          - os: macos-latest
            script: dist:mac
            artifacts: dist/*.zip
          - os: ubuntu-latest
            script: dist:linux
            artifacts: dist/*.AppImage
          - os: ubuntu-latest
            script: dist:linux
            artifacts: dist/*.deb
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run ${{ matrix.script }}
        env:
          # mac 无证书：显式跳过签名（个人版不公证）
          CSC_IDENTITY_AUTO_DISCOVERY: 'false'
      - name: Smoke test (Linux 无头跑主进程冒烟)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update && sudo apt-get install -y xvfb
          xvfb-run -a env PROMPT_SCAFFOLD_SMOKE=1 npm start
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.os }}-${{ matrix.script }}
          path: ${{ matrix.artifacts }}
          if-no-files-found: error
```

关键点：
- **三平台矩阵** = 用 `windows-latest` / `macos-latest` / `ubuntu-latest` 原生 runner，各平台原生打包（这是「别人电脑能用」的保证）。
- **先 `test` 后 `build`**：`typecheck + node:test` 通过才打包，把「跨平台静态正确性」前置为门禁。
- **Linux 冒烟**：用 `xvfb-run` 无头跑 `PROMPT_SCAFFOLD_SMOKE=1`（现有 `index.ts:36` 已内置该开关），验证主进程在 Linux 能正常引导。
- **mac 跳过签名**：`CSC_IDENTITY_AUTO_DISCOVERY: 'false'`（见 §3.4）。
- 如无 GitHub，等价替换为 GitLab CI / Gitee Go / 本地多台机器手动跑 `npm run dist:mac` / `dist:linux`。

### 3.4 mac 无签名时的处理（重要，用户会遇到）

个人版不公证是常态，产物在 mac 上首次打开会被 Gatekeeper 拦。三条路径按成本递增：

1. **不签名直接分发（零成本，首版够用）**：CI 里设 `CSC_IDENTITY_AUTO_DISCOVERY=false` 跳过签名。用户拿到 `.dmg` 后：
   - 方式 A（GUI）：Finder 右键 App →「打开」→ 再点「打开」，即可绕过一次。
   - 方式 B（命令行）：`xattr -cr /Applications/Prompt\ Scaffold.app`（清掉 quarantine 扩展属性）后正常双击。
   - 在 README/下载页写清这两步即可。
2. **自签名（开发调试用）**：`codesign --force --deep --sign - App.app`（ad-hoc 签名），仍需用户右键打开，不解决「陌生开发者」提示。
3. **正式签名 + 公证（正式对外发布）**：需要 Apple Developer Program（$99/年）开发者证书 + 公证 `xcrun notarytool`。建议「个人版先用 1，要正式对外再上 3」，把签名做成 CI 里可注入的 secret，代码不写死。

---

## 4. 平台差异点处理清单（统一收敛方案）

> 原则：**优先 Electron 跨平台 API 收敛**，实在收敛不了才 `onPlatform` 分支，且分支必须穷尽（§2.4）。

### 4.1 托盘图标（Tray）

| 平台 | 差异 | 统一处理 |
|---|---|---|
| Windows | 最好 `.ico`；PNG 也可但建议 16px | `getTrayIcon()`：Windows 优先 `resources/tray-icon.ico`，缺省 PNG `.resize(16,16)` |
| macOS | 必须**单色模板图**，16pt（Retina 32px），随菜单栏深浅色自动反色 | 用 `tray-iconTemplate.png` + `@2x`，`nativeImage.createFromPath` 后 `setTemplateImage(true)`，**不 resize** |
| Linux | GNOME 默认无托盘、需 appindicator；图标尺寸敏感 | PNG `.resize(16,16)`；`new Tray()` 包 try-catch，失败记日志降级为「仅窗口」不闪退（现有已实现，保留） |

### 4.2 菜单栏（mac 全局菜单 vs Win/Linux 托盘）

| 平台 | 形态 | 统一处理 |
|---|---|---|
| macOS | 顶部**全局菜单栏**（无窗口菜单），Cmd+C/V/Q/A 依赖它 | `if (IS_MAC)` 设最小应用菜单：`{role:'appMenu'}`(含 quit) + `{role:'editMenu'}`(含 copy/paste/selectAll)，并加「显示主窗口」项 |
| Windows/Linux | 菜单藏在窗口里，可 `autoHideMenuBar` 隐藏；托盘右键菜单是主要交互 | 保持 `autoHideMenuBar: true` + 现有托盘右键菜单（显示/隐藏/退出） |

### 4.3 通知（Notification / 提醒）

| 平台 | 差异 | 统一处理 |
|---|---|---|
| Windows | 必须先 `app.setAppUserModelId(APP_ID)`，否则通知不显示/不归组 | `notify.ts` 内先 `Notification.isSupported()`；发通知 try-catch，失败降级托盘气泡/状态栏 |
| macOS | 首次需系统通知授权，拒绝后静默失败 | 同上；可在「隐私/设置」里给「去系统设置开启」引导 |
| Linux | 走 libnotify，缺库会失败 | 同上降级；AppImage 用户通常自带，deb 可声明 `Depends: libnotify4`（可选） |

### 4.4 快捷键（全局唤起）

- 统一 `globalShortcut.register(accel, cb)`，**try-catch + 判断返回值**：返回 false（mac 未授权/冲突）→ 静默降级，UI 提示可改用托盘图标唤起。
- mac 首次注册失败时，可选弹一次「请到 系统设置→隐私与安全→辅助功能 授权」引导（一次性）。
- 用户可在设置里改键/关闭，避免与系统冲突。

### 4.5 文件对话框（dialog）

- 全部走 `dialog.showOpenDialog / showSaveDialog`（三平台原生对话框，Electron 已收敛）。
- 唯一要补：**filters 扩展名大小写**（Linux 大小写敏感，R11）→ 扩展名数组补大写变体。
- `defaultPath` 用相对文件名，由各平台对话框决定落点，✅。

### 4.6 截图遮罩（ScreenshotOverlay + ScreenshotService）

| 差异点 | 统一处理 |
|---|---|
| Retina/缩放 | `crop()` 前按 `display.scaleFactor` 换算：`physicalRect = rect * scaleFactor`，再用物理坐标 crop；`nativeToImageData` 保持返回物理像素 |
| 多显示器 | 首版维持主屏，但 `captureScreen()` 预留 `getAllDisplays()` 扩展点；遮罩窗口按 `primary.bounds` 定位 |
| mac 全屏/多 Space | 遮罩窗口加 `overlay.setAlwaysOnTop(true,'screen-saver')` + `overlay.setVisibleOnAllWorkspaces(true,{visibleOnFullScreen:true})`（仅 mac） |
| 取消交互 | 已用 Esc/右键（ScreenshotOverlay.tsx 已实现），跨平台 ✅；mac 上补 `Cmd+W`/`Esc` 关闭 |

### 4.7 代码沙箱（node:vm + 子进程）

- 统一 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 起子进程（R15），禁 `spawn('node')`。
- `--max-old-space-size` 与超时 kill 逻辑三平台一致；`kill` 用 `child.kill('SIGTERM')` 后超时再 `SIGKILL`（Windows 下两者等价，无副作用）。

---

## 5. 测试与验收策略

### 5.1 本机（Windows）怎么验证

1. `npm run typecheck`（主/渲染双 tsconfig 全绿）。
2. `npm test`（现有 `node:test` 单测全绿，覆盖 memory-io/store/parse/prompts/fallback/share-text 等纯函数）。
3. `npm run dev` 手测：托盘、截图、剪贴板、导入导出、AI 生成/总结、主题切换。
4. `npm run dist:win` 产出 exe → 安装 → 冒烟：托盘图标、窗口、通知（如已加）。
5. `PROMPT_SCAFFOLD_SMOKE=1 npm start`（可选）：验证主进程能引导后自动退出（现有开关）。

### 5.2 跨平台正确性如何「静态保证」

1. **平台穷尽分发**：`src/shared/platform.ts` 的 `onPlatform<Record<PlatformName,...>>` 用 TS 类型强制补全三平台（§2.4），杜绝「漏了 mac/linux 分支」。
2. **禁硬编码路径/平台串的守卫脚本**（当前无 ESLint，先上零依赖脚本，成本最低）——新增 `scripts/check-platform.mjs`，在 CI/`npm test` 前跑：

```js
// 伪代码：扫描 src/，命中即报错退出
// 规则1：字符串字面量含 'C:\' / 'C:/' / 双反斜杠 '\\'（排除 \n \t 转义）→ 报「硬编码 Windows 路径」
// 规则2：出现 PowerShell/cmd /c/chcp/regedit/HKEY_/register 字样 → 报「运行时禁止调平台专有命令」
// 规则3：process.platform === '...' / process.platform !== '...' 出现但不在 src/shared/platform.ts → 报「平台分支未集中」
// 规则4：path 拼接用了字符串 '+' 而非 path.join → 报「路径拼接必须用 path 模块」
```

3. **三平台 CI 门禁**（§3.3）：`typecheck + npm test + check-platform` 在三平台 runner 上全绿才允许打包，任何平台差异 bug 会在合并前被 CI 拦下。

### 5.3 「别人电脑能用」的保证手段（转达用户的核心承诺）

1. **零 native 依赖**：全栈纯 JS/WASM（openai、MiniSearch、pdfjs-dist、mammoth、jszip、node:vm），`npm ci` 在三平台都只装纯 JS 包，**从根源上消灭「这台机器能编译、那台编译不过」**。
2. **三平台原生 CI 冒烟**：每次发版在 `windows/macos/ubuntu` 原生 runner 上「编译 + 单测 + 主进程冒烟（Linux 用 xvfb）」三关全过，产物是**在目标系统上原生打出来的**，不是 Windows 上猜出来的。
3. **交叉检查清单**：发版前人工在三平台各过一遍 §4 的差异点（托盘/菜单/通知/快捷键/对话框/截图），作为 release checklist。

---

## 附：需要改动的文件清单（给工程师）

| 文件 | 动作 | 对应风险 |
|---|---|---|
| `electron-builder.yml` | 重写：删 `electronDist`、补 `mac/linux` 段 | R1/R2 |
| `package.json` | 补 `dist:mac/dist:linux/dist:all` 脚本 | §3.3.1 |
| `.github/workflows/build.yml` | 新增三平台矩阵 CI | §3.3.2 |
| `src/shared/platform.ts` | 新增平台常量 + `onPlatform` 穷尽分发 | §2.4 |
| `src/main/tray.ts` | 按平台选托盘图标 + mac 模板图 | R6 |
| `src/main/menu.ts`（新）/ `src/main/index.ts` | mac 设最小应用菜单；补 `setAppUserModelId` | R5/R8 |
| `src/main/screenshot.ts` | 处理 scaleFactor + mac 全屏遮罩层级 | R7 |
| `src/main/storage/store.ts` | 稳健跨平台原子写（Windows 覆盖语义） | R9 |
| `src/main/ipc.ts` | 文件对话框 filters 补大写扩展名 | R11 |
| `src/main/notify.ts` / `src/main/shortcut.ts`（新） | 通知/快捷键统一封装（记忆工具提醒/唤起用） | R16/R17 |
| `resources/` | 补 `tray-iconTemplate.png(+@2x)`、`icon.png` 升 512 | R3 |
| `scripts/check-platform.mjs`（新） | 平台守卫脚本 | §5.2 |
| `scripts/gen_icons.py` | （可选）升 512 输出；或新增 Node 版 | R4 |

---

*文档完 · 架构师 高见远（记忆工具 · 个人版三平台适配方案）*

#!/usr/bin/env node
/**
 * 跨平台守卫（零依赖）：扫描 src/，命中即报错退出（CROSS-PLATFORM-PLAN §5.2）。
 * 规则：
 *  R1 硬编码 Windows 盘符路径（如 C:\ / C:/）
 *  R2 运行时禁止调用平台专有命令（PowerShell / cmd / chcp / 注册表）
 *  R3 process.platform 散落（必须集中在 src/shared/platform.ts）
 *  R4 用字符串 '+' 拼接路径分隔符（必须用 path 模块）
 *  R5 electron-builder.yml 残留 electronDist（会毁掉 mac/linux 打包）
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, relative } from 'path'
import { fileURLToPath } from 'url'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const root = join(scriptDir, '..')
const srcDir = join(root, 'src')

/** 递归收集指定扩展名文件 */
function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, exts, out)
    else if (exts.some((e) => name.endsWith(e))) out.push(p)
  }
  return out
}

const files = walk(srcDir, ['.ts', '.tsx', '.js', '.mjs'])
const violations = []

// 精确规则（避免误伤转义序列与合法代码）
const reDrive = /\b[A-Za-z]:[\\/]/                       // 盘符 + 反斜杠/斜杠
// 仅匹配 Windows 命令外壳/注册表的真实调用，避免误伤「Cmd+C（mac 快捷键）」这类合法字样
const reForbidden = /\b(powershell|chcp|regedit)\b|HKEY_|reg\.exe|powershell\.exe|cmd\.exe|cmd\s*\/c/i
const rePlatform = /process\.platform/
const reSlashConcat = /['"`]\/['"`]\s*\+|\+\s*['"`]\/['"`]/

for (const file of files) {
  const rel = relative(root, file)
  const lines = readFileSync(file, 'utf-8').split(/\r?\n/)
  lines.forEach((line, i) => {
    const ln = i + 1
    if (reDrive.test(line)) {
      violations.push(`${rel}:${ln} — 硬编码盘符路径（${line.trim()}），应改用 path 模块`)
    }
    if (reForbidden.test(line)) {
      violations.push(`${rel}:${ln} — 禁止运行时调用平台专有命令（PowerShell/cmd/chcp/注册表）`)
    }
    if (rePlatform.test(line) && !rel.endsWith('platform.ts')) {
      violations.push(`${rel}:${ln} — process.platform 分支未集中到 src/shared/platform.ts`)
    }
    if (reSlashConcat.test(line)) {
      violations.push(`${rel}:${ln} — 路径拼接禁止用字符串 '+'，应使用 path 模块`)
    }
  })
}

// 打包配置守卫（R1：electronDist 残留会钉死 Windows 发行包）
const builderFile = join(root, 'electron-builder.yml')
if (statSync(builderFile, { throwIfNoEntry: false })) {
  const yml = readFileSync(builderFile, 'utf-8')
  // 仅匹配真实的 electronDist 配置项（行首键），忽略注释里的说明文字
  if (/^\s*electronDist\s*:/m.test(yml)) {
    violations.push('electron-builder.yml — 禁止配置 electronDist（会把本机 Windows Electron 发行目录钉死，破坏 mac/linux 打包）')
  }
}

if (violations.length > 0) {
  console.error(`[check-platform] 发现 ${violations.length} 处跨平台违例：\n`)
  for (const v of violations) console.error('  ✗ ' + v)
  console.error('')
  process.exit(1)
}

console.log(`[check-platform] 通过：已扫描 ${files.length} 个源文件，零跨平台违例。`)

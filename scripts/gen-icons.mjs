#!/usr/bin/env node
/**
 * 生成占位图标（Node 零依赖，替代 Python 脚本，去掉 CI 对 Python 的依赖，R4）。
 * 输出：
 *  - resources/icon.png                  512×512 彩色（单一来源，electron-builder 自动转 .ico/.icns）
 *  - resources/tray-icon.png             32×32 彩色（win/linux 托盘）
 *  - resources/tray-iconTemplate.png     16×16 单色模板（mac 托盘）
 *  - resources/tray-iconTemplate@2x.png  32×32 单色模板（mac Retina）
 * 品牌色蓝底 + 白色「脚手架」图形（两竖条 + 三横档）。
 */
import { deflateSync } from 'zlib'
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'resources'), { recursive: true })

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let crc = -1
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff]
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  // 每行前加 filter byte 0
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

// ---------- 图形 ----------
function inGlyph(x, y, size) {
  const left = x >= size * 0.28 && x <= size * 0.4
  const right = x >= size * 0.6 && x <= size * 0.72
  const rung1 = y >= size * 0.2 && y <= size * 0.28
  const rung2 = y >= size * 0.46 && y <= size * 0.54
  const rung3 = y >= size * 0.72 && y <= size * 0.8
  const inV = y >= size * 0.2 && y <= size * 0.8
  if ((left || right) && inV) return true
  if (x >= size * 0.28 && x <= size * 0.72 && (rung1 || rung2 || rung3)) return true
  return false
}

function makeIcon(size, template) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      if (template) {
        // 单色模板：图形为黑、其余透明（mac 随菜单栏深浅色自适应）
        rgba[i] = 0
        rgba[i + 1] = 0
        rgba[i + 2] = 0
        rgba[i + 3] = inGlyph(x, y, size) ? 255 : 0
      } else if (inGlyph(x, y, size)) {
        rgba[i] = 255
        rgba[i + 1] = 255
        rgba[i + 2] = 255
        rgba[i + 3] = 255
      } else {
        rgba[i] = 37
        rgba[i + 1] = 99
        rgba[i + 2] = 235
        rgba[i + 3] = 255
      }
    }
  }
  return encodePng(size, rgba)
}

const outputs = [
  ['icon.png', makeIcon(512, false)],
  ['tray-icon.png', makeIcon(32, false)],
  ['tray-iconTemplate.png', makeIcon(16, true)],
  ['tray-iconTemplate@2x.png', makeIcon(32, true)]
]

for (const [name, buf] of outputs) {
  writeFileSync(join(root, 'resources', name), buf)
}
console.log('icons generated: ' + outputs.map(([n]) => 'resources/' + n).join(', '))

import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

// The input must be a real, active macOS window capture (or a tightly cropped
// screenshot containing its top-left corner). Browser screenshots cannot see
// the AppKit-owned controls and must not be used as evidence here.
export async function inspectMacWindowImage(path) {
  const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const width = Math.min(info.width, 600), height = Math.min(info.height, 200)
  if (info.channels !== 3 || width < 100 || height < 50) throw new Error('Window capture is too small')
  const rgb = (x, y) => { const i = (y * info.width + x) * 3; return [data[i], data[i + 1], data[i + 2]] }
  const predicates = [
    (r, g, b) => r > 190 && g < 130 && b < 130,
    (r, g, b) => r > 200 && g > 130 && b < 90,
    (r, g, b) => r < 100 && g > 140 && b < 100,
  ]
  const groups = predicates.map(predicate => {
    const seen = new Uint8Array(width * height), result = []
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (seen[start] || !predicate(...rgb(x, y))) continue
      seen[start] = 1
      const queue = [start]; let minX = x, maxX = x, minY = y, maxY = y
      for (let at = 0; at < queue.length; at++) {
        const px = queue[at] % width, py = Math.floor(queue[at] / width)
        minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py)
        for (const [nx, ny] of [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]]) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const next = ny * width + nx
          if (!seen[next] && predicate(...rgb(nx, ny))) { seen[next] = 1; queue.push(next) }
        }
      }
      const w = maxX - minX + 1, h = maxY - minY + 1
      if (queue.length >= 25 && w >= 7 && w <= 80 && h >= 5 && h <= 80) result.push({ minX, maxX, minY, maxY, width: w, height: h, area: queue.length, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 })
    }
    return result
  })
  const candidates = []
  for (const red of groups[0]) for (const yellow of groups[1]) for (const green of groups[2]) {
    const size = (red.width + yellow.width + green.width) / 3
    const gaps = [yellow.cx - red.cx, green.cx - yellow.cx]
    if (gaps.every(gap => gap > size && gap < 3 * size) && Math.max(red.cy, yellow.cy, green.cy) - Math.min(red.cy, yellow.cy, green.cy) < size * 0.6) candidates.push([red, yellow, green])
  }
  candidates.sort((a, b) => b.reduce((n, c) => n + c.area, 0) - a.reduce((n, c) => n + c.area, 0))
  const controls = candidates[0]
  if (!controls) throw new Error('Three active macOS traffic lights were not found in the top-left of the capture')
  for (const control of controls) {
    const aspect = control.width / control.height
    if (aspect < 0.8 || aspect > 1.25) throw new Error(`A traffic light is squashed (${control.width}×${control.height} pixels)`)
  }
  const sizes = controls.map(c => (c.width + c.height) / 2)
  if (Math.max(...sizes) / Math.min(...sizes) > 1.2) throw new Error('Traffic lights have inconsistent sizes')
  const diameter = sizes.reduce((a, b) => a + b, 0) / sizes.length
  const centerY = controls.reduce((n, c) => n + c.cy, 0) / controls.length, green = controls[2]
  const xs = Math.ceil(green.maxX + diameter * 0.5), xe = Math.min(width - 1, Math.ceil(green.maxX + diameter * 8))
  const ys = Math.max(0, Math.floor(centerY - diameter * 0.65)), ye = Math.min(height - 1, Math.ceil(centerY + diameter * 2.5))
  let top = height, bottom = -1, count = 0
  for (let y = ys; y <= ye; y++) for (let x = xs; x <= xe; x++) {
    const [r, g, b] = rgb(x, y)
    if (r < 70 && g < 90 && b < 105) { top = Math.min(top, y); bottom = Math.max(bottom, y); count++ }
  }
  if (count < 15 || bottom < top) throw new Error('The Ovelle wordmark was not found beside the traffic lights')
  const offset = ((top + bottom) / 2 - centerY) / diameter
  if (Math.abs(offset) > 0.4) throw new Error(`Ovelle wordmark is vertically misaligned by ${offset.toFixed(2)} traffic-light diameters`)
  return { controls: controls.map(({ width: w, height: h }) => ({ width: w, height: h })), wordmarkOffsetInDiameters: offset }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) { console.error('Usage: node scripts/check-macos-window-visual.mjs <active-mac-window-capture.png>'); process.exitCode = 2 }
  else try { console.log('Native macOS window visual check passed:', await inspectMacWindowImage(process.argv[2])) }
  catch (error) { console.error(`Native macOS window visual check failed: ${error.message}`); process.exitCode = 1 }
}

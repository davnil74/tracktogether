/**
 * Generates PWA icons (192×192 and 512×512) into public/icons/.
 * Run once: node scripts/gen-icons.mjs
 * Requires: npm install -D canvas   (or just use the pre-generated PNGs)
 */
import { createCanvas } from 'canvas'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))

function drawIcon(size) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')
  const cx = size / 2, cy = size / 2
  const r = size * 0.42

  // Background
  ctx.fillStyle = '#1d4ed8'
  roundRect(ctx, 0, 0, size, size, size * 0.2)
  ctx.fill()

  // Pin body (teardrop)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.15, r * 0.55, 0, Math.PI * 2)
  ctx.fill()

  // Pin point
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.38, cy + r * 0.28)
  ctx.lineTo(cx + r * 0.38, cy + r * 0.28)
  ctx.lineTo(cx, cy + r * 0.88)
  ctx.closePath()
  ctx.fill()

  // Inner dot
  ctx.fillStyle = '#1d4ed8'
  ctx.beginPath()
  ctx.arc(cx, cy - r * 0.15, r * 0.25, 0, Math.PI * 2)
  ctx.fill()

  return canvas.toBuffer('image/png')
}

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

const outDir = join(__dir, '../public/icons')
writeFileSync(join(outDir, 'icon-192.png'), drawIcon(192))
writeFileSync(join(outDir, 'icon-512.png'), drawIcon(512))
console.log('Icons written to public/icons/')

// The D.V core: a ring around a centre, dim when idle, bright with a pulse ring while Claude works,
// red while a protocol has held an action this turn. The terminal draws it as Raster cells, the
// desktop and mobile apps as an SVG.

export type CoreState = 'idle' | 'working' | 'held'

export const CORE_COLUMNS = 24
export const CORE_ROWS = 11

const INK = { idle: 0x1f6f7a, working: 0x00e5ff, held: 0xff3b30 }
const HEX = { idle: '#1F6F7A', working: '#00E5FF', held: '#FF3B30' }
const TERMINAL_DEFAULT = 0x01000000

// Which glyph sits at a cell: terminal cells are about twice as tall as wide, so the y axis is halved
function glyph(column: number, row: number, state: CoreState, phase: number): number {
  const dx = (column - (CORE_COLUMNS - 1) / 2) / (CORE_COLUMNS / 2 - 1)
  const dy = (row - (CORE_ROWS - 1) / 2) / ((CORE_ROWS - 1) / 2)
  const d = Math.hypot(dx, dy)
  if (Math.abs(d - 1) < 0.14) return 0x25cf // ● the ring
  if (d < 0.12) return 0x25c9 // ◉ the centre
  if (state === 'working' && Math.abs(d - (0.35 + 0.15 * (phase % 4))) < 0.08) return 0x00b7 // · the pulse
  return 0x20
}

// Raster cells, base64 of little-endian u32 triplets [codePoint, fg, bg]
export function coreCells(state: CoreState, phase: number): string {
  const view = new DataView(new ArrayBuffer(CORE_COLUMNS * CORE_ROWS * 12))
  let at = 0
  for (let row = 0; row < CORE_ROWS; row++) {
    for (let column = 0; column < CORE_COLUMNS; column++) {
      view.setUint32(at, glyph(column, row, state, phase), true)
      view.setUint32(at + 4, INK[state], true)
      view.setUint32(at + 8, TERMINAL_DEFAULT, true)
      at += 12
    }
  }
  const bytes = new Uint8Array(view.buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

// The same core as an SVG; while working the pulse ring animates on its own (SMIL)
export function coreSvg(state: CoreState): string {
  const ink = HEX[state]
  const pulse =
    state === 'working'
      ? `<circle cx="80" cy="80" r="40" fill="none" stroke="${ink}" stroke-width="2" opacity="0.6">` +
        `<animate attributeName="r" values="28;56;28" dur="1.6s" repeatCount="indefinite"/>` +
        `<animate attributeName="opacity" values="0.8;0.1;0.8" dur="1.6s" repeatCount="indefinite"/></circle>`
      : ''
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">` +
    `<circle cx="80" cy="80" r="68" fill="none" stroke="${ink}" stroke-width="8"/>` +
    pulse +
    `<circle cx="80" cy="80" r="14" fill="${ink}"/>` +
    `</svg>`
  )
}

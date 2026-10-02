import { expect, test } from 'claude-code/testing'

const DIM = 0x1f6f7a
const CYAN = 0x00e5ff
const RED = 0xff3b30

const PANE = (surface = 'terminal') =>
  ({
    plugin: 'dv-hud',
    component: 'Pane',
    requestId: 'dv-core',
    surface,
    viewport: { columns: 140, rows: 40 },
    props: { title: 'D.V', isFocused: false, bodyColumns: 28, placement: 'dock', scroll: { offset: 0, bodyRows: 12 }, view: {} },
  }) as const

// the colours a Raster's drawn (non-blank) cells use; cells are little-endian u32 [codePoint, fg, bg]
function inks(cells: string): Set<number> {
  const bytes = atob(cells)
  const word = (i: number) =>
    (bytes.charCodeAt(i) | (bytes.charCodeAt(i + 1) << 8) | (bytes.charCodeAt(i + 2) << 16) | (bytes.charCodeAt(i + 3) << 24)) >>> 0
  const seen = new Set<number>()
  for (let i = 0; i < bytes.length; i += 12) if (word(i) !== 32) seen.add(word(i + 4))
  return seen
}

test('in the terminal the idle core is a dim ring', async ($, on) => {
  const ui = await $.ui.mount(PANE())
  const raster = await ui.find({ type: 'Raster' })
  expect(raster?.props.columns).toBe(24)
  expect(raster?.props.rows).toBe(11)
  expect([...inks(raster?.props.cells)]).toEqual([DIM])
})

test('the core is bright while Claude works and red once a push is held', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('session.cwd', () => ({ value: '/work/site' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/site\nd00d01\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { text: 'ok' } }))

  await $.turn.start({ text: 'ship it', turnId: 't1' })
  const working = await $.ui.mount(PANE())
  expect([...inks((await working.find({ type: 'Raster' }))?.props.cells)]).toEqual([CYAN])
  await working.unmount()

  await $.tool.call({ tool: 'Bash', command: ['git', 'push'].join(' ') })
  const held = await $.ui.mount(PANE())
  expect([...inks((await held.find({ type: 'Raster' }))?.props.cells)]).toEqual([RED])
})

test('on the desktop the core is an SVG that says its state', async ($, on) => {
  on('session.cwd', () => ({ value: '/work/site' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/site\n5eed01\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { text: 'ok' } }))

  await $.tool.call({ tool: 'Bash', command: ['git', 'push'].join(' ') })
  const ui = await $.ui.mount(PANE('desktop'))
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.alt).toBe('D.V core: a push is held')
  expect(svg?.props.source).toContain('#FF3B30')
})

test('a subagent finishing does not end the main turn', async ($, on) => {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  on('ui.toast', () => ({ value: undefined }))

  await $.turn.start({ text: 'fan out', turnId: 't1' })
  await $.turn.complete({ answer: 'sub done', durationMs: 5000, isAborted: false, turnId: 's1', agentId: 'sub1', reason: 'answer' })

  const ui = await $.ui.mount(PANE())
  expect([...inks((await ui.find({ type: 'Raster' }))?.props.cells)]).toEqual([CYAN])
})

test('/hud opens the D.V core pane', async ($, on) => {
  const opened: unknown[] = []
  on('ui.open', (_, e) => {
    opened.push(e.pane?.id ?? e.id)
    return { value: { isPlaced: true } }
  })

  await $.command.run({ command: 'hud', args: '' })

  expect(opened).toEqual(['dv-core'])
})

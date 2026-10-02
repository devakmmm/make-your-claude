import { expect, test } from 'claude-code/testing'

const ROW = (props: Record<string, unknown>, surface = 'terminal') =>
  ({
    plugin: 'dv-hud',
    component: 'ToolUse',
    requestId: 'row',
    surface,
    viewport: { columns: 100, rows: 30 },
    props: { tool_use_id: 'u1', isRunning: false, isErrored: false, isInterrupted: false, ...props },
  }) as const

const texts = async (ui) => (await ui.findAll({ type: 'Text' })).map((t) => t.text)

test('a finished tool call reads as a telemetry line', async ($, on) => {
  const ui = await $.ui.mount(ROW({ tool: 'Edit', input: { file_path: 'src/app.ts', old_string: 'a', new_string: 'b' } }))
  expect(await texts(ui)).toEqual(['▸', 'EDIT  ', 'src/app.ts', 'ok'])
})

test('a running command shows its first line and an ellipsis', async ($, on) => {
  const ui = await $.ui.mount(ROW({ tool: 'Bash', isRunning: true, input: { command: 'npm test\necho done' } }))
  expect(await texts(ui)).toEqual(['▸', 'BASH  ', 'npm test', '…'])
})

test('a failed call keeps the engine row, which carries the error', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['engine row'] }))
  const ui = await $.ui.mount(ROW({ tool: 'Bash', isErrored: true, input: { command: 'npm test' } }))
  expect(await texts(ui)).toEqual(['engine row'])
})

test('the spinner speaks as D.V and keeps the engine word', async ($, on) => {
  on('ui.render', (_, e) => ({ type: 'Text', props: {}, children: [e.props.word] }))
  const ui = await $.ui.mount({
    plugin: 'dv-hud',
    component: 'Spinner',
    requestId: 'spin',
    surface: 'terminal',
    viewport: { columns: 100, rows: 30 },
    props: { word: 'Pondering', message: null, suffix: '', mode: 'requesting' },
  })
  expect(await texts(ui)).toEqual(['D.V pondering'])
})

test('the desktop keeps its own tool rows', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['desktop row'] }))
  const ui = await $.ui.mount(ROW({ tool: 'Edit', input: { file_path: 'a.ts' } }, 'desktop'))
  expect(await texts(ui)).toEqual(['desktop row'])
})

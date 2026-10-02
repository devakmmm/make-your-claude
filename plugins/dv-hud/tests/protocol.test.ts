import { expect, test } from 'claude-code/testing'

const RAN = (stdout: string, exitCode = 0) => ({
  value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
})

test('the first push of a HEAD is held with the diff checklist, and the retry goes through', async ($, on) => {
  on('session.cwd', () => ({ value: '/work/site' }))
  on('process.run', () => RAN('/work/site\nabc123\n'))
  on('tool.call', () => ({ result: { text: 'pushed' } }))

  const first = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(first.deny).toContain('git diff')

  const retry = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  expect(retry.deny).toBeUndefined()
})

const BAND = {
  plugin: 'dv-hud',
  component: 'AbovePrompt',
  requestId: 'band',
  surface: 'terminal',
  viewport: { columns: 100, rows: 30 },
  props: { hasSurvey: false, isWorking: true, maxRows: 6, bodyColumns: 100, scroll: { offset: 0, bodyRows: 5 }, view: {} },
} as const

test('a held push turns the core red until the next turn starts', async ($, on) => {
  on('session.cwd', () => ({ value: '/work/site' }))
  on('process.run', () => RAN('/work/site\nc0ffee\n'))
  on('tool.call', () => ({ result: { text: 'pushed' } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'ship it', turnId: 't1' })
  await $.tool.call({ tool: 'Bash', command: 'git push' })
  const held = await $.ui.mount(BAND)
  expect((await held.find({ type: 'Text', text: '◉ D.V' }))?.props.color).toBe('red')
  await held.unmount()

  await $.turn.start({ text: 'ok, walked it', turnId: 't2' })
  const next = await $.ui.mount(BAND)
  expect((await next.find({ type: 'Text', text: '◉ D.V' }))?.props.color).toBe('cyan')
})

test('outside a repo a push goes through rather than being held on every retry', async ($, on) => {
  on('session.cwd', () => ({ value: '/tmp' }))
  on('process.run', () => RAN('', 128))
  on('tool.call', () => ({ result: { text: 'fatal: not a git repository' } }))

  const first = await $.tool.call({ tool: 'Bash', command: 'git push' })
  expect(first.deny).toBeUndefined()
})

test('git -C <dir> push checks the HEAD of the repo it names', async ($, on) => {
  const ranIn: unknown[] = []
  on('session.cwd', () => ({ value: '/work/notes' }))
  on('process.run', (_, e) => {
    ranIn.push(e.init?.cwd)
    return RAN('/work/other\nfeed42\n')
  })
  on('tool.call', () => ({ result: { text: 'pushed' } }))

  await $.tool.call({ tool: 'Bash', command: 'git -C /work/other push -u origin main' })
  expect(ranIn).toEqual(['/work/other'])
})

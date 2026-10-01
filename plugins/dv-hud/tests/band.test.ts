import { expect, mock, test } from 'claude-code/testing'

const BAND = {
  plugin: 'dv-hud',
  component: 'AbovePrompt',
  requestId: 'band',
  viewport: { columns: 100, rows: 30 },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 6,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 5 },
    view: {},
  },
} as const

test('the band shows context and rate-limit use from the last measurement', async ($, on) => {
  on('session.measure', ($, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { tokens: 84000, window: 200000, percent: 42 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 23.5 },
      { kind: 'seven_day', percentUsed: 7 },
    ],
    changed: ['context', 'rateLimits'],
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'ctx' }))?.text).toBe('CTX 42%')
  expect((await ui.find({ key: 'limits' }))?.text).toBe('5H 23.5% · 7D 7%')
})

test('the band names the session model in short form', async ($, on) => {
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ key: 'model' }))?.text).toBe('OPUS 5.5')
})

test('while Claude works the band counts the turn time, and hides it when idle', async ($, on) => {
  const clock = mock.clock(on)
  on('turn.start', ($, e) => ({ turnId: e.turnId }))

  await $.turn.start({ text: 'go', turnId: 't1' })
  await clock.advance(12000)

  const working = await $.ui.mount({ ...BAND, props: { ...BAND.props, isWorking: true }, surface: 'terminal' })
  expect((await working.find({ key: 'timer' }))?.text).toBe('T+00:12')
  await working.unmount()

  const idle = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await idle.find({ key: 'timer' })).toBeUndefined()
})

test('the band steps aside while a survey holds it', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['survey'] }))

  const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, hasSurvey: true }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'survey' })).toBeDefined()
  expect(await ui.find({ key: 'ctx' })).toBeUndefined()
})

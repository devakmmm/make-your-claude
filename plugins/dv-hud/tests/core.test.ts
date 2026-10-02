import { expect, test } from 'claude-code/testing'

test('/hud opens the D.V core pane', async ($, on) => {
  const opened: unknown[] = []
  on('ui.open', (_, e) => {
    opened.push(e.pane?.id ?? e.id)
    return { value: { isPlaced: true } }
  })

  await $.command.run({ command: 'hud', args: '' })

  expect(opened).toEqual(['dv-core'])
})

import { expect, test } from 'claude-code/testing'

test('/hud reports that the HUD is online', async ($, on) => {
  const answer = await $.command.run({ command: 'hud', args: '' })
  expect(answer.text).toBe('D.V HUD online')
})

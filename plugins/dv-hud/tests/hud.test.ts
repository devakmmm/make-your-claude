import { expect, test } from 'claude-code/testing'

test('/hud says D.V is online, who built it, and where to find him', async ($, on) => {
  const answer = await $.command.run({ command: 'hud', args: '' })
  expect(answer.text).toContain('D.V online. Built by Devak Mehta')
  expect(answer.text).toContain('https://devakmmm.github.io/')
})

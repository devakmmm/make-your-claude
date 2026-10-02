import { expect, test } from 'claude-code/testing'

test('every session opens with the D.V signature line', async ($, on) => {
  const logged: string[] = []
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('ui.log', (_, e) => {
    logged.push(e.text)
    return { value: undefined }
  })

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  expect(logged).toEqual(['◉ D.V online. Built by Devak Mehta. https://devakmmm.github.io/'])
})

test('/hud says D.V is online, who built it, and where to find him', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true } }))
  const answer = await $.command.run({ command: 'hud', args: '' })
  expect(answer.text).toContain('D.V online. Built by Devak Mehta')
  expect(answer.text).toContain('https://devakmmm.github.io/')
})

import { expect, test } from 'claude-code/testing'

const USAGE = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

test('/dv answers a question about this session from the session itself', async ($, on) => {
  const asked: string[] = []
  on('model.fork', (_, e) => {
    asked.push(e.prompt)
    return { value: { isAnswered: true, text: 'We changed a.ts and b.ts; tests pass.', usage: USAGE } }
  })

  const answer = await $.command.run({ command: 'dv', args: 'what did we change?' })

  expect(asked.length).toBe(1)
  expect(asked[0]).toContain('what did we change?')
  expect(answer.text).toBe('We changed a.ts and b.ts; tests pass.')
})

test('/dv with no question says how to ask, and asks the model nothing', async ($, on) => {
  let forks = 0
  on('model.fork', () => {
    forks++
    return { value: { isAnswered: true, text: 'x', usage: USAGE } }
  })

  const answer = await $.command.run({ command: 'dv', args: '  ' })

  expect(forks).toBe(0)
  expect(answer.text).toContain('/dv what did we change?')
})

test('/dv before anything has happened says there is nothing to ask about yet', async ($, on) => {
  on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))

  const answer = await $.command.run({ command: 'dv', args: 'what changed?' })

  expect(answer.text).toBe('Nothing to ask about yet. Ask once Claude has replied at least once.')
})

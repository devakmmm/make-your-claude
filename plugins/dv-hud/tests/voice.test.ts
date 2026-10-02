import { expect, test } from 'claude-code/testing'

// speech runs beside the turn, never holding it up; give it a moment to start
const settle = () => new Promise((r) => setTimeout(r, 20))

async function aTurn($, on) {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', () => ({ result: { text: 'ok' } }))
  on('ui.toast', () => ({ value: undefined }))
  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/a.ts', old_string: 'x', new_string: 'y' })
  await $.turn.complete({ answer: 'done', durationMs: 84000, isAborted: false, turnId: 't1', reason: 'answer' })
  await settle()
}

test('with the voice on, D.V says the briefing out loud in words', { options: { voice: true } }, async ($, on) => {
  const said: string[] = []
  on('audio.speak', (_, e) => {
    said.push(e.text)
    return { value: { via: 'system' } }
  })

  await aTurn($, on)

  expect(said).toEqual(['Done in 1 minute 24 seconds. 1 file changed.'])
})

test('the voice is off unless the person turns it on', async ($, on) => {
  const said: string[] = []
  on('audio.speak', (_, e) => {
    said.push(e.text)
    return { value: { via: 'system' } }
  })

  await aTurn($, on)

  expect(said).toEqual([])
})

test('where the engine has no voice, D.V uses Windows speech with the text on stdin', { options: { voice: true } }, async ($, on) => {
  const runs: { argv: string[]; stdin?: string }[] = []
  on('audio.speak', () => {
    throw new Error('$.audio.speak: no speech synthesizer on windows')
  })
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })

  await aTurn($, on)

  expect(runs.length).toBe(1)
  expect(runs[0].argv[0]).toBe('powershell')
  expect(runs[0].argv.join(' ')).toContain('System.Speech')
  expect(runs[0].argv.join(' ')).not.toContain('file changed')
  expect(runs[0].stdin).toBe('Done in 1 minute 24 seconds. 1 file changed.')
})

test('with the voice on, a held push is said out loud', { options: { voice: true } }, async ($, on) => {
  const said: string[] = []
  on('audio.speak', (_, e) => {
    said.push(e.text)
    return { value: { via: 'system' } }
  })
  on('session.cwd', () => ({ value: '/work/site' }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: '/work/site\nbeef01\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('tool.call', () => ({ result: { text: 'ok' } }))

  await $.tool.call({ tool: 'Bash', command: ['git', 'push'].join(' ') })
  await settle()

  expect(said).toEqual(['Push held. Walk the diff first.'])
})

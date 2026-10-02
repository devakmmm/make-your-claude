import { expect, test } from 'claude-code/testing'

// a turn that edits a.ts twice, writes b.ts, runs one command, and has a subagent edit c.ts
async function aTurn($, on) {
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: 'done' }))
  on('tool.call', () => ({ result: { text: 'ok' } }))

  await $.turn.start({ text: 'fix it', turnId: 't1' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/a.ts', old_string: 'x', new_string: 'y' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/a.ts', old_string: 'y', new_string: 'z' })
  await $.tool.call({ tool: 'Write', file_path: '/w/b.ts', content: 'b' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Edit', file_path: '/w/c.ts', old_string: 'x', new_string: 'y', agentId: 'sub1' })
  await $.turn.complete({ answer: 'done', durationMs: 12000, isAborted: false, turnId: 't1', reason: 'answer' })
}

test('when a turn ends D.V briefs what that turn did', async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await aTurn($, on)

  expect(toasts).toEqual(['D.V: Done in 12s. 2 files changed, 1 command run.'])
})

test('the briefing uses the wording the person set in the plugin settings', { options: { briefingTemplate: 'Sir, {files} files and {commands} commands in {time}.' } }, async ($, on) => {
  const toasts: string[] = []
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })

  await aTurn($, on)

  expect(toasts).toEqual(['D.V: Sir, 2 files and 1 commands in 12s.'])
})

import { expect, test } from 'claude-code/testing'
import { briefing } from '../hooks/briefing.ts'

const TURN = { files: 3, commands: 2, held: 1, ms: 84000 }

test('the default briefing says what the turn did', () => {
  expect(briefing(undefined, TURN)).toBe('Done in 1m 24s. 3 files changed, 2 commands run, 1 action held.')
})

test('counts of one read as one, and nothing held is left out', () => {
  expect(briefing(undefined, { files: 1, commands: 1, held: 0, ms: 9000 })).toBe('Done in 9s. 1 file changed, 1 command run.')
})

test('a turn that changed nothing says so plainly', () => {
  expect(briefing(undefined, { files: 0, commands: 0, held: 0, ms: 3000 })).toBe('Done in 3s.')
})

test('the person can write their own briefing with placeholders', () => {
  expect(briefing('Sir, {files} files touched and {held} pushes stopped in {time}.', TURN)).toBe(
    'Sir, 3 files touched and 1 pushes stopped in 1m 24s.'
  )
})

test('an unknown placeholder is left as written', () => {
  expect(briefing('{files} files, {mood}', TURN)).toBe('3 files, {mood}')
})

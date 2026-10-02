import { expect, test } from 'claude-code/testing'
import { pushTarget } from '../hooks/push.ts'

test('a plain push is a push in the session directory', () => {
  expect(pushTarget('git push origin main')).toEqual({ verb: 'git push', dir: undefined })
})

test('git -C <dir> push names the repo it pushes', () => {
  expect(pushTarget('git -C /work/site push -u origin main')).toEqual({ verb: 'git push', dir: '/work/site' })
})

test('a cd earlier in the command names the repo', () => {
  expect(pushTarget('cd /work/site && git push')).toEqual({ verb: 'git push', dir: '/work/site' })
})

test('opening a pull request counts', () => {
  expect(pushTarget('gh pr create --fill')).toEqual({ verb: 'gh pr create', dir: undefined })
})

test('a command that only quotes a push is not a push', () => {
  expect(pushTarget('echo "next: git push origin main" >> notes.txt')).toBeUndefined()
  expect(pushTarget("printf 'run gh pr create later'")).toBeUndefined()
})

test('other git commands are not pushes', () => {
  expect(pushTarget('git status && git log -1')).toBeUndefined()
  expect(pushTarget('git commit -m "push the fix"')).toBeUndefined()
})

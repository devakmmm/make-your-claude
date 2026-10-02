// Finds a push in a shell command by reading command words, not by substring: a push quoted in an
// echo is not a push, and `git -C <dir> push` or `cd <dir> && git push` names the repo it pushes.

export type PushTarget = { verb: 'git push' | 'gh pr create'; dir: string | undefined }

// What the model reads when its first push of a HEAD is held
export const PUSH_CHECKLIST =
  'D.V protocol: the first push of this HEAD is held. Walk the diff before it leaves the machine: ' +
  'run `git diff <base>...HEAD` and check that every hunk is intended, no comment was removed by accident, ' +
  'no unrelated file or formatting churn slipped in, and there are no secrets, debug prints or WIP markers. ' +
  'Then run the same command again; the retry goes through.'

// Splits a command into segments (at && || ; | and newlines) of words, keeping quoted text whole
function segments(command: string): string[][] {
  const out: string[][] = [[]]
  let word = ''
  let inWord = false
  let quote: string | undefined
  const endWord = () => {
    if (inWord) out[out.length - 1].push(word)
    word = ''
    inWord = false
  }
  for (let i = 0; i < command.length; i++) {
    const c = command[i]
    if (quote) {
      if (c === quote) quote = undefined
      else word += c
      continue
    }
    if (c === '"' || c === "'") {
      quote = c
      inWord = true
    } else if (c === ' ' || c === '\t') {
      endWord()
    } else if (c === '&' || c === '|' || c === ';' || c === '\n') {
      endWord()
      if (out[out.length - 1].length > 0) out.push([])
      if ((c === '&' || c === '|') && command[i + 1] === c) i++
    } else {
      word += c
      inWord = true
    }
  }
  endWord()
  return out.filter((s) => s.length > 0)
}

// git.exe, /usr/bin/git and git all name git
function isProgram(word: string, name: string): boolean {
  return word.replace(/\\/g, '/').split('/').pop()?.replace(/\.exe$/i, '') === name
}

export function pushTarget(command: string): PushTarget | undefined {
  let dir: string | undefined
  for (const words of segments(command)) {
    const [program, ...rest] = words
    if (program === 'cd' && rest[0] !== undefined) {
      dir = rest[0]
      continue
    }
    if (isProgram(program, 'git')) {
      let at = 0
      let gitDir = dir
      // global options before the subcommand: -C <dir>, -c <name=value>
      while (rest[at]?.startsWith('-')) {
        if (rest[at] === '-C') gitDir = rest[at + 1]
        at += rest[at] === '-C' || rest[at] === '-c' ? 2 : 1
      }
      if (rest[at] === 'push') return { verb: 'git push', dir: gitDir }
    }
    if (isProgram(program, 'gh') && rest[0] === 'pr' && rest[1] === 'create') {
      return { verb: 'gh pr create', dir }
    }
  }
  return undefined
}

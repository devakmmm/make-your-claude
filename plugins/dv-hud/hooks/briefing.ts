// What D.V says when a turn ends. Built from counts the mod saw itself (files it watched change,
// commands it watched run, actions a protocol held), so it can't claim anything that didn't happen.
// The person may replace the wording with their own template.

export type TurnCounts = { files: number; commands: number; held: number; ms: number }

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  return seconds < 60 ? seconds + 's' : Math.floor(seconds / 60) + 'm ' + (seconds % 60) + 's'
}

function count(n: number, one: string, many: string): string {
  return n + ' ' + (n === 1 ? one : many)
}

export function briefing(template: string | undefined, turn: TurnCounts): string {
  if (template !== undefined) {
    const values: Record<string, string> = {
      files: String(turn.files),
      commands: String(turn.commands),
      held: String(turn.held),
      time: duration(turn.ms),
    }
    return template.replace(/\{(\w+)\}/g, (whole, name) => values[name] ?? whole)
  }
  const parts = [
    turn.files > 0 ? count(turn.files, 'file changed', 'files changed') : '',
    turn.commands > 0 ? count(turn.commands, 'command run', 'commands run') : '',
    turn.held > 0 ? count(turn.held, 'action held', 'actions held') : '',
  ].filter(Boolean)
  return 'Done in ' + duration(turn.ms) + '.' + (parts.length ? ' ' + parts.join(', ') + '.' : '')
}

// What a telemetry row shows for a tool call: the tool's name in caps, padded so rows line up, and
// the one thing it acted on (a path, a command's first line, a search pattern).

const TARGET_FIELD = { Read: 'file_path', Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path', Bash: 'command', Grep: 'pattern', Glob: 'pattern', WebFetch: 'url' }
const WIDTH = 60

export function rowName(tool: string): string {
  return tool.toUpperCase().padEnd(6)
}

export function rowTarget(tool: string, input: Record<string, unknown> | undefined): string {
  const value = input?.[TARGET_FIELD[tool]]
  if (typeof value !== 'string') return ''
  const line = value.split('\n')[0]
  return line.length > WIDTH ? line.slice(0, WIDTH - 1) + '…' : line
}

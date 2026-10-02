import { briefing } from './briefing.ts'
import { PUSH_CHECKLIST, pushTarget } from './push.ts'
import { WINDOWS_SPEAK, spoken } from './voice.ts'

// D.V is the product's name, not a setting: the signature and link are fixed
const SIGNATURE = 'D.V online. Built by Devak Mehta'
const HOME = 'https://devakmmm.github.io/'

const LIMIT_LABELS = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }

// The last figures session.measure reported, shared with the band's render hook
let usage = { context: undefined, rateLimits: [] }
let model = ''
let turnStartedAt = undefined
let ticker = undefined
// "<repo root>\n<HEAD>" of every push already held once this session
const heldHeads = new Set()
// a protocol held an action this turn: the core shows red until the next turn starts
let heldThisTurn = false
// what the main loop did this turn, for the briefing: files changed, commands run, actions held
const FILE_TOOLS = { Edit: 'file_path', Write: 'file_path', NotebookEdit: 'notebook_path' }
let turnFiles = new Set()
let turnCommands = 0
let turnHeld = 0

function elapsedText(ms) {
  const seconds = Math.floor(ms / 1000)
  return 'T+' + String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0')
}

// claude-opus-5-5 -> OPUS 5.5; anything else is shown as given, upper-cased
function modelText(id) {
  const parts = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(id)
  return parts ? parts[1].toUpperCase() + ' ' + parts[2] + '.' + parts[3] : id.toUpperCase()
}

function contextText(context) {
  return context?.percent === undefined ? 'CTX --' : 'CTX ' + context.percent + '%'
}

function limitsText(rateLimits) {
  return rateLimits
    .map((limit) => (LIMIT_LABELS[limit.kind] ?? limit.kind.toUpperCase()) + ' ' + limit.percentUsed + '%')
    .join(' · ')
}

// Speaks with the engine's voice, or Windows speech where the engine has none; a failure is logged
// to the debug log and never reaches the turn
async function say($, text) {
  const words = spoken(text)
  try {
    await $.audio.speak(words)
    return
  } catch (engineError) {
    try {
      const run = await $.process.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', WINDOWS_SPEAK], {
        stdin: words,
        timeoutMs: 60000,
      })
      if (run.exitCode === 0) return
      $.ui.log('D.V voice: no synthesizer spoke (' + String(engineError) + '; powershell exit ' + run.exitCode + ')', { to: 'debug' })
    } catch (fallbackError) {
      $.ui.log('D.V voice: no synthesizer spoke (' + String(engineError) + '; ' + String(fallbackError) + ')', { to: 'debug' })
    }
  }
}

export function register(on, options) {
  // counts a tool call once it has run; subagents' calls and held calls are not the turn's own work
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined && result?.deny === undefined) {
      const path = e[FILE_TOOLS[e.tool]]
      if (path) turnFiles.add(path)
      if (e.tool === 'Bash') turnCommands++
    }
    return result
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show the D.V HUD status' })
    model = await $.session.model()
    $.ui.log('◉ ' + SIGNATURE + '. ' + HOME)
    return next(e)
  })

  on('command.run', { command: 'hud' }, async () => {
    return { text: SIGNATURE + '\n' + HOME }
  })

  // The push protocol: hold the first push (or PR) of each HEAD once, with the diff checklist as the
  // reason; the retry goes through. Not a repo, or git fails: let it through rather than wedge.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const target = pushTarget(e.command ?? '')
    if (target === undefined) return next(e)
    const git = await $.process.run(['git', 'rev-parse', '--show-toplevel', 'HEAD'], {
      cwd: target.dir ?? (await $.session.cwd()),
    })
    const key = git.stdout.trim()
    if (git.exitCode !== 0 || key === '' || heldHeads.has(key)) return next(e)
    heldHeads.add(key)
    heldThisTurn = true
    turnHeld++
    $.ui.invalidate('ui.render')
    if (options?.voice) void say($, 'Push held. Walk the diff first.')
    return { deny: PUSH_CHECKLIST }
  })

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    heldThisTurn = false
    turnFiles = new Set()
    turnCommands = 0
    turnHeld = 0
    turnStartedAt = await $.clock.now()
    ticker?.cancel()
    // Redraw once a second so the turn timer moves
    ticker = $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    ticker?.cancel()
    ticker = undefined
    if (e.agentId === undefined && !e.isAborted) {
      const counts = { files: turnFiles.size, commands: turnCommands, held: turnHeld, ms: e.durationMs }
      const text = briefing(options?.briefingTemplate || undefined, counts)
      $.ui.toast('D.V: ' + text)
      // spoken beside the turn, never holding it up
      if (options?.voice) void say($, text)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    const timer =
      e.props.isWorking && turnStartedAt !== undefined
        ? [Box({ key: 'timer', children: Text({ color: 'cyan', children: elapsedText((await $.clock.now()) - turnStartedAt) }) })]
        : []
    return Box({
      gap: 2,
      children: [
        Text({ color: heldThisTurn ? 'red' : 'cyan', bold: true, children: '◉ D.V' }),
        Box({ key: 'ctx', children: Text({ color: 'cyan', children: contextText(usage.context) }) }),
        Box({ key: 'limits', children: Text({ color: 'cyan', children: limitsText(usage.rateLimits) }) }),
        Box({ key: 'model', children: Text({ color: 'cyan', children: modelText(model) }) }),
        ...timer,
      ],
    })
  })
}

import { briefing } from './briefing.ts'
import { CORE_COLUMNS, CORE_ROWS, coreCells, coreSvg } from './core.ts'
import { PUSH_CHECKLIST, pushTarget } from './push.ts'
import { rowName, rowTarget } from './rows.ts'
import { WINDOWS_SPEAK, spoken } from './voice.ts'

// D.V is the product's name, not a setting: the signature and link are fixed
const SIGNATURE = 'D.V online. Built by Devak Mehta'
const HOME = 'https://devakmmm.github.io/'
const CORE_PANE = 'dv-core'
const CORE_ALT = { idle: 'D.V core: idle', working: 'D.V core: working', held: 'D.V core: a push is held' }

const DV_PROMPT =
  'Answer in a few plain sentences, using only what this session shows. ' +
  'If the session does not show it, say so instead of guessing. Question: '
const DV_USAGE = 'Ask D.V about this session, like `/dv what did we change?`. It answers from the session itself, on your own usage.'
const DV_UNANSWERED = {
  'nothing-to-fork': 'Nothing to ask about yet. Ask once Claude has replied at least once.',
  'empty-reply': 'D.V had no answer to that.',
  aborted: 'Stopped.',
  'api-error': 'D.V could not reach the model just now. Try again.',
}

const LIMIT_LABELS = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }

// The last figures session.measure reported, shared with the band's render hook
let usage = { context: undefined, rateLimits: [] }
let model = ''
let turnStartedAt = undefined
let ticker = undefined
// Claude is working a turn; the frame counter moves the core's pulse
let working = false
let frame = 0
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
    await $.command.register({ name: 'dv', description: 'Ask D.V about this session', argumentHint: '<question>' })
    model = await $.session.model()
    $.ui.log('◉ ' + SIGNATURE + '. ' + HOME)
    return next(e)
  })

  // /dv <question>: one tool-less answer over this session's own transcript, kept out of the chat
  on('command.run', { command: 'dv' }, async ($, e) => {
    const question = (e.args ?? '').trim()
    if (question === '') return { text: DV_USAGE }
    const reply = await $.model.fork({ prompt: DV_PROMPT + question })
    if (reply.isAnswered) return { text: reply.text }
    return { text: DV_UNANSWERED[reply.reason] ?? 'D.V could not answer (' + reply.reason + ').' }
  })

  on('command.run', { command: 'hud' }, async ($) => {
    await $.ui.open({ id: CORE_PANE, title: 'D.V', columns: 28, rows: 12 })
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
    working = true
    turnFiles = new Set()
    turnCommands = 0
    turnHeld = 0
    turnStartedAt = await $.clock.now()
    ticker?.cancel()
    // Redraw four times a second so the turn timer and the core's pulse move
    ticker = $.clock.every(250, () => {
      frame++
      $.ui.invalidate('ui.render')
    })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    ticker?.cancel()
    ticker = undefined
    working = false
    if (e.agentId === undefined && !e.isAborted) {
      const counts = { files: turnFiles.size, commands: turnCommands, held: turnHeld, ms: e.durationMs }
      const text = briefing(options?.briefingTemplate || undefined, counts)
      $.ui.toast('D.V: ' + text)
      // spoken beside the turn, never holding it up
      if (options?.voice) void say($, text)
    }
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: CORE_PANE }, async ($, e) => {
    const state = heldThisTurn ? 'held' : working ? 'working' : 'idle'
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      return Raster({ key: 'core', columns: CORE_COLUMNS, rows: CORE_ROWS, cells: coreCells(state, frame) })
    }
    // the desktop, mobile and VS Code draw SVG; its pulse animates itself
    const { Svg } = $.ui.resolve(e)
    return Svg({ source: coreSvg(state), alt: CORE_ALT[state], width: 160, height: 160, isInteractive: true })
  })

  // Tool-call rows as telemetry lines in the terminal; an error or interruption keeps the engine's
  // own row, which carries the detail. Other surfaces draw their own tool UI.
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isErrored || e.props.isInterrupted) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    return Box({
      gap: 1,
      children: [
        Text({ color: 'cyan', children: '▸' }),
        Text({ color: 'cyan', bold: true, children: rowName(e.props.tool) }),
        Text({ children: rowTarget(e.props.tool, e.props.input) }),
        Text({ dimColor: true, children: e.props.isRunning ? '…' : 'ok' }),
      ],
    })
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, word: 'D.V ' + e.props.word.toLowerCase() } })
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

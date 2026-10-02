// D.V is the product's name, not a setting: the signature and link are fixed
const SIGNATURE = 'D.V online. Built by Devak Mehta'
const HOME = 'https://devakmmm.github.io/'

const LIMIT_LABELS = { five_hour: '5H', seven_day: '7D', spend_limit: 'SPEND' }

// The last figures session.measure reported, shared with the band's render hook
let usage = { context: undefined, rateLimits: [] }
let model = ''
let turnStartedAt = undefined
let ticker = undefined

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

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show the D.V HUD status' })
    model = await $.session.model()
    $.ui.log('◉ ' + SIGNATURE + '. ' + HOME)
    return next(e)
  })

  on('command.run', { command: 'hud' }, async () => {
    return { text: SIGNATURE + '\n' + HOME }
  })

  on('session.measure', async ($, e, next) => {
    usage = { context: e.context, rateLimits: e.rateLimits }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    turnStartedAt = await $.clock.now()
    ticker?.cancel()
    // Redraw once a second so the turn timer moves
    ticker = $.clock.every(1000, () => $.ui.invalidate('ui.render'))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    ticker?.cancel()
    ticker = undefined
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
        Text({ color: 'cyan', bold: true, children: '◉ D.V' }),
        Box({ key: 'ctx', children: Text({ color: 'cyan', children: contextText(usage.context) }) }),
        Box({ key: 'limits', children: Text({ color: 'cyan', children: limitsText(usage.rateLimits) }) }),
        Box({ key: 'model', children: Text({ color: 'cyan', children: modelText(model) }) }),
        ...timer,
      ],
    })
  })
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hud', description: 'Show the D.V HUD status' })
    return next(e)
  })

  on('command.run', { command: 'hud' }, async () => {
    return { text: 'D.V HUD online' }
  })
}

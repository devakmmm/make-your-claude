// D.V's voice: the system's own synthesizer, so nothing is sent anywhere. The engine's $.audio.speak
// speaks on macOS (and where a browser voice exists); on Windows it rejects, so D.V falls back to
// Windows' System.Speech through PowerShell, with the text on stdin and never in the command line.
// say() itself lives in register.ts: the engine follows $ only into functions declared in that file.

export const WINDOWS_SPEAK =
  'Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; ' +
  '$s.Speak([Console]::In.ReadToEnd()); $s.Dispose()'

// "1m 24s" reads as "1 minute 24 seconds"
export function spoken(text: string): string {
  const unit = (one: string, many: string) => (_: string, n: string) => n + ' ' + (n === '1' ? one : many)
  return text.replace(/\b(\d+)m\b/g, unit('minute', 'minutes')).replace(/\b(\d+)s\b/g, unit('second', 'seconds'))
}

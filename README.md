# make-your-claude

**D.V**, a heads-up display mod for [Claude Code](https://claude.com/claude-code), and six Python
hooks that make it check its own work. Built by Devak Mehta ([devakmmm.github.io](https://devakmmm.github.io/)).

## D.V

D.V turns a Claude Code session into a heads-up display that also does a few jobs.

- **The band** above the prompt: context used, rate limits, the model, and a turn timer while
  Claude works.
- **Tool calls as telemetry lines** in the terminal (`▸ EDIT  src/app.ts  ok`). A failed call
  keeps the engine's full row, with its error.
- **The core**, a pane opened with `/hud`: a ring that pulses while Claude works and turns red when
  a protocol holds an action. Terminal cells in the terminal, an SVG in Claude Code Desktop and the
  mobile app.
- **Briefings.** When a turn ends, D.V says what the turn did: "Done in 1m 24s. 3 files changed,
  2 commands run, 1 action held." It counts only what it watched happen, so it can't report work
  that didn't happen. You can write your own wording.
- **The push protocol.** The first `git push` or `gh pr create` of each HEAD is held with a
  diff-review checklist, and the retry goes through. It reads the command's words, so
  `git -C <dir> push` and `cd <dir> && git push` are caught, and a push quoted inside an `echo` is
  not. Outside a git repo nothing is held.
- **`/dv <question>`** asks D.V about the session, like `/dv what did we change?`. It answers from
  the session's own transcript, outside the chat, on your own usage.
- **Voice**, off by default: briefings and held pushes said out loud with your system's own voice
  (`say` on macOS, the built-in System.Speech voices on Windows).

### Install

Needs Claude Code 2.1.287 or later. Mods are early access and may change between releases.

```
claude plugin marketplace add devakmmm/make-your-claude
claude plugin install dv-hud@make-your-claude
```

Then use `claude` in a terminal, or Claude Code Desktop. Type `/hud` to open the core.

If you also run the Python `pr_diff_reminder.py` hook below, a push is held twice. Keep one.

### Settings

`claude plugin configure dv-hud` shows them.

| Setting | What it does | Default |
|---|---|---|
| `briefingTemplate` | Your wording for the end-of-turn briefing. Placeholders: `{files}`, `{commands}`, `{held}`, `{time}` | D.V's own wording |
| `voice` | Say briefings and held pushes out loud | off |

### What it sends

Nothing of its own. D.V runs inside Claude Code and makes no network calls;
`claude plugin validate --strict` lists every call it makes. `/dv` is an ordinary model request on
your account. The voice is your operating system's.

### Tests

```
cd plugins/dv-hud
claude plugin test .
```

## The hooks (Python)

Six small hooks for Claude Code that enforce working discipline the model cannot be trusted to keep
on its own. Python 3.10+, standard library only, tested on Windows and Linux. Used daily on a real
codebase before being published.

| Hook | Event | What it does |
|---|---|---|
| `stop_verify_claims.py` | Stop | Blocks the end of a turn once, until the agent states whether it made verifiable factual claims and either cites its evidence or verifies them. Fires once per turn, never loops. |
| `pr_diff_reminder.py` | PreToolUse (Bash) | Denies the **first** `git push` / `gh pr create` per (repo, HEAD) with a diff-walk checklist as the reason. The retry goes through. |
| `comment_preservation.py` | PostToolUse (Edit/Write) | Warns when an edit removed comment lines that existed before. Skips prose files. |
| `edit_landed_check.py` | PostToolUse (Edit/Write) | Re-reads the file after the tool reports success and warns if the change did not land. |
| `psql_readonly_guard.py` | PreToolUse (Bash) | Denies any raw `psql` (including inside `wsl`, `sudo`, `bash -c`, pipes, absolute paths); only your read-only wrapper script is allowed through. |
| `orchestration_vagueness_gate.py` | UserPromptSubmit | When a prompt asks for heavy multi-agent orchestration but names no file, ticket, symbol, steps or error, injects a "plan first" reminder. `force:` or `!` bypasses. |

### Why these six

Each one exists because of a real failure that a prompt did not prevent:

- An agent handed back a confident root cause that was wrong. A Stop hook is the only event that
  fires at hand-back, so that is where the "did you verify this?" question has to live.
- A PR shipped with comments silently deleted. A PostToolUse hook that only writes a `systemMessage`
  never reaches the model; these emit `additionalContext` too, so the model acts on it.
- An "advisory" checklist for pushes was invisible to the model for months. A PreToolUse deny
  *reason* is fed back to the model, so the first push is held with the checklist and the second
  passes.
- An Edit reported success and never landed on disk. Now the disk is re-read every time.
- A database login that is read-only by convention is one forgotten flag from a write. The wrapper
  script is the only path; everything else is denied.

### Install

Copy `hooks/` somewhere stable and register the hooks in `~/.claude/settings.json` (or a
project's `.claude/settings.json`). Adjust the paths.

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "python /path/to/hooks/orchestration_vagueness_gate.py", "timeout": 15 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "python /path/to/hooks/stop_verify_claims.py", "timeout": 3 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|NotebookEdit", "hooks": [ { "type": "command", "command": "python /path/to/hooks/comment_preservation.py", "timeout": 3 } ] },
      { "matcher": "Edit|Write", "hooks": [ { "type": "command", "command": "python /path/to/hooks/edit_landed_check.py", "timeout": 3 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "python /path/to/hooks/pr_diff_reminder.py", "timeout": 3 } ] },
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "python /path/to/hooks/psql_readonly_guard.py", "timeout": 3 } ] }
    ]
  }
}
```

The hooks import `hook_output.py` from their own directory, so keep the folder together.

### Configuration (environment variables, all optional)

| Variable | Used by | Default |
|---|---|---|
| `CLAUDE_VERIFY_CLAIMS_STATE_DIR` | stop_verify_claims | `hooks/.state/` |
| `CLAUDE_PR_DIFF_STATE_DIR` | pr_diff_reminder | `hooks/.state/` |
| `PR_MISTAKES_LOG` | pr_diff_reminder | unset (the checklist then says "if this project keeps a log…") |
| `PSQL_READONLY_WRAPPER` | psql_readonly_guard | `rosql.sh` |

### Tests

```
python -m pytest tests -q
```

### Design notes

- **Deterministic detection, latent judgment.** Hooks detect a condition and hand the decision to
  the model with a reason. They never try to reason about the content themselves.
- **Fail open.** Every hook exits 0 on any error and never wedges the session. State-tracking
  failures pass the action through rather than blocking it.
- **Once, not always.** The two blocking hooks hold an action exactly once per turn or per HEAD.
  A gate that nags on every turn gets ignored.
- **UTF-8 on Windows.** Hook payloads are UTF-8 but Windows Python decodes stdin as cp1252;
  `hook_output.read_stdin_utf8` reads raw bytes so non-ASCII edits are compared correctly.

## License

MIT.

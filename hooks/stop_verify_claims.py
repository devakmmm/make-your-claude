#!/usr/bin/env python3
"""Stop hook — claim-verification forcing function.

Fires when the agent tries to end a turn. Injects a BLOCKING reminder that
forces the agent to decide, out loud, whether the turn it just produced
asserted verifiable factual claims (a root cause, an existence/absence claim,
a "this fixes it") — and, if so, whether they were actually verified.

This is the deterministic half of a two-part discipline:
  - This hook = forcing function. It cannot read the answer or judge claims
    (hooks don't reason). It can only make the agent stop and decide, so that
    SKIPPING verification becomes a visible, stateable choice instead of
    silent momentum — which is the original failure mode.
  - The verification itself is latent work: extract the claims and have a
    fresh, zero-context subagent try to refute each one against the real
    code or data. Wire that up however your setup allows (a skill, a prompt,
    a subagent); the hook only insists that the decision is made.

Why a Stop hook and not PreToolUse: the failure happens at HANDBACK — the
moment the agent returns a confident factual answer. Stop is the only event
that fires there.

Anti-nag design: the hook blocks at most ONCE per turn. It writes a marker
keyed to the transcript path + a per-turn key so a second Stop in the same
turn (after the agent has addressed it) passes through silently. The agent
answers "no verifiable claims" or "already verified inline" and proceeds —
the hook's job is to force the decision, not to demand a subagent on every
turn.

Config (environment):
  CLAUDE_VERIFY_CLAIMS_STATE_DIR  where the once-per-turn marker lives
                                  (default: a .state/ dir next to this file)

JSON protocol: prints {"decision": "block", "reason": "..."} to block the
stop and feed `reason` back to the agent. On any error, exits 0 (never wedge
the session on a hook bug).
"""
import json
import os
import sys


from hook_output import read_stdin_utf8
STATE_DIR = os.environ.get("CLAUDE_VERIFY_CLAIMS_STATE_DIR") or os.path.join(
    os.path.dirname(os.path.abspath(__file__)), ".state"
)

REASON = (
    "CLAIM-VERIFICATION GATE — decide before ending this turn:\n"
    "\n"
    "Did the answer you just produced ASSERT a verifiable factual claim about "
    "the system? Specifically any of:\n"
    "  - a root cause / diagnosis ('X happened because Y')\n"
    "  - an existence or absence claim ('Z is missing', 'there is no handler', "
    "'the column doesn't exist')\n"
    "  - a 'this fixes it' remediation whose correctness depends on the system "
    "behaving as you described\n"
    "  - a factual assertion you're advising a stakeholder to act on\n"
    "\n"
    "Pick exactly one and state it explicitly in your next message:\n"
    "\n"
    "  (A) NO verifiable claims — this was planning / conversation / design / "
    "opinion. Say so in one line and end. (This is a valid, common answer — "
    "do NOT manufacture a verification step that isn't warranted.)\n"
    "\n"
    "  (B) Claims present AND already verified THIS session — you read the "
    "file / ran the query. Cite the evidence (file:line or query result) "
    "inline and end.\n"
    "\n"
    "  (C) Claims present and NOT yet verified — verify them now: extract each "
    "claim and try to refute it against the real code or data (a fresh, "
    "zero-context subagent is best if you have one). Correct REFUTED claims, "
    "label UNVERIFIABLE ones inline ('⚠ unverified — why'), and append a short "
    "verification ledger. Do NOT hand back unverified claims with only an "
    "OFFER to check them — that is the exact failure this gate exists to prevent.\n"
    "\n"
    "If you genuinely cannot verify (no DB access, stale snapshot, expired "
    "logs): keep the claim, label it '⚠ unverified — <why>' inline, and "
    "proceed — do not stall. Then this gate is satisfied."
)


def transcript_turn_key(transcript_path: str) -> str:
    """Line count of the transcript right now — changes every turn."""
    try:
        with open(transcript_path, "rb") as f:
            return f"L{sum(1 for _ in f)}"
    except OSError:
        return "L?"


def already_fired(transcript_path: str, stop_count) -> bool:
    """One block per (transcript, stop_count). Returns True if we've already
    blocked for this exact turn — so addressing it and re-stopping passes through.
    """
    key = f"{os.path.basename(transcript_path or 'unknown')}::{stop_count}"
    marker = os.path.join(STATE_DIR, ".verify_claims_fired")
    try:
        if os.path.exists(marker):
            with open(marker, encoding="utf-8") as f:
                if key in f.read().splitlines():
                    return True
        os.makedirs(STATE_DIR, exist_ok=True)
        with open(marker, "a", encoding="utf-8") as f:
            f.write(key + "\n")
    except OSError:
        # If we can't track state, fail open (don't block) to avoid a wedge.
        return True
    return False


def main() -> None:
    try:
        payload = json.loads(read_stdin_utf8())
    except Exception:
        sys.exit(0)

    if payload.get("hook_event_name") != "Stop":
        sys.exit(0)

    # Respect the harness's own loop-guard: if this Stop was itself triggered
    # by a prior hook block, don't re-block (prevents infinite Stop loops).
    if payload.get("stop_hook_active"):
        sys.exit(0)

    transcript = payload.get("transcript_path", "")
    # The harness does not send stop_count (every ledger key was `::0`, so the
    # gate fired once per SESSION — audit 2026-09-23). The transcript's current
    # line count is a per-turn key: it grows every turn, and the re-stop right
    # after a block is already let through by stop_hook_active above.
    stop_count = payload.get("stop_count") or transcript_turn_key(transcript)

    if already_fired(transcript, stop_count):
        sys.exit(0)

    print(json.dumps({"decision": "block", "reason": REASON}))
    sys.exit(0)


if __name__ == "__main__":
    main()

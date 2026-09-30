#!/usr/bin/env python3
"""PreToolUse hook for Bash — walk the diff before the first push / PR create.

Fires when the agent is about to run `gh pr create` or `git push`. The FIRST
attempt per (repo, HEAD) is denied with a review checklist as the reason —
a deny reason is fed back to the model, so the checklist is actually seen.
After walking the diff, the same command goes through.

Config (environment):
  CLAUDE_PR_DIFF_STATE_DIR  where the "already held" ledger lives
                            (default: a .state/ dir next to this file)
  PR_MISTAKES_LOG           optional path to your project's log of past PR
                            review mistakes; named in the checklist if set
"""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path
import re
import sys


from hook_output import read_stdin_utf8
TRIGGERS = [
    re.compile(r"\bgh\s+pr\s+create\b"),
    re.compile(r"\bgit\s+push\b"),
]


def _checklist() -> str:
    log = os.environ.get("PR_MISTAKES_LOG")
    step1 = (
        f"1. READ the PR mistakes log: `{log}`. It catalogs every mistake a reviewer has "
        "flagged in past PRs — scan every category and ask 'did I do any of these?'\n"
        if log else
        "1. If this project keeps a log of past PR review mistakes, read it first and ask "
        "'did I do any of these?'\n"
    )
    return (
        "PR / PUSH REVIEW — MANDATORY BEFORE PROCEEDING:\n"
        + step1 +
        "2. Run `git diff` (uncommitted) AND `git diff <base>...HEAD` (branch diff vs base).\n"
        "3. Walk through every hunk. For each change, confirm:\n"
        "   - The change is intentional and in scope for this task.\n"
        "   - No comments were removed that you did not consciously decide to remove.\n"
        "   - No AI-process artifacts leaked into code (e.g. `Decision #N` references, "
        "session-scaffolding language that only makes sense to someone who read the chat).\n"
        "   - No unrelated files, formatting churn, or accidental reverts.\n"
        "   - No secrets, debug prints, or WIP markers.\n"
        "4. If anything looks off, STOP and fix it before pushing / opening the PR.\n"
        "5. When a reviewer leaves comments, record each new pattern in the mistakes log "
        "BEFORE fixing the code, so the lesson compounds across PRs."
    )


def main() -> None:
    try:
        payload = json.loads(read_stdin_utf8())
    except Exception:
        sys.exit(0)

    tool = payload.get("tool_name") or payload.get("tool")
    if tool != "Bash":
        sys.exit(0)

    cmd = (payload.get("tool_input") or {}).get("command", "")
    if not any(p.search(cmd) for p in TRIGGERS):
        sys.exit(0)

    # systemMessage never reaches the model (user-only channel), so an advisory
    # checklist was invisible to the agent. A PreToolUse deny's reason IS fed back
    # to the model: deny the FIRST push / PR-create per (repo, HEAD) with the
    # checklist; the retry after walking the diff passes.
    key = _head_key(payload.get("cwd") or os.getcwd(), cmd)
    if key and _seen(key):
        sys.exit(0)
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": _checklist() + "\n\nThis first push/PR attempt for this "
        "HEAD was held so the checklist is seen. After walking the diff, re-run the same "
        "command — it will go through.",
    }}))
    sys.exit(0)


STATE_DIR = Path(os.environ.get("CLAUDE_PR_DIFF_STATE_DIR")
                 or Path(__file__).resolve().parent / ".state")


def _head_key(cwd: str, cmd: str) -> str | None:
    m = re.search(r"\bgit\s+-C\s+(\"[^\"]+\"|'[^']+'|\S+)", cmd)
    where = m.group(1).strip("\"'") if m else cwd
    try:
        r = subprocess.run(["git", "-C", where, "rev-parse", "--show-toplevel", "HEAD"],
                           capture_output=True, text=True, timeout=3)
    except Exception:
        return None
    if r.returncode != 0:
        return None
    return "::".join(r.stdout.split())


def _seen(key: str) -> bool:
    """True if this (repo, HEAD) was already held once; records it otherwise."""
    f = STATE_DIR / "pr_diff_seen.txt"
    try:
        if f.exists() and key in f.read_text(encoding="utf-8").splitlines():
            return True
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with open(f, "a", encoding="utf-8") as fh:
            fh.write(key + "\n")
    except OSError:
        return True  # can't track state -> fail open, never wedge pushes
    return False


if __name__ == "__main__":
    main()

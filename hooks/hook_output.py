"""Shared output shape for advisory PostToolUse hooks.

`systemMessage` is shown to the USER only; the MODEL sees `hookSpecificOutput.additionalContext`
(Claude Code hooks docs, confirmed 2026-09-23). A hook that only emits systemMessage is invisible
to the model. Emit both: the model acts on it, the user still sees it.
"""
import json
import sys


def read_stdin_utf8() -> str:
    """Hook payloads are UTF-8, but Windows Python decodes stdin as cp1252, garbling any
    non-ASCII text (an em-dash in an Edit made edit_landed_check report a landed edit as
    NOT landed — audit 2026-09-23). Read raw bytes when available; if stdin is already a
    text stream with no .buffer (e.g. under a dispatcher), read it as-is."""
    buf = getattr(sys.stdin, "buffer", None)
    if buf is not None:
        return buf.read().decode("utf-8", "replace")
    return sys.stdin.read()


def post_tool_advice(msg: str) -> str:
    return json.dumps({
        "systemMessage": msg,
        "hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": msg},
    })

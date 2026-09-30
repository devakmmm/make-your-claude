#!/usr/bin/env python3
"""PostToolUse hook for Edit/Write — verify the change actually landed on disk.

Motivation: an Edit once reported success but never landed (caught only by a
later re-verification sweep). This makes the landed-check deterministic
instead of relying on the model to re-read.
Advisory only — emits a warning, never blocks.
"""
import json

from hook_output import post_tool_advice, read_stdin_utf8
import sys
from pathlib import Path


def _norm(s: str) -> str:
    return s.replace("\r\n", "\n")


def find_problems(tool: str, tool_input: dict) -> list[str]:
    """Return a list of landed-check failures for an Edit/Write tool call.

    Deliberately narrow — strong invariants only, to avoid false positives:
    Write: file exists and disk content == content (newline-normalized).
    Edit: non-empty new_string is present on disk; for a pure deletion
    (new_string == ""), old_string is gone.
    """
    file_path = tool_input.get("file_path")
    if not file_path:
        return []
    p = Path(file_path)
    problems: list[str] = []

    if tool == "Write":
        expected = _norm(tool_input.get("content", ""))
        if not p.exists():
            problems.append("file does not exist on disk after Write")
        else:
            try:
                actual = _norm(p.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                return []
            if actual != expected:
                problems.append(
                    f"disk content differs from written content "
                    f"(expected {len(expected)} chars, found {len(actual)})"
                )

    elif tool == "Edit":
        if not p.exists():
            problems.append("file does not exist on disk after Edit")
        else:
            try:
                content = _norm(p.read_text(encoding="utf-8", errors="ignore"))
            except Exception:
                return []
            new = _norm(tool_input.get("new_string", ""))
            old = _norm(tool_input.get("old_string", ""))
            if new and new not in content:
                problems.append("new_string is NOT present in the file after Edit")
            elif not new and old and old in content:
                problems.append("old_string still present after a deletion Edit")

    return problems


def main() -> None:
    try:
        payload = json.loads(read_stdin_utf8())
    except Exception:
        sys.exit(0)

    tool = payload.get("tool_name") or payload.get("tool")
    if tool not in ("Edit", "Write"):
        sys.exit(0)

    problems = find_problems(tool, payload.get("tool_input") or {})

    if problems:
        file_path = (payload.get("tool_input") or {}).get("file_path")
        msg = (
            "EDIT-LANDED CHECK: the change may NOT have landed on disk.\n"
            + "\n".join(f"  - {x}" for x in problems)
            + f"\n  file: {file_path}\n"
            "Re-read the file and re-apply the change before reporting success."
        )
        print(post_tool_advice(msg))

    sys.exit(0)


if __name__ == "__main__":
    main()

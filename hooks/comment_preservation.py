#!/usr/bin/env python3
"""PostToolUse hook for Edit/Write — flag removed comment lines.

Reads the tool_input from stdin (JSON), compares old_string vs new_string
(for Edit) or checks for suspiciously comment-less rewrites (for Write on
files that previously had comments). Emits a warning if any comment lines
appear to have been deleted. Advisory only — never blocks.
"""
import json

from hook_output import post_tool_advice, read_stdin_utf8
import re
import sys
from pathlib import Path

COMMENT_PATTERNS = [
    re.compile(r"^\s*#(?!!)"),       # python / shell (not shebang)
    re.compile(r"^\s*//"),            # js / ts / go / java / c
    re.compile(r"^\s*/\*"),           # c-style block start
    re.compile(r"^\s*\*(?!/)"),       # c-style block continuation
    re.compile(r"^\s*--"),            # sql
    re.compile(r'^\s*"""'),           # python docstring
    re.compile(r"^\s*'''"),           # python docstring
]


PROSE_SUFFIXES = (".md", ".markdown", ".txt", ".rst")


def is_comment_line(line: str) -> bool:
    return any(p.match(line) for p in COMMENT_PATTERNS)


def extract_comments(text: str) -> list[str]:
    return [ln for ln in text.splitlines() if is_comment_line(ln)]


def main() -> None:
    try:
        payload = json.loads(read_stdin_utf8())
    except Exception:
        sys.exit(0)

    tool = payload.get("tool_name") or payload.get("tool")
    tool_input = payload.get("tool_input") or {}

    if tool not in ("Edit", "Write", "NotebookEdit"):
        sys.exit(0)

    # Prose files have no code comments: in markdown, `**bold**` and `* bullet`
    # lines match the C-style `*` pattern and raised false alarms once this
    # warning started reaching the model (2026-09-24).
    if str(tool_input.get("file_path", "")).lower().endswith(PROSE_SUFFIXES):
        sys.exit(0)

    removed: list[str] = []

    if tool == "Edit":
        old = tool_input.get("old_string", "")
        new = tool_input.get("new_string", "")
        old_comments = extract_comments(old)
        new_comments = extract_comments(new)
        new_set = set(c.strip() for c in new_comments)
        for c in old_comments:
            if c.strip() not in new_set:
                removed.append(c.strip())

    elif tool == "Write":
        file_path = tool_input.get("file_path")
        new_content = tool_input.get("content", "")
        if file_path and Path(file_path).exists():
            try:
                old_content = Path(file_path).read_text(encoding="utf-8", errors="ignore")
            except Exception:
                sys.exit(0)
            old_comments = extract_comments(old_content)
            new_comments = extract_comments(new_content)
            new_set = set(c.strip() for c in new_comments)
            for c in old_comments:
                if c.strip() not in new_set:
                    removed.append(c.strip())

    if removed:
        preview = "\n".join(f"  - {ln[:120]}" for ln in removed[:8])
        more = f"\n  ... and {len(removed) - 8} more" if len(removed) > 8 else ""
        msg = (
            "COMMENT PRESERVATION CHECK: the edit removed comment lines that existed before.\n"
            "Guidance: leave comments in place unless you understand them and have a reason to remove them.\n"
            f"Removed comments:\n{preview}{more}\n"
            "If this was intentional, ignore. Otherwise restore the comments in a follow-up edit."
        )
        print(post_tool_advice(msg))

    sys.exit(0)


if __name__ == "__main__":
    main()

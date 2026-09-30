"""PreToolUse(Bash) guard: the database is read-only, always, and one wrapper script is the
only path to it.

Why: allowing `psql` through means any SQL gets through. A superuser login on dev, or a login
that becomes write-capable during a write-access window on prod, is one forgotten flag away from
a write. A wrapper script that stacks the guards (statement_timeout, default_transaction_read_only=on,
a SELECT/WITH/EXPLAIN/SHOW-only gate) is the only invocation this hook lets through; every other
psql invocation is denied. Writes and DDL stay human-run.

Config (environment):
  PSQL_READONLY_WRAPPER  the wrapper script's file name (default: rosql.sh). A command segment
                         that mentions it is allowed; a chained raw psql in another segment is not.
"""
import json
import os
import re
import shlex
import sys

WRAPPERS = {"wsl", "sudo", "env", "exec", "time", "nohup", "command"}
SHELLS = {"bash", "sh", "zsh"}
HEREDOC = re.compile(r"<<-?\s*(['\"]?)(\w+)\1[^\n]*\n.*?\n\s*\2\s*(\n|$)", re.S)
READONLY_WRAPPER = os.environ.get("PSQL_READONLY_WRAPPER") or "rosql.sh"
REASON = (f"Raw psql is blocked: the DB is read-only always and `{READONLY_WRAPPER}` is the only "
          "allowed path (it enforces a statement timeout, default_transaction_read_only=on, and a "
          "SELECT/WITH/EXPLAIN/SHOW-only gate). Writes/DDL are human-run.")


def split_segments(command):
    """Split on unquoted ; && || | and newlines, keeping quoted text intact."""
    segments, buf, quote, i = [], [], None, 0
    while i < len(command):
        c = command[i]
        if quote:
            buf.append(c)
            if c == quote:
                quote = None
        elif c in "'\"":
            quote = c
            buf.append(c)
        elif c in ";|\n" or command.startswith("&&", i):
            segments.append("".join(buf))
            buf = []
            if command.startswith(("&&", "||"), i):
                i += 1
        else:
            buf.append(c)
        i += 1
    segments.append("".join(buf))
    return [s for s in segments if s.strip()]


def runs_psql(segment):
    """True when the command word of this segment (after wrappers like wsl/sudo, and inside
    `bash -c '...'`) is psql. Text inside quotes that isn't a -c script never counts."""
    try:
        tokens = shlex.split(segment, posix=True)
    except ValueError:
        tokens = segment.split()
    while tokens:
        word = tokens[0].replace("\\", "/").rsplit("/", 1)[-1].lower()
        if word in WRAPPERS or (word.startswith("-") and len(tokens) > 1):
            tokens = tokens[1:]
            continue
        if word in SHELLS:
            for j, tok in enumerate(tokens[1:], start=1):
                if tok.startswith("-") and "c" in tok and j + 1 < len(tokens):
                    return violates(tokens[j + 1])
            return False
        return word == "psql"
    return False


def violates(command):
    command = HEREDOC.sub("\n", command)
    for segment in split_segments(command):
        if READONLY_WRAPPER in segment:
            continue
        if runs_psql(segment):
            return True
    return False


def main():
    try:
        payload = json.loads(sys.stdin.buffer.read().decode("utf-8", "replace") or "{}")
    except ValueError:
        return
    if payload.get("tool_name") != "Bash":
        return
    command = (payload.get("tool_input") or {}).get("command") or ""
    if violates(command):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON,
        }}))


if __name__ == "__main__":
    main()

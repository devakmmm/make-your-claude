"""Tests for psql_readonly_guard: the DB is read-only always, and the wrapper is the only path.

The wrapper script carries the server/statement guards (statement_timeout,
default_transaction_read_only, SELECT-only gate). Any raw psql invocation bypasses them, so the
hook must deny it.
"""
import json
import subprocess
import sys
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / "hooks" / "psql_readonly_guard.py"


def run(command, tool="Bash"):
    payload = {"tool_name": tool, "tool_input": {"command": command}}
    out = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(payload),
                         capture_output=True, text=True, encoding="utf-8", timeout=10)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout) if out.stdout.strip() else {}


def decision(result):
    return result.get("hookSpecificOutput", {}).get("permissionDecision")


def test_raw_wsl_psql_is_denied():
    r = run("wsl psql \"host=db.prod.example.internal user=reader\" -c \"select 1\"")
    assert decision(r) == "deny"
    assert "rosql.sh" in r["hookSpecificOutput"]["permissionDecisionReason"]


def test_raw_psql_even_with_readonly_flag_is_denied():
    r = run("psql \"options='-c default_transaction_read_only=on'\" -c \"select 1\"")
    assert decision(r) == "deny"


def test_psql_inside_wsl_bash_is_denied():
    r = run("wsl -e bash -lc 'psql -h db.dev.example.internal -c \"delete from x\"'")
    assert decision(r) == "deny"


def test_rosql_wrapper_is_allowed_through():
    r = run('bash ./scripts/rosql.sh prod "select 1"')
    assert decision(r) is None


def test_unrelated_commands_pass():
    assert decision(run("git status")) is None
    assert decision(run("grep -rn psql docs/")) is None


def test_rosql_does_not_whitelist_a_chained_raw_psql():
    r = run('bash ./scripts/rosql.sh dev "select 1" && wsl psql -c "drop table x"')
    assert decision(r) == "deny"


def test_heredoc_body_mentioning_psql_is_not_a_command():
    r = run("python - <<'EOF'\nt = 'Raw `wsl psql` is no longer allowed'\nprint(t)\nEOF")
    assert decision(r) is None


def test_quoted_text_mentioning_psql_is_not_a_command():
    assert decision(run('echo "never run wsl psql directly; use rosql"')) is None


def test_pipe_into_psql_is_denied():
    assert decision(run("cat q.sql | psql -h db.dev.example.internal")) == "deny"


def test_absolute_path_psql_is_denied():
    assert decision(run("/usr/bin/psql -c 'select 1'")) == "deny"


def test_non_bash_tools_ignored():
    assert decision(run("psql", tool="Read")) is None

"""Tests for stop_verify_claims: the gate must fire once per TURN, not once per session.

Bug (audit 2026-09-23): the dedupe key was transcript::stop_count, but the harness never sends
stop_count, so every key was `::0` and the gate went silent after turn 1.
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HOOK = Path(__file__).resolve().parent.parent / "hooks" / "stop_verify_claims.py"


def stop(transcript, state_dir, active=False):
    payload = {"hook_event_name": "Stop", "transcript_path": str(transcript), "stop_hook_active": active}
    env = dict(os.environ, CLAUDE_VERIFY_CLAIMS_STATE_DIR=str(state_dir))
    out = subprocess.run([sys.executable, str(HOOK)], input=json.dumps(payload), env=env,
                         capture_output=True, text=True, encoding="utf-8", timeout=10)
    assert out.returncode == 0, out.stderr
    return json.loads(out.stdout).get("decision") if out.stdout.strip() else None


def test_fires_again_on_a_later_turn():
    with tempfile.TemporaryDirectory() as d:
        tr = Path(d, "t.jsonl")
        tr.write_text('{"turn":1}\n', encoding="utf-8")
        assert stop(tr, d) == "block"
        tr.write_text('{"turn":1}\n{"turn":2}\n{"turn":3}\n', encoding="utf-8")
        assert stop(tr, d) == "block", "second turn must be gated too"


def test_same_turn_does_not_reblock():
    with tempfile.TemporaryDirectory() as d:
        tr = Path(d, "t.jsonl")
        tr.write_text('{"turn":1}\n', encoding="utf-8")
        assert stop(tr, d) == "block"
        assert stop(tr, d) is None


def test_stop_hook_active_passes():
    with tempfile.TemporaryDirectory() as d:
        tr = Path(d, "t.jsonl")
        tr.write_text('{"turn":1}\n', encoding="utf-8")
        assert stop(tr, d, active=True) is None

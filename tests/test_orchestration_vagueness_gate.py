"""Tests for orchestration_vagueness_gate.should_gate.

Run: python -m pytest tests -q
"""

from orchestration_vagueness_gate import should_gate

# (prompt, expected_gate, why)
CASES = [
    # --- GATED: orchestration trigger + no anchor + short ---
    ("fan out and improve the app", True, "vague fan-out"),
    ("run the pipeline", True, "no pipeline named concretely, no anchor"),
    ("slice this up", True, "nothing to slice"),
    ("drive the loop", True, "no loop named"),
    ("start run", True, "run launch with no target"),
    ("use a workflow to make it better", True, "vague workflow ask"),
    ("orchestrate the pipeline and fix everything", True, "no target"),

    # --- PASSES: anchor present ---
    ("fan out over src/billing/pipeline.py", False, "file path"),
    ("run the pipeline for ABC-1234", False, "ticket anchor"),
    ("slice this: implement save_failed_job_result retry", False,
     "snake_case symbol"),
    ("start run for the payment-retry-backoff task", False,
     "kebab task slug"),
    ("fan out to fix TranslationError in the translator", False,
     "error reference"),
    ("run the pipeline:\n1. spec\n2. plan\n3. implement", False,
     "numbered steps"),
    ("drive the loop on `compute_account_rollups`", False, "code span"),
    ("orchestrate the pipeline per the acceptance criteria above", False,
     "acceptance criteria"),

    # --- PASSES: bypass prefix ---
    ("force: run the pipeline", False, "explicit force bypass"),
    ("! slice this", False, "bang bypass"),

    # --- PASSES: no orchestration trigger at all ---
    ("improve the app", False, "vague but not orchestration"),
    ("what do you think of this plan skill", False, "conversation"),
    ("fix the null check", False, "plain request"),

    # --- PASSES: long prompt (detail implies scope even without anchors) ---
    ("run the pipeline " + "with lots of detail about scope " * 6, False,
     "over effective-word limit"),
]


def test_cases():
    failures = []
    for prompt, expected, why in CASES:
        got = should_gate(prompt)
        if got != expected:
            failures.append(
                f"  {prompt[:60]!r}: expected gate={expected} ({why}), got {got}"
            )
    assert not failures, "gate decisions wrong:\n" + "\n".join(failures)

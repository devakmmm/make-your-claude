"""UserPromptSubmit hook: pre-execution gate for vague heavy-orchestration
requests. Adapted from ralplan's pre-execution gate (SkillRepo, Yeachan-Heo).

Heavy orchestration (fan-outs, pipelines, loops, multi-agent runs, workflows)
launched on an underspecified prompt burns agents on scope discovery that
belongs in planning. This hook deterministically detects that combination and
injects a reminder to plan first. The decision to actually redirect stays with
the model (latent); only the signal detection is deterministic.

Deliberately conservative: false negatives (a vague prompt slips through) are
fine, false positives (nagging on a well-anchored request) are costly. One
concrete anchor is enough to pass. `force:` or leading `!` always bypasses.
"""

import json
import re
import sys


from hook_output import read_stdin_utf8
# Phrases that route to heavy multi-agent / multi-step orchestration.
ORCHESTRATION_PATTERNS = [
    r"\bfan\s+out\b",
    r"\bslice\s+this\b",
    r"\bsplit\s+(this\s+)?across\s+agents\b",
    r"\brun\s+\d+\s+tasks?\s+in\s+parallel\b",
    r"\b(run|drive|orchestrate|execute)\s+(the\s+)?[\w-]*\s*(pipeline|loop)\b",
    r"\b(start|implement|resume)\s+run\b",
    r"\buse\s+a\s+workflow\b",
    r"\brun\s+a\s+workflow\b",
    r"\bultracode\b",
    r"/(slice-orchestrator|pipeline-orchestrator|loop-orchestrator)\b",
]

ORCHESTRATION_RE = re.compile("|".join(ORCHESTRATION_PATTERNS), re.IGNORECASE)

# Concrete anchors — any ONE of these passes the gate (ralplan's signal table,
# extended with Jira-style ticket keys and branch-name shapes).
ANCHOR_PATTERNS = [
    r"[\w-]+\.(py|md|ts|tsx|js|json|sql|yml|yaml|toml|sh|ps1|html|css|txt)\b",  # file with extension
    r"[\w.-]+[/\\][\w.-]+[/\\][\w.-]+",         # path with 2+ separators
    r"\b[A-Z][A-Z0-9]{1,9}-\d+\b",              # Jira-style ticket key (ABC-1234)
    r"#\d+\b",                                  # issue/PR number
    r"\b[a-z]+[A-Z]\w*\b",                      # camelCase symbol
    r"\b[A-Z][a-z]+[A-Z]\w*\b",                 # PascalCase symbol
    r"\b[a-z0-9]+_[a-z0-9_]+\b",                # snake_case identifier
    r"\b[a-z0-9]+(-[a-z0-9]+){2,}\b",           # kebab branch/slug (3+ parts)
    r"\n\s*\d+[.)]\s",                          # numbered steps
    r"\b\w+(Error|Exception)\b",                # error reference
    r"`[^`]+`",                                 # code span
    r"\bacceptance\s+criteria\b",
]

ANCHOR_RE = re.compile("|".join(ANCHOR_PATTERNS))

BYPASS_RE = re.compile(r"^\s*(force:|!)", re.IGNORECASE)

# Ralplan gates at <=15 effective words; count words left after removing the
# matched orchestration phrase itself.
MAX_EFFECTIVE_WORDS = 15

GATE_MSG = (
    "ORCHESTRATION VAGUENESS GATE: this prompt asks for heavy multi-agent "
    "orchestration (slice/pipeline/loop/run/workflow) but contains no concrete "
    "anchor — no file path, ticket, symbol name, numbered steps, error "
    "reference, or acceptance criteria. Launching orchestration on an "
    "underspecified target wastes agents on scope discovery that belongs in "
    "planning.\n\n"
    "Before launching, either:\n"
    "1. Route through planning first — a reviewed plan for a change, or a "
    "scoping session for a new idea. Then orchestrate the resulting plan/slices.\n"
    "2. OR ask the user for one concrete anchor (which files/ticket/function, "
    "what done looks like) before spinning anything up.\n\n"
    "If the conversation context already contains the concrete scope (an "
    "approved plan, a slices/ dir, a named pipeline file), that counts — "
    "proceed and say so in one line. The user can also bypass this gate "
    "explicitly by prefixing the prompt with 'force:' or '!'."
)


def should_gate(prompt: str) -> bool:
    """Pure decision function. True = inject the gate reminder."""
    if not prompt or len(prompt) > 4000:
        return False
    if BYPASS_RE.search(prompt):
        return False
    match = ORCHESTRATION_RE.search(prompt)
    if not match:
        return False
    if ANCHOR_RE.search(prompt):
        return False
    effective = re.sub(re.escape(match.group(0)), " ", prompt, count=1)
    if len(effective.split()) > MAX_EFFECTIVE_WORDS:
        return False
    return True


def main() -> int:
    try:
        payload = json.loads(read_stdin_utf8())
    except json.JSONDecodeError:
        return 0

    prompt = payload.get("prompt", "") or ""
    if not should_gate(prompt):
        return 0

    output = {
        "hookSpecificOutput": {
            "hookEventName": "UserPromptSubmit",
            "additionalContext": GATE_MSG,
        }
    }
    print(json.dumps(output))
    return 0


if __name__ == "__main__":
    sys.exit(main())

import sys
from pathlib import Path

HOOKS = Path(__file__).resolve().parent.parent / "hooks"
if str(HOOKS) not in sys.path:
    sys.path.insert(0, str(HOOKS))

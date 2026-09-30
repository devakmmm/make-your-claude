"""Tests for edit_landed_check.find_problems.

Run: python -m pytest tests -q
"""

import tempfile
from pathlib import Path

from edit_landed_check import find_problems


def _tmp(content: str, newline: str = "") -> str:
    f = tempfile.NamedTemporaryFile(
        mode="w", suffix=".txt", delete=False, encoding="utf-8", newline=newline
    )
    f.write(content)
    f.close()
    return f.name


def test_write_content_matches():
    p = _tmp("hello\nworld\n")
    assert find_problems("Write", {"file_path": p, "content": "hello\nworld\n"}) == []


def test_write_content_mismatch():
    p = _tmp("hello\nworld\n")
    probs = find_problems("Write", {"file_path": p, "content": "something else\n"})
    assert probs and "differs" in probs[0]


def test_write_file_missing():
    probs = find_problems(
        "Write", {"file_path": str(Path(tempfile.gettempdir()) / "nope-does-not-exist-xyz.txt"),
                  "content": "x"}
    )
    assert probs and "does not exist" in probs[0]


def test_write_crlf_on_disk_lf_expected():
    # Windows: file may land with \r\n line endings — must not false-positive
    p = _tmp("hello\r\nworld\r\n")
    assert find_problems("Write", {"file_path": p, "content": "hello\nworld\n"}) == []


def test_edit_new_string_present():
    p = _tmp("before\nchanged line\nafter\n")
    assert find_problems(
        "Edit", {"file_path": p, "old_string": "original line", "new_string": "changed line"}
    ) == []


def test_edit_new_string_absent():
    p = _tmp("before\noriginal line\nafter\n")
    probs = find_problems(
        "Edit", {"file_path": p, "old_string": "original line", "new_string": "changed line"}
    )
    assert probs and "new_string" in probs[0]


def test_edit_deletion_old_gone():
    p = _tmp("before\nafter\n")
    assert find_problems(
        "Edit", {"file_path": p, "old_string": "delete me\n", "new_string": ""}
    ) == []


def test_edit_deletion_old_still_present():
    p = _tmp("before\ndelete me\nafter\n")
    probs = find_problems(
        "Edit", {"file_path": p, "old_string": "delete me\n", "new_string": ""}
    )
    assert probs and "still present" in probs[0]


def test_edit_file_missing():
    probs = find_problems(
        "Edit", {"file_path": str(Path(tempfile.gettempdir()) / "nope-does-not-exist-xyz.txt"),
                 "old_string": "a", "new_string": "b"}
    )
    assert probs and "does not exist" in probs[0]

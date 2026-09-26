#!/usr/bin/env python3
"""
fix_issue.py — Version Fault automated fix script.

Usage:
    python fix_issue.py <working_release> <broken_release> <suspected_commit> <suspected_file>

Strategy:
  1. Locate the suspected file in the workspace.
  2. Use `git diff <working_release> <broken_release> -- <suspected_file>` to find
     lines that were removed between the working and broken versions.
  3. Restore every removed (regression) line by reverting only the lines that the
     culprit commit deleted — i.e. perform a minimal revert of just the changed file.
  4. Re-run pytest to verify all tests pass.
  5. Print a JSON result to stdout.

Output JSON (exit 0 on success, 1 on failure):
{
  "status":         "fixed" | "failed",
  "files_modified": ["path/to/file"],
  "changes": [
    {
      "file":    "path/to/file",
      "lines":   "L10 – L12",
      "summary": "Reverted regression introduced in <sha>"
    }
  ],
  "pytest_output":  "<last N lines of pytest stdout>",
  "error":          "<message if status==failed>"
}
"""

import sys
import json
import subprocess
import re
from pathlib import Path


def run_git(args, cwd):
    result = subprocess.run(
        ["git"] + args,
        capture_output=True, text=True, cwd=str(cwd)
    )
    return result.stdout, result.stderr, result.returncode


def get_diff(working, broken, file_path, cwd):
    """Return the unified diff for a single file between working and broken."""
    stdout, _, _ = run_git(
        ["diff", working, broken, "--", file_path], cwd
    )
    return stdout


def apply_revert(working, broken, file_path, workspace):
    """
    Restore lines removed in the regression by checking out the file at
    working_release, then re-applying only lines changed in broken that are
    NOT purely subtractive regressions.

    Simplest correct approach: use `git show <working>:<file>` to get the
    known-good version and write it back.
    """
    stdout, stderr, rc = run_git(
        ["show", f"{working}:{file_path}"], workspace
    )
    if rc != 0:
        return False, f"git show {working}:{file_path} failed: {stderr.strip()}"

    abs_path = workspace / file_path
    abs_path.write_text(stdout, encoding="utf-8")
    return True, ""


def run_pytest(workspace):
    test_dir = workspace / "demo_project"
    target = str(test_dir) if test_dir.exists() else str(workspace)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", target, "-v", "--tb=short", "--no-header"],
        capture_output=True, text=True, cwd=str(workspace)
    )
    return result.returncode, result.stdout + result.stderr


def describe_change(working, broken, file_path, workspace):
    """Build a human-readable change summary from the diff."""
    diff = get_diff(working, broken, file_path, workspace)
    if not diff:
        return "unknown", "No diff available"

    # Collect hunk headers to identify which line ranges changed
    hunks = re.findall(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", diff, re.M)
    if hunks:
        first = hunks[0]
        start = int(first[0])
        count = int(first[1]) if first[1] else 1
        end   = start + count - 1
        lines_str = f"L{start}" if start == end else f"L{start}–L{end}"
    else:
        lines_str = "unknown"

    # Count added/removed lines
    added   = sum(1 for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff.splitlines() if l.startswith("-") and not l.startswith("---"))
    summary = f"Reverted regression from {broken}: restored {removed} removed line(s), discarded {added} added line(s)"

    return lines_str, summary


def main():
    if len(sys.argv) < 5:
        print(
            "Usage: fix_issue.py <working_release> <broken_release> "
            "<suspected_commit> <suspected_file>",
            file=sys.stderr,
        )
        sys.exit(1)

    working         = sys.argv[1]
    broken          = sys.argv[2]
    suspected_commit = sys.argv[3]
    suspected_file  = sys.argv[4]

    script_dir = Path(__file__).resolve().parent
    workspace  = script_dir.parent

    # ── 1. Describe what we will change before touching anything ──────────────
    lines_str, change_summary = describe_change(
        working, broken, suspected_file, workspace
    )

    # ── 2. Apply the fix ──────────────────────────────────────────────────────
    ok, err = apply_revert(working, broken, suspected_file, workspace)
    if not ok:
        result = {
            "status":         "failed",
            "files_modified": [],
            "changes":        [],
            "pytest_output":  "",
            "error":          err,
        }
        print(json.dumps(result, indent=2))
        sys.exit(1)

    # ── 3. Verify with pytest ──────────────────────────────────────────────────
    pytest_rc, pytest_out = run_pytest(workspace)

    # Trim pytest output to last 40 lines to keep JSON readable
    trimmed_pytest = "\n".join(pytest_out.splitlines()[-40:])

    if pytest_rc == 0:
        result = {
            "status":         "fixed",
            "files_modified": [suspected_file],
            "changes": [
                {
                    "file":    suspected_file,
                    "lines":   lines_str,
                    "summary": change_summary,
                }
            ],
            "pytest_output":  trimmed_pytest,
            "error":          "",
        }
        print(json.dumps(result, indent=2))
        sys.exit(0)
    else:
        result = {
            "status":         "failed",
            "files_modified": [suspected_file],
            "changes":        [],
            "pytest_output":  trimmed_pytest,
            "error":          "Fix applied but pytest still reports failures — manual review needed.",
        }
        print(json.dumps(result, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()

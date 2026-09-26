#!/usr/bin/env python3
"""
report_generator.py — Version Fault regression analysis entry point.

Usage:
    python report_generator.py <working_release> <broken_release>

<working_release> and <broken_release> can be:
  - git tags (e.g. v1.0)
  - commit SHAs / short SHAs (e.g. 8a39af0)
  - branch names

Outputs a single JSON object to stdout:
{
  "working_release":   "...",
  "broken_release":    "...",
  "commits_analyzed":  ["<sha> <message>", ...],
  "files_changed":     ["path/to/file", ...],
  "failing_tests":     ["test_name::reason", ...],
  "suspected_commit":  "<sha> <message>",
  "suspected_file":    "path/to/file"
}

Exit code 0 on success, 1 on error (error details go to stderr).
"""

import sys
import json
import subprocess
import re
from pathlib import Path


def run_git(args, cwd):
    """Run a git command and return stripped stdout, or '' on failure."""
    result = subprocess.run(
        ["git"] + args,
        capture_output=True, text=True, cwd=cwd
    )
    return result.stdout.strip()


def get_commits(working, broken, cwd):
    """Return list of one-line commit strings between working..broken."""
    raw = run_git(["log", f"{working}..{broken}", "--oneline"], cwd)
    if not raw:
        return []
    return [line for line in raw.splitlines() if line.strip()]


def get_changed_files(working, broken, cwd):
    """Return list of files changed between working and broken."""
    raw = run_git(["diff", "--name-only", working, broken], cwd)
    if not raw:
        return []
    return [f for f in raw.splitlines() if f.strip()]


def run_pytest(cwd):
    """
    Run pytest in <cwd>/demo_project (if present) or <cwd>.
    Returns a list of failing test node ids with short error reasons.
    """
    test_dir = Path(cwd) / "demo_project"
    target = str(test_dir) if test_dir.exists() else str(cwd)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", target, "-v", "--tb=line", "--no-header"],
        capture_output=True, text=True, cwd=cwd
    )
    output = result.stdout + "\n" + result.stderr
    failures = []

    # Parse lines like: "FAILED demo_project/test_foo.py::test_bar - AssertionError: ..."
    for line in output.splitlines():
        m = re.match(r"^FAILED\s+(\S+)\s*-\s*(.+)$", line)
        if m:
            failures.append(f"{m.group(1)} — {m.group(2).strip()}")

    return failures


def suspect_from_commits_and_files(commits, changed_files):
    """
    Heuristic: the first (most-recent) commit that touches any changed file
    is the suspected culprit.  Falls back gracefully when data is sparse.
    """
    if commits:
        suspected_commit = commits[0]
    else:
        suspected_commit = "unknown"

    if changed_files:
        suspected_file = changed_files[0]
    else:
        suspected_file = "unknown"

    return suspected_commit, suspected_file


def main():
    if len(sys.argv) < 3:
        print(
            "Usage: report_generator.py <working_release> <broken_release>",
            file=sys.stderr,
        )
        sys.exit(1)

    working = sys.argv[1]
    broken  = sys.argv[2]

    # Workspace root is two levels above this script (project root)
    script_dir  = Path(__file__).resolve().parent
    workspace   = script_dir.parent

    commits       = get_commits(working, broken, workspace)
    changed_files = get_changed_files(working, broken, workspace)
    failing_tests = run_pytest(workspace)

    suspected_commit, suspected_file = suspect_from_commits_and_files(
        commits, changed_files
    )

    report = {
        "working_release":  working,
        "broken_release":   broken,
        "commits_analyzed": commits,
        "files_changed":    changed_files,
        "failing_tests":    failing_tests,
        "suspected_commit": suspected_commit,
        "suspected_file":   suspected_file,
    }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

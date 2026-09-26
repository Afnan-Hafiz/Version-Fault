#!/usr/bin/env python3
"""
report_generator.py — Version Fault regression analysis entry point.

Usage:
    python report_generator.py <working_release> <broken_release> [--workspace /path/to/repo]

<working_release> and <broken_release> can be:
  - git tags (e.g. v1.0)
  - commit SHAs / short SHAs (e.g. 8a39af0)
  - branch names

--workspace   Absolute path to the repository root. When omitted the script
              walks up from its own location to find the nearest directory
              that contains a .git folder.

Outputs a single JSON object to stdout:
{
  "working_release":   "...",
  "broken_release":    "...",
  "commits_analyzed":  ["<sha> <message>", ...],
  "files_changed":     ["path/to/file", ...],
  "failing_tests":     ["test_name — reason", ...],
  "suspected_commit":  "<sha> <message>",
  "suspected_file":    "path/to/file"
}

Exit code 0 on success, 1 on error (error details go to stderr).
"""

import sys
import json
import subprocess
import re
import argparse
from pathlib import Path


# ── Helpers ────────────────────────────────────────────────────────────────────

def find_git_root(start: Path) -> Path:
    """Walk up from *start* until we find a directory containing .git."""
    current = start.resolve()
    for _ in range(10):
        if (current / ".git").exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    # Fall back to start's directory if no .git found
    return start.resolve()


def run_git(args, cwd):
    result = subprocess.run(
        ["git"] + args,
        capture_output=True, text=True, cwd=str(cwd)
    )
    return result.stdout.strip(), result.stderr.strip(), result.returncode


def get_commits(working, broken, cwd):
    raw, _, _ = run_git(["log", f"{working}..{broken}", "--oneline"], cwd)
    if not raw:
        return []
    return [line for line in raw.splitlines() if line.strip()]


def get_changed_files(working, broken, cwd):
    raw, _, _ = run_git(["diff", "--name-only", working, broken], cwd)
    if not raw:
        return []
    return [f for f in raw.splitlines() if f.strip()]


def run_pytest(workspace: Path):
    """
    Discover and run pytest. Tries demo_project/ first, then the workspace root.
    Returns a list of 'test_id — reason' strings for each failure.
    """
    test_dir = workspace / "demo_project"
    target = str(test_dir) if test_dir.exists() else str(workspace)

    result = subprocess.run(
        [sys.executable, "-m", "pytest", target, "-v", "--tb=line", "--no-header"],
        capture_output=True, text=True, cwd=str(workspace)
    )
    output = result.stdout + "\n" + result.stderr
    failures = []
    for line in output.splitlines():
        m = re.match(r"^FAILED\s+(\S+)\s*-\s*(.+)$", line)
        if m:
            failures.append(f"{m.group(1)} \u2014 {m.group(2).strip()}")
    return failures


def suspect_from(commits, changed_files):
    return (
        commits[0] if commits else "unknown",
        changed_files[0] if changed_files else "unknown",
    )


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Version Fault — report generator")
    parser.add_argument("working", help="Working release (tag, SHA, or branch)")
    parser.add_argument("broken",  help="Broken release (tag, SHA, or branch)")
    parser.add_argument("--workspace", default=None,
                        help="Absolute path to the repository root")
    args = parser.parse_args()

    if args.workspace:
        workspace = Path(args.workspace).resolve()
    else:
        workspace = find_git_root(Path(__file__).resolve().parent)

    commits       = get_commits(args.working, args.broken, workspace)
    changed_files = get_changed_files(args.working, args.broken, workspace)
    failing_tests = run_pytest(workspace)
    suspected_commit, suspected_file = suspect_from(commits, changed_files)

    report = {
        "working_release":  args.working,
        "broken_release":   args.broken,
        "commits_analyzed": commits,
        "files_changed":    changed_files,
        "failing_tests":    failing_tests,
        "suspected_commit": suspected_commit,
        "suspected_file":   suspected_file,
    }

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

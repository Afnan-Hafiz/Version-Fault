#!/usr/bin/env python3
"""
fix_issue.py — Version Fault automated fix script.

Usage:
    python fix_issue.py <working_release> <broken_release>
                        <suspected_commit> <suspected_file>
                        [--workspace /path/to/repo]

Strategy:
  1. Use `git show <working>:<suspected_file>` to retrieve the known-good file.
  2. Write it back over the current (broken) version.
  3. Re-run pytest to confirm all tests pass.
  4. Output JSON result to stdout.

Output JSON (exit 0 on success, 1 on failure):
{
  "status":         "fixed" | "failed",
  "files_modified": ["path/to/file"],
  "changes": [
    {
      "file":    "path/to/file",
      "lines":   "L7",
      "summary": "Reverted regression from <sha>: restored N removed line(s)"
    }
  ],
  "pytest_output":  "...",
  "error":          ""
}
"""

import sys
import json
import subprocess
import re
import argparse
from pathlib import Path


# ── Helpers ────────────────────────────────────────────────────────────────────

def find_git_root(start: Path) -> Path:
    current = start.resolve()
    for _ in range(10):
        if (current / ".git").exists():
            return current
        parent = current.parent
        if parent == current:
            break
        current = parent
    return start.resolve()


def run_git(args, cwd):
    result = subprocess.run(
        ["git"] + args,
        capture_output=True, text=True, cwd=str(cwd)
    )
    return result.stdout, result.stderr.strip(), result.returncode


def get_diff(working, broken, file_path, workspace):
    out, _, _ = run_git(["diff", working, broken, "--", file_path], workspace)
    return out


def apply_revert(working, file_path, workspace: Path):
    """Restore the file to its state at *working* using git show."""
    content, stderr, rc = run_git(["show", f"{working}:{file_path}"], workspace)
    if rc != 0:
        return False, f"git show {working}:{file_path} failed: {stderr}"
    abs_path = workspace / file_path
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_text(content, encoding="utf-8")
    return True, ""


def run_pytest(workspace: Path):
    test_dir = workspace / "demo_project"
    target = str(test_dir) if test_dir.exists() else str(workspace)
    result = subprocess.run(
        [sys.executable, "-m", "pytest", target, "-v", "--tb=short", "--no-header"],
        capture_output=True, text=True, cwd=str(workspace)
    )
    return result.returncode, result.stdout + result.stderr


def describe_change(working, broken, file_path, workspace):
    diff = get_diff(working, broken, file_path, workspace)
    if not diff:
        return "unknown", "No diff available"

    hunks = re.findall(r"^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", diff, re.M)
    if hunks:
        start = int(hunks[0][0])
        count = int(hunks[0][1]) if hunks[0][1] else 1
        end   = start + count - 1
        lines_str = f"L{start}" if start == end else f"L{start}\u2013L{end}"
    else:
        lines_str = "unknown"

    added   = sum(1 for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++"))
    removed = sum(1 for l in diff.splitlines() if l.startswith("-") and not l.startswith("---"))
    summary = (
        f"Reverted regression from {broken}: "
        f"restored {removed} removed line(s), discarded {added} added line(s)"
    )
    return lines_str, summary


# ── Entry point ────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Version Fault — fix script")
    parser.add_argument("working",          help="Working release")
    parser.add_argument("broken",           help="Broken release")
    parser.add_argument("suspected_commit", help="Suspected culprit commit string")
    parser.add_argument("suspected_file",   help="Suspected file (repo-relative path)")
    parser.add_argument("--workspace", default=None,
                        help="Absolute path to the repository root")
    args = parser.parse_args()

    if args.workspace:
        workspace = Path(args.workspace).resolve()
    else:
        workspace = find_git_root(Path(__file__).resolve().parent)

    lines_str, change_summary = describe_change(
        args.working, args.broken, args.suspected_file, workspace
    )

    ok, err = apply_revert(args.working, args.suspected_file, workspace)
    if not ok:
        out = {
            "status": "failed", "files_modified": [], "changes": [],
            "pytest_output": "", "error": err,
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        sys.exit(1)

    pytest_rc, pytest_out = run_pytest(workspace)
    trimmed = "\n".join(pytest_out.splitlines()[-40:])

    if pytest_rc == 0:
        out = {
            "status": "fixed",
            "files_modified": [args.suspected_file],
            "changes": [{
                "file":    args.suspected_file,
                "lines":   lines_str,
                "summary": change_summary,
            }],
            "pytest_output": trimmed,
            "error": "",
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        sys.exit(0)
    else:
        out = {
            "status": "failed",
            "files_modified": [args.suspected_file],
            "changes": [],
            "pytest_output": trimmed,
            "error": "Fix applied but pytest still reports failures — manual review needed.",
        }
        print(json.dumps(out, ensure_ascii=False, indent=2))
        sys.exit(1)


if __name__ == "__main__":
    main()

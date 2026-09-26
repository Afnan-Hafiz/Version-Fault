import subprocess
import json
import sys
import os

# --- Argument validation ---
if len(sys.argv) < 3:
    print(
        "Error: two arguments are required.\n"
        "Usage: python git_analyzer.py <working_tag> <broken_tag>\n"
        "  working_tag  – the last known-good tag  (e.g. v1.0)\n"
        "  broken_tag   – the tag that introduced the regression (e.g. v2.0)",
        file=sys.stderr,
    )
    sys.exit(1)

# These are the two versions we're comparing
working_tag = sys.argv[1]  # example: v1.0
broken_tag = sys.argv[2]   # example: v2.0


def run_git(*args):
    """Run a git command and return its stdout. Exits with a clear message on failure."""
    result = subprocess.run(
        ["git", *args],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"git error: {result.stderr.strip()}", file=sys.stderr)
        sys.exit(result.returncode)
    return result.stdout


def validate_tag(tag):
    """Exit with a human-readable message if *tag* does not exist in the repo."""
    check = subprocess.run(
        ["git", "rev-parse", "--verify", tag],
        capture_output=True,
        text=True,
    )
    if check.returncode != 0:
        print(
            f"Error: tag \"{tag}\" was not found in this repository.\n"
            "       Run `git tag` to list all available tags.",
            file=sys.stderr,
        )
        sys.exit(1)


def split_lines(output):
    """Split newline-separated output into a list, returning [] when output is empty."""
    stripped = output.strip()
    if not stripped:
        return []
    return stripped.split("\n")


# --- Validate that both tags actually exist ---
validate_tag(working_tag)
validate_tag(broken_tag)

# 1. Get list of commits between the two versions
commits = split_lines(run_git("log", f"{working_tag}..{broken_tag}", "--oneline"))

# 2. Get list of files that changed
changed_files = split_lines(run_git("diff", "--name-only", working_tag, broken_tag))

# 3. Get the actual code differences
diff_text = run_git("diff", working_tag, broken_tag)

# --- Warn when there is nothing to analyse ---
if not commits and not changed_files:
    print(
        f"Warning: no commits or changed files found between {working_tag} and {broken_tag}.",
        file=sys.stderr,
    )

# Put it all together in one tidy package
result = {
    "working_tag": working_tag,
    "broken_tag": broken_tag,
    "commits": commits,
    "changed_files": changed_files,
    "diff": diff_text,
}

# Write next to this script so the output location is always predictable
output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "git_analysis.json")
with open(output_path, "w") as f:
    json.dump(result, f, indent=2)

print(f"Done! Saved to {output_path}")

import subprocess
import json
import sys

# These are the two versions we're comparing
working_tag = sys.argv[1]  # example: v1.0
broken_tag = sys.argv[2]   # example: v2.0

# 1. Get list of commits between the two versions
commits = subprocess.run(
    ["git", "log", f"{working_tag}..{broken_tag}", "--oneline"],
    capture_output=True, text=True
).stdout.strip().split("\n")

# 2. Get list of files that changed
changed_files = subprocess.run(
    ["git", "diff", "--name-only", working_tag, broken_tag],
    capture_output=True, text=True
).stdout.strip().split("\n")

# 3. Get the actual code differences
diff_text = subprocess.run(
    ["git", "diff", working_tag, broken_tag],
    capture_output=True, text=True
).stdout

# Put it all together in one tidy package
result = {
    "working_tag": working_tag,
    "broken_tag": broken_tag,
    "commits": commits,
    "changed_files": changed_files,
    "diff": diff_text
}

# Save it as a file so Member 3 can use it
with open("git_analysis.json", "w") as f:
    json.dump(result, f, indent=2)

print("Done! Saved to git_analysis.json")
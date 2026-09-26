import subprocess
import sys
from pathlib import Path


def main():
    Path("reports").mkdir(exist_ok=True)

    result = subprocess.run(
        [sys.executable, "-m", "pytest"],
        capture_output=True,
        text=True
    )

    output = result.stdout + "\n" + result.stderr

    Path("reports/test_report.txt").write_text(
        output,
        encoding="utf-8"
    )

    if result.returncode == 0:
        print("All tests passed")
    elif result.returncode == 5:
        print("No tests found yet")
    else:
        print("Some tests failed")

    print("Report saved to reports/test_report.txt")


if __name__ == "__main__":
    main()
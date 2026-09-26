#!/usr/bin/env python3
"""
Placeholder report generator for Version Fault.

Usage:
    python report_generator.py <working_release> <broken_release>

Replace this script with the real analyzer once it is ready.
"""

import sys

def main():
    if len(sys.argv) < 3:
        print("Usage: report_generator.py <working_release> <broken_release>", file=sys.stderr)
        sys.exit(1)

    working = sys.argv[1]
    broken  = sys.argv[2]

    print(f"Version Fault — Regression Report")
    print(f"Working release : {working}")
    print(f"Broken release  : {broken}")
    print()
    print("--- Analysis Results (placeholder) ---")
    print("Commits analyzed : 9")
    print("Files changed    : 6")
    print("Failing tests    : 1")
    print()
    print("Suspected culprit commit: abc1234 — \"Refactor payment module\"")
    print("Introduced in   : src/payment/processor.py")
    print()
    print("[!] Replace this script with the real analyzer when ready.")

if __name__ == "__main__":
    main()

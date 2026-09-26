#!/usr/bin/env python3
"""
Placeholder fix script for Version Fault.

Usage:
    python fix_issue.py <working_release> <broken_release> <culprit_commit> <culprit_file>

Prints a fake diff-style output so the end-to-end Investigate -> Fix -> Success
flow can be tested before the real fix-generation script is ready.
Exits 0 on success so the extension shows the success banner.
"""

import sys

def main():
    if len(sys.argv) < 5:
        print(
            "Usage: fix_issue.py <working_release> <broken_release> "
            "<culprit_commit> <culprit_file>",
            file=sys.stderr,
        )
        sys.exit(1)

    working  = sys.argv[1]
    broken   = sys.argv[2]
    culprit  = sys.argv[3]
    file     = sys.argv[4]

    print(f"Applying fix for regression: {working} -> {broken}")
    print(f"Culprit commit : {culprit}")
    print(f"Target file    : {file}")
    print()
    print(f"Modified: {file}")
    print("Lines changed: 42-47")
    print()
    print("@@ -42,6 +42,7 @@")
    print(" def process_payment(order):")
    print("+    if order is None:")
    print("+        raise ValueError('order must not be None')")
    print("     discount = get_legacy_discount(order)")
    print("-    discount = apply_legacy_rate(discount)  # unused legacy step")
    print("     return charge(order, discount)")
    print()
    print("+ added a null check before calling process_payment()")
    print("- removed unused legacy discount calculation")

if __name__ == "__main__":
    main()

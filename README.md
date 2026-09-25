# RegressGuard

**RegressGuard** is an IDE extension that automatically finds, explains, and fixes software regressions — bugs that appear when a previously working release stops working after a new change.

It combines Git history analysis, automated test evidence, and IBM Bob's AI investigation and repair capabilities into a single "Investigate Regression" workflow you can run without ever leaving your editor.

---

## The Problem

Every developer has hit this situation:

> "It worked in the last release. Now it's broken. Something in between broke it — but what, and why?"

Finding a regression today usually means manually:
- Diffing two versions or tags to see what changed
- Re-running the test suite to find out what's failing and why
- Reading through commits one by one, guessing which one is the culprit
- Reasoning about the root cause by hand
- Writing and verifying a fix

This is slow, repetitive, and easy to get wrong — especially under time pressure, in unfamiliar codebases, or during a hackathon/on-call scenario. RegressGuard automates this investigative process end-to-end.

---

## What RegressGuard Does

Given a **working release** (e.g. `v1.0`) and a **broken release** (e.g. `v2.0`), RegressGuard:

1. Collects **Git evidence** — the commits, changed files, and diffs between the two versions.
2. Collects **test evidence** — runs `pytest` and captures exactly which test(s) fail and how.
3. Combines both into a single, clean evidence report (`regression_context.md`).
4. Hands that report to **IBM Bob**, which:
   - Investigates the evidence to identify the most likely root-cause commit/function
   - Explains *why* it believes that's the cause
   - Creates a safe, minimal fix plan
   - Applies the fix (via Bob Agent mode)
5. Re-runs the test suite to **verify** the fix actually resolves the regression.

If tests pass afterward, RegressGuard reports: **"Regression Fixed."**

---

## How It Works (Architecture)

RegressGuard is intentionally a **thin IDE shell around a Python engine**, with IBM Bob doing the actual reasoning and repair work.

```
IDE Extension (TypeScript)
        │
        ▼
Python Analyzer Engine
  ├── Git Analyzer   → commits, changed files, diffs
  └── Test Analyzer  → pytest run, failing test + error
        │
        ▼
regression_context.md   (single evidence report)
        │
        ▼
IBM Bob Investigation
  ├── Reads report + source code + tests + Git history
  ├── Identifies likely root cause and explains it
  ├── Plans the smallest safe fix
  └── Applies the fix (Agent mode)
        │
        ▼
pytest re-run → Verified Fixed ✅
```

**Component breakdown:**

| Layer | Technology | Responsibility |
|---|---|---|
| IDE extension | TypeScript | Command + panel UI; triggers the Python workflow and displays results |
| Analysis engine | Python | Git diffing, running/capturing pytest results, generating the evidence report |
| Version comparison | Git CLI | Comparing tags, commits, changed files, diffs |
| AI reasoning & repair | IBM Bob | Root-cause investigation, fix planning, applying code changes, verification |
| UI | Simple webview/panel | Shows regression status and evidence summary |

There is intentionally **no database, no cloud backend, and no custom ML model** — all "intelligence" comes from IBM Bob reasoning over the evidence Python collects.

---

## End-to-End Workflow

1. Developer opens a Python repository in IBM Bob.
2. Developer opens the RegressGuard extension panel.
3. They select the last **working** release (e.g. `v1.0`) and the **broken** release (e.g. `v2.0`).
4. They click **Investigate Regression**.
5. RegressGuard runs the Python Git Analyzer to collect commits, changed files, and diffs.
6. RegressGuard runs the Python Test Analyzer to execute `pytest` and capture the failing test.
7. RegressGuard generates `reports/regression_context.md`, combining both sets of evidence.
8. IBM Bob reads the report along with the source code, tests, and Git history.
9. Bob identifies the most likely bad commit/function and explains its reasoning.
10. Bob creates a minimal, safe fix plan.
11. Bob (Agent mode) applies the fix.
12. RegressGuard/Bob re-runs `pytest`.
13. If all tests pass, the extension shows **"Regression Fixed."**

---

## Key Features

- **Release Selector** — pick the working vs. broken version to compare (`v1.0` → `v2.0`)
- **Git Analyzer** — collects commits, changed files, and key diffs between releases
- **Test Analyzer** — runs `pytest` and captures the failing test and error output
- **Context Generator** — produces a single, clean evidence file for Bob to reason over
- **Bob Investigation** — studies Git + test + code evidence to find the likely root cause
- **Bob Repair** — plans and applies the smallest safe fix
- **Verification** — re-runs tests to confirm the regression is actually resolved

---

## What This Is Not (Scope)

To stay realistic and demoable, RegressGuard deliberately does **not** attempt to be:

- A full CI/CD platform or replacement
- A general-purpose AI coding assistant
- A custom-trained ML model
- A database-backed or cloud service
- A Kubernetes/cloud deployment
- A heavy React-based UI
- A marketplace-published extension
- A large static-analysis system
- A tool supporting many unrelated developer workflows

The goal is a focused, reliable, end-to-end demo of one thing: **turning a regression into a diagnosed and verified fix, automatically.**

---

## Project Structure

```
regressguard/
├── extension/
│   ├── src/
│   │   ├── extension.ts
│   │   └── panel.ts
│   ├── package.json
│   └── tsconfig.json
├── analyzer/
│   ├── git_analyzer.py
│   ├── test_analyzer.py
│   └── report_generator.py
├── demo_project/
├── reports/
├── bob_sessions/
├── README.md
└── requirements.txt
```

---

## Why This Matters

Regression triage is one of the most common, time-consuming, and cognitively tiring parts of software development — especially when a change set is large or the codebase is unfamiliar. By automating evidence collection (Git + tests) and pairing it with AI-driven root-cause investigation and repair, RegressGuard turns a process that can take hours of manual digging into a single click and a few minutes of automated investigation — with a verified, tested fix at the end, not just a guess.

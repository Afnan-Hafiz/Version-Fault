# Project Architecture Rules (Non-Obvious Only)

- The Python engine (`analyzer/`) and TypeScript extension (`extension/versionfault/`) are **entirely decoupled** — the extension is expected to shell out to Python scripts; there is no shared module or API contract defined yet.
- There is no database, cloud backend, or custom ML — all intelligence is delegated to IBM Bob reading `reports/regression_context.md`. The report is the **only** interface between the Python layer and Bob.
- Git tags (`v1.0`, `v2.0`) in the repo are the canonical working/broken version markers for the demo — the analyzer is expected to diff between these tags, not arbitrary commits.
- `demo_project/invoice.py` is intentionally broken between `v1.0` and `v2.0` to serve as the regression demo target — treat it as a fixture, not production code.
- The Python layer must produce `reports/regression_context.md` as its sole output artifact; Bob reads this file, not stdout or structured JSON.
- No monorepo tooling (nx, turborepo, lerna) — Python and TypeScript parts are independent and must be managed/run separately.

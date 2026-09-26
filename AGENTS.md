# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

Version Fault is an IDE extension (TypeScript) + Python analysis engine that automates regression investigation. IBM Bob does all AI reasoning — the Python layer only collects Git/test evidence.

## Structure

```
extension/versionfault/   ← VS Code extension (TypeScript, compiled to out/)
analyzer/                 ← Python analysis engine (git_analyzer.py, test_analyzer.py, report_generator.py) — currently empty
demo_project/             ← Target Python project used for demos (invoice.py + test_invoice.py)
reports/                  ← Output directory for regression_context.md (generated at runtime)
bob_sessions/             ← Bob session artifacts
```

## Commands

### Python (pytest) — run from `demo_project/` directory
Tests import `invoice` directly (no package prefix), so pytest **must** be run from inside `demo_project/`:
```bash
cd demo_project && pytest                          # all tests
cd demo_project && pytest test_invoice.py::test_calculate_total_with_discount_and_tax  # single test
```
No `pytest.ini`, `setup.cfg`, or `pyproject.toml` exists — there is no configured test root.

### TypeScript Extension — run from `extension/versionfault/`
```bash
cd extension/versionfault && npm run compile       # tsc build → out/
cd extension/versionfault && npm run lint          # eslint src/
cd extension/versionfault && npm test              # vscode-test (requires VS Code environment)
```
`pretest` auto-runs compile + lint before `npm test`.

## Code Style

### Python
- No formatter config (black/ruff/flake8 not present); follow PEP 8
- Functions use `snake_case`; no type annotations in existing code
- Docstrings use simple inline format: `"""items: list of (price, quantity) tuples"""`
- `apply_discount` takes `discount_percent` as a raw fraction of subtotal (NOT a /100 value) — e.g. `10` means subtract `subtotal * 10`, not `subtotal * 0.1`. Verify this when modifying discount logic.

### TypeScript (extension)
- `strict: true` in tsconfig; target ES2022, module Node16
- ESLint rules (all `warn`, not `error`): `curly`, `eqeqeq`, `no-throw-literal`, `semi`
- Import naming: `camelCase` or `PascalCase` only (enforced by `@typescript-eslint/naming-convention`)
- Extension tests use **Mocha** (`suite`/`test`) via `@vscode/test-cli`, not Jest/vitest
- Test files compiled to `out/test/` — `@vscode/test-cli` picks up `out/test/**/*.test.js`

## Critical Gotchas

- `analyzer/` directory is **empty** — the Python engine files described in README (`git_analyzer.py`, `test_analyzer.py`, `report_generator.py`) do not exist yet and need to be created.
- `reports/` directory is **empty** — `regression_context.md` is generated at runtime.
- The `.venv` is at the repo root; activate with `source .venv/bin/activate` before running pytest outside of `demo_project/`.
- Extension is not published to VS Code Marketplace and has no activation beyond the `helloWorld` stub command.

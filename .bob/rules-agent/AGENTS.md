# Project Coding Rules (Non-Obvious Only)

- `analyzer/` is **empty** — all engine files (`git_analyzer.py`, `test_analyzer.py`, `report_generator.py`) described in README must be created from scratch.
- Python tests use bare module imports (`from invoice import ...`) — tests **must run from `demo_project/`** or they will fail with `ModuleNotFoundError`. There is no `conftest.py` or `sys.path` shim.
- `apply_discount(subtotal, discount_percent)` multiplies `discount_percent` directly against the subtotal (no /100 division) — a value of `10` means "subtract 10× the subtotal", not 10%. This is almost certainly a latent bug in the demo project; do not "fix" it unless explicitly asked.
- Extension TypeScript compiles to `out/` (not `dist/`); `@vscode/test-cli` only picks up `out/test/**/*.test.js` — new test files must be under `src/test/`.
- No formatter (black, ruff, prettier) is configured anywhere; match surrounding style manually.
- `.venv` is at repo root, not inside `demo_project/` or `analyzer/`.

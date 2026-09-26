# Project Documentation Rules (Non-Obvious Only)

- README describes a full Python engine in `analyzer/` — none of those files exist yet. README is aspirational, not current state.
- `demo_project/` is the **regression target** (the broken Python project Bob investigates), not a test fixture for the extension itself.
- `bob_sessions/` stores Bob AI session artifacts — currently empty; populated at runtime during regression investigations.
- `reports/` stores `regression_context.md` — the single evidence file Bob reads; it does not persist between sessions.
- The extension in `extension/versionfault/` is a VS Code extension stub — only a `helloWorld` command is wired up; the full panel/workflow UI described in README is not yet implemented.
- Tags `v1.0` and `v2.0` exist in the git repo — they represent the working vs. broken releases used in the regression demo.

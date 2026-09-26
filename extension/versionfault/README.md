# Version Fault

Investigate regressions between working and broken releases using the repository's Python analyzer.

## Run It

1. Open `extension/versionfault` in VS Code.
2. Press **F5** to launch the Extension Development Host.
3. Open the Command Palette and run **Version Fault: Investigate Regression**.
4. Enter the working and broken releases (for example, `v1.0` and `v2.0`), then click **Investigate Regression**.

Python must be available on your `PATH`. If your system uses `python3`, change the spawn command in `src/panel.ts` from `python` to `python3`.
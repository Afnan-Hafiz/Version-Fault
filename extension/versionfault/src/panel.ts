import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

export class RegressionPanel {
	private static current: RegressionPanel | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	private constructor(panel: vscode.WebviewPanel, private readonly _extensionUri: vscode.Uri) {
		this._panel = panel;
		this._panel.webview.html = getWebviewContent();

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			(message: {
				command: string;
				working: string;
				broken: string;
				culprit: string;
				file: string;
			}) => {
				if (message.command === 'investigate') {
					this._runAnalyzer(message.working, message.broken);
				} else if (message.command === 'fix') {
					this._runFix(message.working, message.broken, message.culprit, message.file);
				}
			},
			null,
			this._disposables
		);
	}

	public static createOrShow(extensionUri: vscode.Uri): void {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		if (RegressionPanel.current) {
			RegressionPanel.current._panel.reveal(column);
			return;
		}

		const panel = vscode.window.createWebviewPanel(
			'versionFault',
			'Version Fault',
			column ?? vscode.ViewColumn.One,
			{ enableScripts: true }
		);

		RegressionPanel.current = new RegressionPanel(panel, extensionUri);
	}

	private _resolveWorkspaceRoot(): string {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const candidate = workspaceFolders
			? workspaceFolders[0].uri.fsPath
			: path.resolve(this._extensionUri.fsPath, '..', '..');
		return existsSync(path.join(candidate, 'analyzer', 'report_generator.py'))
			? candidate
			: path.resolve(this._extensionUri.fsPath, '..', '..');
	}

	private _spawnPython(
		scriptPath: string,
		args: string[],
		workspaceRoot: string,
		onDone: (code: number | null, stdout: string, stderr: string) => void
	): void {
		const proc = spawn('python', [scriptPath, ...args], {
			cwd: workspaceRoot,
			env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
		proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

		proc.on('close', (code) => onDone(code, stdout, stderr));

		proc.on('error', (err: Error) => {
			// Treat a spawn error as a non-zero exit with a meaningful message.
			onDone(-1, '', `Failed to start Python: ${err.message}`);
		});
	}

	private _runAnalyzer(working: string, broken: string): void {
		const workspaceRoot = this._resolveWorkspaceRoot();
		const scriptPath = path.join(workspaceRoot, 'analyzer', 'report_generator.py');

		this._panel.webview.postMessage({ type: 'loading' });

		this._spawnPython(scriptPath, [working, broken], workspaceRoot, (code, stdout, stderr) => {
			if (code === 0) {
				this._panel.webview.postMessage({ type: 'result', output: stdout });
			} else {
				const errMsg = stderr.trim() || `Process exited with code ${code}.`;
				this._panel.webview.postMessage({ type: 'error', output: errMsg });
			}
		});
	}

	private _runFix(working: string, broken: string, culprit: string, file: string): void {
		const workspaceRoot = this._resolveWorkspaceRoot();
		const scriptPath = path.join(workspaceRoot, 'analyzer', 'fix_issue.py');

		this._panel.webview.postMessage({ type: 'fixLoading' });

		this._spawnPython(scriptPath, [working, broken, culprit, file], workspaceRoot, (code, stdout, stderr) => {
			if (code === 0) {
				this._panel.webview.postMessage({ type: 'fixResult', output: stdout });
			} else {
				const errMsg = stderr.trim() || `Process exited with code ${code}.`;
				this._panel.webview.postMessage({ type: 'fixError', output: errMsg });
			}
		});
	}

	public dispose(): void {
		RegressionPanel.current = undefined;
		this._panel.dispose();
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
	}
}

function getWebviewContent(): string {
	return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Version Fault</title>
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px;
    max-width: 640px;
  }
  h2 { margin-top: 0; }
  h3 { margin: 18px 0 6px; }
  label { display: block; margin-bottom: 4px; font-weight: bold; }
  input[type="text"] {
    width: 100%;
    box-sizing: border-box;
    padding: 5px 8px;
    margin-bottom: 14px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #888);
    border-radius: 2px;
    font-size: inherit;
  }
  button {
    padding: 6px 16px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-size: inherit;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .status {
    margin-top: 8px;
    font-style: italic;
    color: var(--vscode-descriptionForeground);
    min-height: 18px;
  }
  .output-block {
    margin-top: 14px;
    padding: 10px;
    white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
    min-height: 80px;
    color: var(--vscode-foreground);
  }
  .output-block.error { color: var(--vscode-errorForeground, #f48771); }
  /* Fix section — hidden until a report is ready */
  #fixSection { display: none; margin-top: 20px; }
  /* Success banner */
  #successBanner {
    display: none;
    margin-top: 14px;
    padding: 10px 14px;
    background: var(--vscode-testing-iconPassed, #388a34);
    color: #fff;
    font-weight: bold;
    font-size: 1.05em;
    border-radius: 2px;
  }
  /* Separator between the two main sections */
  .section-divider {
    margin: 22px 0 18px;
    border: none;
    border-top: 1px solid var(--vscode-input-border, #444);
  }
</style>
</head>
<body>
<h2>Version Fault — Investigate Regression</h2>

<label for="working">Working release</label>
<input type="text" id="working" placeholder="e.g. v1.0" />

<label for="broken">Broken release</label>
<input type="text" id="broken" placeholder="e.g. v2.0" />

<button id="runBtn" onclick="runInvestigation()">Investigate Regression</button>
<div class="status" id="status"></div>
<div class="output-block" id="output"></div>

<!-- Fix section: revealed after a successful investigation -->
<div id="fixSection">
  <hr class="section-divider">
  <button id="fixBtn" onclick="runFix()">Fix The Issue</button>
  <div class="status" id="fixStatus"></div>
  <div id="successBanner">&#10003; ALL ISSUES ARE FIXED NOW!</div>
  <div id="fixSection-changes" style="display:none">
    <h3>Changes Applied</h3>
    <div class="output-block" id="fixOutput"></div>
  </div>
</div>

<script>
  const vscode = acquireVsCodeApi();

  // Parsed from the last successful investigation report.
  let lastWorking  = '';
  let lastBroken   = '';
  let lastCulprit  = '';
  let lastFile     = '';

  // ── Investigate ────────────────────────────────────────────────────────────

  function runInvestigation() {
    const working = document.getElementById('working').value.trim();
    const broken  = document.getElementById('broken').value.trim();

    if (!working || !broken) {
      setStatus('Please enter both release values.', false);
      return;
    }

    document.getElementById('runBtn').disabled = true;
    setStatus('Running analysis\u2026', false);
    setOutput('', false);
    hideFixSection();

    vscode.postMessage({ command: 'investigate', working, broken });
  }

  // ── Fix ────────────────────────────────────────────────────────────────────

  function runFix() {
    document.getElementById('fixBtn').disabled = true;
    document.getElementById('fixBtn').textContent = 'Fixing\u2026';
    setFixStatus('Running fix script\u2026', false);
    document.getElementById('successBanner').style.display = 'none';
    document.getElementById('fixSection-changes').style.display = 'none';

    vscode.postMessage({
      command: 'fix',
      working:  lastWorking,
      broken:   lastBroken,
      culprit:  lastCulprit,
      file:     lastFile,
    });
  }

  // ── Message handler ────────────────────────────────────────────────────────

  window.addEventListener('message', event => {
    const msg = event.data;

    // -- Investigation messages --
    if (msg.type === 'loading') {
      setStatus('Running analysis\u2026', false);
      setOutput('', false);

    } else if (msg.type === 'result') {
      document.getElementById('runBtn').disabled = false;
      setStatus('Done.', false);
      setOutput(msg.output, false);
      // Parse culprit info and reveal the Fix button.
      parseReport(msg.output);
      showFixSection();

    } else if (msg.type === 'error') {
      document.getElementById('runBtn').disabled = false;
      setStatus('Error.', false);
      setOutput(msg.output, true);
      hideFixSection();

    // -- Fix messages --
    } else if (msg.type === 'fixLoading') {
      // button already disabled in runFix()

    } else if (msg.type === 'fixResult') {
      resetFixButton();
      setFixStatus('', false);
      document.getElementById('successBanner').style.display = 'block';
      document.getElementById('fixOutput').textContent = msg.output;
      document.getElementById('fixSection-changes').style.display = 'block';

    } else if (msg.type === 'fixError') {
      resetFixButton();
      setFixStatus('Fix failed: ' + msg.output, true);
      document.getElementById('successBanner').style.display = 'none';
    }
  });

  // ── Helpers ────────────────────────────────────────────────────────────────

  function parseReport(text) {
    // Extract the working/broken releases echoed in the report.
    const workingMatch = text.match(/Working release\s*:\s*(.+)/i);
    const brokenMatch  = text.match(/Broken release\s*:\s*(.+)/i);
    const culpritMatch = text.match(/Suspected culprit commit:\s*(.+)/i);
    const fileMatch    = text.match(/Introduced in\s*:\s*(.+)/i);

    lastWorking  = workingMatch  ? workingMatch[1].trim()  : document.getElementById('working').value.trim();
    lastBroken   = brokenMatch   ? brokenMatch[1].trim()   : document.getElementById('broken').value.trim();
    lastCulprit  = culpritMatch  ? culpritMatch[1].trim()  : '';
    lastFile     = fileMatch     ? fileMatch[1].trim()     : '';
  }

  function showFixSection() {
    const sec = document.getElementById('fixSection');
    sec.style.display = 'block';
    resetFixButton();
    document.getElementById('successBanner').style.display = 'none';
    document.getElementById('fixSection-changes').style.display = 'none';
    setFixStatus('', false);
  }

  function hideFixSection() {
    document.getElementById('fixSection').style.display = 'none';
  }

  function resetFixButton() {
    const btn = document.getElementById('fixBtn');
    btn.disabled = false;
    btn.textContent = 'Fix The Issue';
  }

  function setStatus(text, isError) {
    const el = document.getElementById('status');
    el.textContent = text;
    el.style.color = isError
      ? 'var(--vscode-errorForeground, #f48771)'
      : 'var(--vscode-descriptionForeground)';
  }

  function setFixStatus(text, isError) {
    const el = document.getElementById('fixStatus');
    el.textContent = text;
    el.style.color = isError
      ? 'var(--vscode-errorForeground, #f48771)'
      : 'var(--vscode-descriptionForeground)';
  }

  function setOutput(text, isError) {
    const el = document.getElementById('output');
    el.textContent = text;
    el.className = 'output-block' + (isError ? ' error' : '');
  }
</script>
</body>
</html>`;
}

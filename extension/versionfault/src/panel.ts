import * as vscode from 'vscode';
import * as path from 'path';
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
			(message: { command: string; working: string; broken: string }) => {
				if (message.command === 'investigate') {
					this._runAnalyzer(message.working, message.broken);
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

	private _runAnalyzer(working: string, broken: string): void {
		// Resolve the script relative to the workspace root.
		// The extension lives at <workspace>/extension/versionfault, so the
		// analyzer is two levels up from the extension root.
		const workspaceFolders = vscode.workspace.workspaceFolders;
		const workspaceRoot = workspaceFolders
			? workspaceFolders[0].uri.fsPath
			: path.resolve(this._extensionUri.fsPath, '..', '..');

		const scriptPath = path.join(workspaceRoot, 'analyzer', 'report_generator.py');

		this._panel.webview.postMessage({ type: 'loading' });

		const proc = spawn('python', [scriptPath, working, broken], {
			cwd: workspaceRoot,
		});

		let stdout = '';
		let stderr = '';

		proc.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});

		proc.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		proc.on('close', (code: number | null) => {
			if (code === 0) {
				this._panel.webview.postMessage({ type: 'result', output: stdout });
			} else {
				const errMsg = stderr.trim() || `Process exited with code ${code}.`;
				this._panel.webview.postMessage({ type: 'error', output: errMsg });
			}
		});

		proc.on('error', (err: Error) => {
			this._panel.webview.postMessage({
				type: 'error',
				output: `Failed to start Python: ${err.message}`,
			});
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
  #status {
    margin-top: 8px;
    font-style: italic;
    color: var(--vscode-descriptionForeground);
    min-height: 18px;
  }
  #output {
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
  #output.error { color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>
<h2>Version Fault — Investigate Regression</h2>

<label for="working">Working release</label>
<input type="text" id="working" placeholder="e.g. v1.0" />

<label for="broken">Broken release</label>
<input type="text" id="broken" placeholder="e.g. v2.0" />

<button id="runBtn" onclick="runInvestigation()">Investigate Regression</button>
<div id="status"></div>
<div id="output"></div>

<script>
  const vscode = acquireVsCodeApi();

  function runInvestigation() {
    const working = document.getElementById('working').value.trim();
    const broken  = document.getElementById('broken').value.trim();

    if (!working || !broken) {
      setStatus('Please enter both release values.', false);
      return;
    }

    document.getElementById('runBtn').disabled = true;
    setStatus('Running analysis…', false);
    setOutput('', false);

    vscode.postMessage({ command: 'investigate', working, broken });
  }

  window.addEventListener('message', event => {
    const msg = event.data;
    document.getElementById('runBtn').disabled = false;

    if (msg.type === 'loading') {
      setStatus('Running analysis…', false);
      setOutput('', false);
    } else if (msg.type === 'result') {
      setStatus('Done.', false);
      setOutput(msg.output, false);
    } else if (msg.type === 'error') {
      setStatus('Error.', false);
      setOutput(msg.output, true);
    }
  });

  function setStatus(text, isError) {
    const el = document.getElementById('status');
    el.textContent = text;
    el.style.color = isError
      ? 'var(--vscode-errorForeground, #f48771)'
      : 'var(--vscode-descriptionForeground)';
  }

  function setOutput(text, isError) {
    const el = document.getElementById('output');
    el.textContent = text;
    el.className = isError ? 'error' : '';
  }
</script>
</body>
</html>`;
}

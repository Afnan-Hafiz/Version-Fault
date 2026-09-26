import * as vscode from 'vscode';
import * as path from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

export class RegressionPanel {
	private static current: RegressionPanel | undefined;

	private readonly _panel: vscode.WebviewPanel;
	private readonly _outputChannel?: vscode.OutputChannel;
	private _disposables: vscode.Disposable[] = [];
	private readonly _cwd: string | undefined;

	private constructor(
		panel: vscode.WebviewPanel,
		private readonly _extensionUri: vscode.Uri,
		outputChannel?: vscode.OutputChannel
	) {
		this._panel = panel;
		this._outputChannel = outputChannel;
		this._log('RegressionPanel: initializing...');

		// Resolve path ONCE at creation so it's stable for the whole session
		const res = this._resolveWorkspaceRoot();
		this._cwd = res.path;

		const cspSource = this._panel.webview.cspSource;
		const scriptUri = this._panel.webview.asWebviewUri(
			vscode.Uri.joinPath(this._extensionUri, 'media', 'panel.js')
		);
		this._panel.webview.html = buildWebviewHtml(scriptUri.toString(), cspSource, res.path, res.error);
		this._log(`RegressionPanel: HTML set. cwd=${this._cwd}, error=${res.error}`);

		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		this._panel.webview.onDidReceiveMessage(
			async (message: {
				command: string;
				working?: string;
				broken?: string;
				culprit?: string;
				file?: string;
				text?: string;
			}) => {
				this._log(`[Webview->Host] command=${message.command}${message.text ? ` (${message.text})` : ''}`);
				try {
					switch (message.command) {
						case 'webviewReady':
							this._log('[Webview] UI script loaded and running successfully.');
							break;
						case 'webviewError':
							this._log(`[Webview ERROR] ${message.text}`);
							break;
						case 'investigate':
							await this._runAnalyzer(message.working ?? '', message.broken ?? '');
							break;
						case 'fix':
							await this._runFix(
								message.working ?? '',
								message.broken ?? '',
								message.culprit ?? '',
								message.file ?? ''
							);
							break;
						default:
							this._log(`[Webview->Host] unknown command: ${message.command}`);
							break;
					}
				} catch (err: unknown) {
					const detail = err instanceof Error ? err.message : String(err);
					this._log(`[Webview->Host] command failed: ${detail}`);
					this._post({ type: message.command === 'fix' ? 'fixError' : 'error', output: detail });
				}
			},
			null,
			this._disposables
		);
	}

	// ── Public API ──────────────────────────────────────────────────────────────

	public static createOrShow(extensionUri: vscode.Uri, outputChannel?: vscode.OutputChannel): void {
		const column = vscode.window.activeTextEditor?.viewColumn;

		if (RegressionPanel.current) {
			outputChannel?.appendLine(`[${new Date().toISOString()}] RegressionPanel already open, revealing tab.`);
			RegressionPanel.current._panel.reveal(column);
			return;
		}

		outputChannel?.appendLine(`[${new Date().toISOString()}] Creating new RegressionPanel webview.`);

		const panel = vscode.window.createWebviewPanel(
			'versionFault',
			'Version Fault',
			column ?? vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
			}
		);

		RegressionPanel.current = new RegressionPanel(panel, extensionUri, outputChannel);
	}

	public dispose(): void {
		this._log('RegressionPanel: disposing.');
		RegressionPanel.current = undefined;
		this._panel.dispose();
		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
	}

	// ── Logging ─────────────────────────────────────────────────────────────────

	private _log(msg: string): void {
		const line = `[${new Date().toISOString()}] ${msg}`;
		console.log(`[VersionFault] ${line}`);
		this._outputChannel?.appendLine(line);
	}

	private _post(msg: object): void {
		this._log(`[Host->Webview] ${JSON.stringify(msg).slice(0, 120)}`);
		this._panel.webview.postMessage(msg);
	}

	// ── Path resolution ──────────────────────────────────────────────────────────

	private _resolveWorkspaceRoot(): { path?: string; error?: string } {
		const marker = path.join('analyzer', 'report_generator.py');
		this._log(`[Path] resolving workspace root (marker: ${marker})...`);

		const candidates: string[] = [];

		for (const wf of vscode.workspace.workspaceFolders ?? []) {
			candidates.push(wf.uri.fsPath);
		}

		// Walk up from __dirname (.../extension/versionfault/out → … → repo root)
		let d = __dirname;
		for (let i = 0; i < 8; i++) {
			candidates.push(d);
			const parent = path.dirname(d);
			if (parent === d) { break; }
			d = parent;
		}

		// Walk up from extensionUri
		let u = this._extensionUri.fsPath;
		for (let i = 0; i < 6; i++) {
			candidates.push(u);
			const parent = path.dirname(u);
			if (parent === u) { break; }
			u = parent;
		}

		const seen = new Set<string>();
		for (const c of candidates) {
			if (!c || seen.has(c)) { continue; }
			seen.add(c);
			try {
				const full = path.join(c, marker);
				if (existsSync(full)) {
					this._log(`[Path] resolved: ${c}`);
					return { path: c };
				}
			} catch { /* skip */ }
		}

		const noFolder = !vscode.workspace.workspaceFolders?.length;
		const errMsg = noFolder
			? 'No project folder open — please open the Version-Fault repo root.'
			: `Cannot find analyzer/report_generator.py in the open workspace. Open the Version-Fault repo root.`;
		this._log(`[Path] failed: ${errMsg}`);
		return { error: errMsg };
	}

	// ── Git validation ───────────────────────────────────────────────────────────

	private _gitExec(args: string[], cwd: string, timeoutMs: number): Promise<{ code: number }> {
		return new Promise((resolve) => {
			let done = false;

			const proc = spawn('git', args, { cwd, stdio: 'ignore' });

			const timer = setTimeout(() => {
				if (done) { return; }
				done = true;
				try { proc.kill(); } catch { /* noop */ }
				resolve({ code: -99 });
			}, timeoutMs);

			proc.on('error', () => {
				if (done) { return; }
				done = true;
				clearTimeout(timer);
				resolve({ code: -1 });
			});

			proc.on('close', (code) => {
				if (done) { return; }
				done = true;
				clearTimeout(timer);
				resolve({ code: code ?? -1 });
			});
		});
	}

	private async _validateRef(ref: string, cwd: string): Promise<string | null> {
		this._log(`[Git] validating ref '${ref}' in ${cwd}...`);
		const { code } = await this._gitExec(['cat-file', '-e', `${ref}^{commit}`], cwd, 10000);
		if (code === 0) {
			this._log(`[Git] ref '${ref}' valid`);
			return null;
		}
		const msg = `Git ref '${ref}' not found in this repo (exit ${code}). Use a valid commit SHA, branch, or tag.`;
		this._log(`[Git] ref '${ref}' invalid: exit=${code}`);
		return msg;
	}

	// ── Python process ───────────────────────────────────────────────────────────

	private _spawnPy(
		scriptPath: string,
		args: string[],
		cwd: string,
		timeoutMs: number,
		onDone: (code: number | null, stdout: string, stderr: string) => void
	): void {
		this._log(`[Py] spawn: python ${path.basename(scriptPath)} ${args.join(' ')}`);

		let proc: ReturnType<typeof spawn>;
		try {
			proc = spawn('python', [scriptPath, ...args], {
				cwd,
				env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
			});
		} catch (err: unknown) {
			const msg = err instanceof Error ? err.message : String(err);
			this._log(`[Py] spawn failed: ${msg}`);
			onDone(-1, '', `Failed to start python: ${msg}`);
			return;
		}

		let stdout = '';
		let stderr = '';
		let done = false;

		const timer = setTimeout(() => {
			if (done) { return; }
			done = true;
			const tmsg = `Timed out after ${timeoutMs / 1000}s`;
			this._log(`[Py] ${tmsg}`);
			try {
				if (process.platform === 'win32' && proc.pid) {
					spawn('taskkill', ['/pid', proc.pid.toString(), '/T', '/F']);
				} else {
					proc.kill();
				}
			} catch { /* noop */ }
			onDone(-1, stdout, tmsg);
		}, timeoutMs);

		proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
		proc.stderr?.on('data', (d: Buffer) => {
			const s = d.toString();
			stderr += s;
			this._log(`[Py stderr] ${s.trim()}`);
		});
		proc.on('close', (code) => {
			if (done) { return; }
			done = true;
			clearTimeout(timer);
			this._log(`[Py] exit code=${code} stdout.len=${stdout.length}`);
			onDone(code, stdout, stderr);
		});
		proc.on('error', (err) => {
			if (done) { return; }
			done = true;
			clearTimeout(timer);
			this._log(`[Py] error: ${err.message}`);
			onDone(-1, '', `Python process error: ${err.message}`);
		});
	}

	// ── Analyze ──────────────────────────────────────────────────────────────────

	private async _runAnalyzer(working: string, broken: string): Promise<void> {
		this._log(`[Analyzer] working='${working}' broken='${broken}'`);

		const cwd = this._cwd;
		if (!cwd) {
			this._post({ type: 'error', output: 'Cannot find project root. Open the Version-Fault repo folder in VS Code.' });
			return;
		}

		// Immediately acknowledge so the webview shows "Running…"
		this._post({ type: 'loading' });

		const workingErr = await this._validateRef(working, cwd);
		if (workingErr) {
			this._post({ type: 'error', output: workingErr });
			return;
		}
		const brokenErr = await this._validateRef(broken, cwd);
		if (brokenErr) {
			this._post({ type: 'error', output: brokenErr });
			return;
		}

		const scriptPath = path.join(cwd, 'analyzer', 'report_generator.py');
		if (!existsSync(scriptPath)) {
			this._post({ type: 'error', output: `Script not found: ${scriptPath}` });
			return;
		}

		this._log(`[Analyzer] spawning python...`);
		this._spawnPy(scriptPath, [working, broken, '--workspace', cwd], cwd, 60000, (code, stdout, stderr) => {
			if (code === 0) {
				try {
					const report = JSON.parse(stdout);
					this._log(`[Analyzer] done — ${report.commits_analyzed?.length ?? 0} commits`);
					this._post({ type: 'result', report });
				} catch (e: unknown) {
					const msg = e instanceof Error ? e.message : String(e);
					this._log(`[Analyzer] JSON parse error: ${msg}`);
					this._post({ type: 'error', output: `Script returned invalid JSON:\n${stdout}\n${stderr}`.trim() });
				}
			} else {
				const errMsg = stderr.trim() || stdout.trim() || `Python exited with code ${code}.`;
				this._log(`[Analyzer] failed: ${errMsg}`);
				this._post({ type: 'error', output: errMsg });
			}
		});
	}

	// ── Fix ──────────────────────────────────────────────────────────────────────

	private async _runFix(working: string, broken: string, culprit: string, file: string): Promise<void> {
		this._log(`[Fix] working='${working}' broken='${broken}' culprit='${culprit}' file='${file}'`);

		const cwd = this._cwd;
		if (!cwd) {
			this._post({ type: 'fixError', output: 'Cannot find project root.' });
			return;
		}

		const scriptPath = path.join(cwd, 'analyzer', 'fix_issue.py');
		if (!existsSync(scriptPath)) {
			this._post({ type: 'fixError', output: `Script not found: ${scriptPath}` });
			return;
		}

		this._post({ type: 'fixLoading' });

		this._spawnPy(scriptPath, [working, broken, culprit, file, '--workspace', cwd], cwd, 60000, (code, stdout, stderr) => {
			try {
				const fixResult = JSON.parse(stdout);
				if (fixResult.status === 'fixed') {
					this._log(`[Fix] success`);
					this._post({ type: 'fixResult', fixResult });
				} else {
					const errMsg = fixResult.error || 'Fix failed.';
					this._log(`[Fix] script reported failure: ${errMsg}`);
					this._post({ type: 'fixError', output: errMsg });
				}
			} catch {
				const errMsg = stderr.trim() || stdout.trim() || `Python exited with code ${code}.`;
				this._log(`[Fix] failed: ${errMsg}`);
				this._post({ type: 'fixError', output: errMsg });
			}
		});
	}
}

// ── Webview HTML ─────────────────────────────────────────────────────────────

function buildWebviewHtml(scriptUri: string, cspSource: string, initialPath: string | undefined, initialError: string | undefined): string {
	const pathText = initialError
		? '\u26A0\uFE0F ' + escHtml(initialError)
		: initialPath
			? '\uD83D\uDCC2 Project root: ' + escHtml(initialPath)
			: 'Resolving project path\u2026';

	const pathCls = initialError ? ' class="error"' : '';

	// Whether the path resolved — passed to the webview as a plain JS boolean literal
	const pathOk = initialPath ? 'true' : 'false';

	return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https:; script-src ${cspSource}; style-src 'unsafe-inline' ${cspSource};">
<title>Version Fault</title>
<style>
  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 20px;
    max-width: 700px;
  }
  h2 { margin-top: 0; }
  h3 { margin: 18px 0 6px; font-size: 1em; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }
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
  .report-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-top: 14px;
  }
  .card {
    padding: 10px 12px;
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
  }
  .card.full-width { grid-column: 1 / -1; }
  .card-label {
    font-size: 0.75em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    opacity: 0.6;
    margin-bottom: 6px;
  }
  .card-value {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    white-space: pre-wrap;
    word-break: break-word;
  }
  .badge {
    display: inline-block;
    padding: 1px 7px;
    border-radius: 10px;
    font-size: 0.85em;
    font-weight: bold;
    margin-right: 4px;
    margin-bottom: 3px;
  }
  .badge-red   { background: #5a1c1c; color: #f48771; }
  .badge-green { background: #1c3a1c; color: #89d185; }
  .output-block {
    margin-top: 14px;
    padding: 10px;
    white-space: pre-wrap;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
    min-height: 40px;
    color: var(--vscode-foreground);
  }
  .output-block.error { color: var(--vscode-errorForeground, #f48771); }
  .no-bug-banner {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    margin-top: 14px;
    margin-bottom: 14px;
    background: rgba(46, 160, 67, 0.15);
    border: 1px solid #2ea043;
    border-radius: 4px;
    color: var(--vscode-foreground);
  }
  .no-bug-icon {
    font-size: 2em;
    color: #3fb950;
    line-height: 1;
    font-weight: bold;
    flex-shrink: 0;
  }
  .no-bug-title {
    font-weight: bold;
    font-size: 1.1em;
    color: #3fb950;
    margin-bottom: 3px;
  }
  .no-bug-desc {
    font-size: 0.92em;
    color: var(--vscode-foreground);
    opacity: 0.9;
    line-height: 1.4;
  }
  #fixSection { display: none; margin-top: 20px; }
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
  .section-divider {
    margin: 22px 0 18px;
    border: none;
    border-top: 1px solid var(--vscode-input-border, #444);
  }
  .fix-change-row {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 12px);
    margin-bottom: 6px;
  }
  .fix-change-row .file-name { color: var(--vscode-textLink-foreground, #6aafdd); }
  .fix-change-row .lines     { opacity: 0.7; margin: 0 6px; }
  .fix-pytest {
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    border: 1px solid var(--vscode-input-border, #555);
    border-radius: 2px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 11px);
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
  }
  #pathInfo {
    margin-top: 6px;
    margin-bottom: 14px;
    font-size: 0.78em;
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-descriptionForeground);
    opacity: 0.7;
    word-break: break-all;
  }
  #pathInfo.error { color: var(--vscode-errorForeground, #f48771); opacity: 1; }
</style>
</head>
<body data-path-ok="${pathOk}">
<h2>Version Fault &#8212; Investigate Regression</h2>

<label for="working">Working release</label>
<input type="text" id="working" placeholder="e.g. v1.0 or commit SHA" value="8a39af0" />

<label for="broken">Broken release</label>
<input type="text" id="broken" placeholder="e.g. v2.0 or commit SHA" value="8deb5db" />

<button id="runBtn">Investigate Regression</button>
<div id="pathInfo"${pathCls}>${pathText}</div>
<div class="status" id="status"></div>
<div id="reportArea"></div>

<div id="fixSection">
  <hr class="section-divider">
  <button id="fixBtn" onclick="runFix()">Fix The Issue</button>
  <div class="status" id="fixStatus"></div>
  <div id="successBanner">&#10003; ALL ISSUES ARE FIXED NOW!</div>
  <div id="fixSection-changes" style="display:none">
    <h3>Changes Applied</h3>
    <div id="fixChanges"></div>
    <h3>Pytest Confirmation</h3>
    <div class="fix-pytest" id="fixPytest"></div>
  </div>
</div>

<script src="${scriptUri}"></script>
</body>
</html>`;
}

function escHtml(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

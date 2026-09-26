"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegressionPanel = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs_1 = require("fs");
const child_process_1 = require("child_process");
class RegressionPanel {
    _extensionUri;
    static current;
    _panel;
    _disposables = [];
    constructor(panel, _extensionUri) {
        this._extensionUri = _extensionUri;
        this._panel = panel;
        this._panel.webview.html = getWebviewContent();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
        this._panel.webview.onDidReceiveMessage((message) => {
            if (message.command === 'investigate') {
                this._runAnalyzer(message.working, message.broken);
            }
            else if (message.command === 'fix') {
                this._runFix(message.working, message.broken, message.culprit, message.file);
            }
        }, null, this._disposables);
    }
    static createOrShow(extensionUri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;
        if (RegressionPanel.current) {
            RegressionPanel.current._panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel('versionFault', 'Version Fault', column ?? vscode.ViewColumn.One, { enableScripts: true });
        RegressionPanel.current = new RegressionPanel(panel, extensionUri);
    }
    _resolveWorkspaceRoot() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const candidate = workspaceFolders
            ? workspaceFolders[0].uri.fsPath
            : path.resolve(this._extensionUri.fsPath, '..', '..');
        return (0, fs_1.existsSync)(path.join(candidate, 'analyzer', 'report_generator.py'))
            ? candidate
            : path.resolve(this._extensionUri.fsPath, '..', '..');
    }
    _spawnPython(scriptPath, args, workspaceRoot, onDone) {
        const proc = (0, child_process_1.spawn)('python', [scriptPath, ...args], {
            cwd: workspaceRoot,
            env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
        proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        proc.on('close', (code) => onDone(code, stdout, stderr));
        proc.on('error', (err) => {
            onDone(-1, '', `Failed to start Python: ${err.message}`);
        });
    }
    _runAnalyzer(working, broken) {
        const workspaceRoot = this._resolveWorkspaceRoot();
        const scriptPath = path.join(workspaceRoot, 'analyzer', 'report_generator.py');
        this._panel.webview.postMessage({ type: 'loading' });
        this._spawnPython(scriptPath, [working, broken], workspaceRoot, (code, stdout, stderr) => {
            if (code === 0) {
                try {
                    const report = JSON.parse(stdout);
                    this._panel.webview.postMessage({ type: 'result', report });
                }
                catch {
                    // JSON parse failed — show raw output as error
                    this._panel.webview.postMessage({
                        type: 'error',
                        output: `Script produced invalid JSON:\n${stdout}\n${stderr}`.trim()
                    });
                }
            }
            else {
                const errMsg = stderr.trim() || `Process exited with code ${code}.`;
                this._panel.webview.postMessage({ type: 'error', output: errMsg });
            }
        });
    }
    _runFix(working, broken, culprit, file) {
        const workspaceRoot = this._resolveWorkspaceRoot();
        const scriptPath = path.join(workspaceRoot, 'analyzer', 'fix_issue.py');
        this._panel.webview.postMessage({ type: 'fixLoading' });
        this._spawnPython(scriptPath, [working, broken, culprit, file], workspaceRoot, (code, stdout, stderr) => {
            try {
                const fixResult = JSON.parse(stdout);
                if (fixResult.status === 'fixed') {
                    this._panel.webview.postMessage({ type: 'fixResult', fixResult });
                }
                else {
                    this._panel.webview.postMessage({ type: 'fixError', output: fixResult.error || 'Fix failed.' });
                }
            }
            catch {
                const errMsg = stderr.trim() || stdout.trim() || `Process exited with code ${code}.`;
                this._panel.webview.postMessage({ type: 'fixError', output: errMsg });
            }
        });
    }
    dispose() {
        RegressionPanel.current = undefined;
        this._panel.dispose();
        for (const d of this._disposables) {
            d.dispose();
        }
        this._disposables = [];
    }
}
exports.RegressionPanel = RegressionPanel;
function getWebviewContent() {
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
  /* Report cards */
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
  .badge-blue  { background: #1c2e4a; color: #6aafdd; }
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
  /* Fix section */
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
  .section-divider {
    margin: 22px 0 18px;
    border: none;
    border-top: 1px solid var(--vscode-input-border, #444);
  }
  /* Fix changes */
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
</style>
</head>
<body>
<h2>Version Fault — Investigate Regression</h2>

<label for="working">Working release</label>
<input type="text" id="working" placeholder="e.g. v1.0 or commit SHA" />

<label for="broken">Broken release</label>
<input type="text" id="broken" placeholder="e.g. v2.0 or commit SHA" />

<button id="runBtn" onclick="runInvestigation()">Investigate Regression</button>
<div class="status" id="status"></div>
<div id="reportArea"></div>

<!-- Fix section: revealed after a successful investigation -->
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

<script>
  const vscode = acquireVsCodeApi();

  let lastWorking  = '';
  let lastBroken   = '';
  let lastCulprit  = '';
  let lastFile     = '';

  // ── Investigate ─────────────────────────────────────────────────────────────

  function runInvestigation() {
    const working = document.getElementById('working').value.trim();
    const broken  = document.getElementById('broken').value.trim();

    if (!working || !broken) {
      setStatus('Please enter both release values.', true);
      return;
    }

    document.getElementById('runBtn').disabled = true;
    setStatus('Running analysis\u2026', false);
    document.getElementById('reportArea').innerHTML = '';
    hideFixSection();

    vscode.postMessage({ command: 'investigate', working, broken });
  }

  // ── Fix ─────────────────────────────────────────────────────────────────────

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

  // ── Message handler ─────────────────────────────────────────────────────────

  window.addEventListener('message', event => {
    const msg = event.data;

    if (msg.type === 'loading') {
      setStatus('Running analysis\u2026', false);
      document.getElementById('reportArea').innerHTML = '';

    } else if (msg.type === 'result') {
      document.getElementById('runBtn').disabled = false;
      setStatus('Analysis complete.', false);
      renderReport(msg.report);
      lastWorking = msg.report.working_release;
      lastBroken  = msg.report.broken_release;
      lastCulprit = msg.report.suspected_commit;
      lastFile    = msg.report.suspected_file;
      showFixSection();

    } else if (msg.type === 'error') {
      document.getElementById('runBtn').disabled = false;
      setStatus('Error.', true);
      const el = document.createElement('div');
      el.className = 'output-block error';
      el.textContent = msg.output;
      document.getElementById('reportArea').appendChild(el);
      hideFixSection();

    } else if (msg.type === 'fixLoading') {
      // button already disabled

    } else if (msg.type === 'fixResult') {
      resetFixButton();
      setFixStatus('', false);
      document.getElementById('successBanner').style.display = 'block';
      renderFixChanges(msg.fixResult);
      document.getElementById('fixSection-changes').style.display = 'block';

    } else if (msg.type === 'fixError') {
      resetFixButton();
      setFixStatus('Fix failed: ' + msg.output, true);
      document.getElementById('successBanner').style.display = 'none';
    }
  });

  // ── Render helpers ───────────────────────────────────────────────────────────

  function renderReport(r) {
    const area = document.getElementById('reportArea');
    area.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'report-grid';

    // Commits analyzed
    grid.appendChild(makeCard(
      'Commits Analyzed (' + r.commits_analyzed.length + ')',
      r.commits_analyzed.length === 0
        ? 'none'
        : r.commits_analyzed.map(c => c).join('\n'),
      false
    ));

    // Files changed
    grid.appendChild(makeCard(
      'Files Changed (' + r.files_changed.length + ')',
      r.files_changed.length === 0 ? 'none' : r.files_changed.join('\n'),
      false
    ));

    // Failing tests
    const testsCard = makeCard(
      'Failing Tests (' + r.failing_tests.length + ')',
      '', false
    );
    const testsVal = testsCard.querySelector('.card-value');
    if (r.failing_tests.length === 0) {
      const b = badge('All passing', 'badge-green');
      testsVal.appendChild(b);
    } else {
      r.failing_tests.forEach(t => {
        const b = badge(t, 'badge-red');
        testsVal.appendChild(b);
        testsVal.appendChild(document.createTextNode(' '));
      });
    }
    grid.appendChild(testsCard);

    // Suspected commit
    grid.appendChild(makeCard('Suspected Commit', r.suspected_commit, false));

    // Suspected file — full width
    const fileCard = makeCard('Suspected File', r.suspected_file, true);
    grid.appendChild(fileCard);

    area.appendChild(grid);
  }

  function renderFixChanges(fr) {
    const container = document.getElementById('fixChanges');
    container.innerHTML = '';

    fr.changes.forEach(ch => {
      const row = document.createElement('div');
      row.className = 'fix-change-row';

      const fname = document.createElement('span');
      fname.className = 'file-name';
      fname.textContent = ch.file;

      const lines = document.createElement('span');
      lines.className = 'lines';
      lines.textContent = ch.lines ? '\u2022 ' + ch.lines : '';

      const summary = document.createElement('span');
      summary.textContent = ch.summary;

      row.appendChild(fname);
      row.appendChild(lines);
      row.appendChild(summary);
      container.appendChild(row);
    });

    document.getElementById('fixPytest').textContent = fr.pytest_output || '';
  }

  function makeCard(labelText, valueText, fullWidth) {
    const card = document.createElement('div');
    card.className = 'card' + (fullWidth ? ' full-width' : '');

    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = labelText;

    const value = document.createElement('div');
    value.className = 'card-value';
    value.textContent = valueText;

    card.appendChild(label);
    card.appendChild(value);
    return card;
  }

  function badge(text, cls) {
    const b = document.createElement('span');
    b.className = 'badge ' + cls;
    b.textContent = text;
    return b;
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
</script>
</body>
</html>`;
}
//# sourceMappingURL=panel.js.map
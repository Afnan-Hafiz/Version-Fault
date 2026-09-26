(function () {
  var PATH_OK = document.body.dataset.pathOk === 'true';

  var vscode;
  try {
    vscode = acquireVsCodeApi();
  } catch (err) {
    console.error('[Webview] acquireVsCodeApi failed:', err);
  }

  // Catch any unhandled errors in webview and forward to extension host
  window.onerror = function (msg, source, lineno, colno) {
    try {
      if (vscode) {
        vscode.postMessage({
          command: 'webviewError',
          text: msg + ' (' + (source || 'script') + ':' + lineno + ':' + colno + ')'
        });
      }
    } catch (_) {}
    return false;
  };

  // Signal immediately to extension host that webview JS loaded
  try {
    if (vscode) {
      vscode.postMessage({ command: 'webviewReady' });
    }
  } catch (_) {}

  var lastWorking = '';
  var lastBroken  = '';
  var lastCulprit = '';
  var lastFile    = '';
  var analysisTimer = null;

  window.runInvestigation = runInvestigation;
  window.runFix = runFix;

  var runBtn = document.getElementById('runBtn');
  if (runBtn) { runBtn.addEventListener('click', runInvestigation); }
  var fixBtn = document.getElementById('fixBtn');
  if (fixBtn) { fixBtn.addEventListener('click', runFix); }

  setStatus('Ready. Enter two releases and click Investigate Regression.', false);

  window.addEventListener('message', function (event) {
    var msg = event.data;

    if (msg.type === 'loading') {
      setStatus('Running analysis\u2026', false);
      document.getElementById('reportArea').innerHTML = '';

    } else if (msg.type === 'result') {
      clearTimeout(analysisTimer);
      analysisTimer = null;
      document.getElementById('runBtn').disabled = false;
      var hasBugs = msg.report.has_bug || (msg.report.failing_tests && msg.report.failing_tests.length > 0);
      setStatus(hasBugs ? 'Analysis complete — Regression detected.' : 'Analysis complete — No bugs detected.', false);
      renderReport(msg.report);
      lastWorking = msg.report.working_release  || '';
      lastBroken  = msg.report.broken_release   || '';
      lastCulprit = msg.report.suspected_commit || '';
      lastFile    = msg.report.suspected_file   || '';
      if (hasBugs) {
        showFixSection();
      } else {
        hideFixSection();
      }

    } else if (msg.type === 'error') {
      clearTimeout(analysisTimer);
      analysisTimer = null;
      document.getElementById('runBtn').disabled = false;
      setStatus('Error occurred.', true);
      var el = document.createElement('div');
      el.className = 'output-block error';
      el.textContent = msg.output;
      document.getElementById('reportArea').innerHTML = '';
      document.getElementById('reportArea').appendChild(el);
      hideFixSection();

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

  function runInvestigation() {
    var working = document.getElementById('working').value.trim();
    var broken  = document.getElementById('broken').value.trim();

    if (!working || !broken) {
      setStatus('Please enter both Working and Broken release values.', true);
      return;
    }
    if (!PATH_OK) {
      setStatus('No project folder resolved. Reopen the panel.', true);
      return;
    }

    document.getElementById('runBtn').disabled = true;
    setStatus('Sending request\u2026', false);
    document.getElementById('reportArea').innerHTML = '';
    hideFixSection();

    analysisTimer = setTimeout(function () {
      document.getElementById('runBtn').disabled = false;
      setStatus('No response from the analyzer. Check the Version Fault Output channel, then reload the Extension Development Host and try again.', true);
    }, 90000);
    try {
      vscode.postMessage({ command: 'investigate', working: working, broken: broken });
    } catch (err) {
      clearTimeout(analysisTimer);
      analysisTimer = null;
      document.getElementById('runBtn').disabled = false;
      setStatus('Could not send the request to the extension. Reload the Extension Development Host and try again.', true);
    }
  }

  function runFix() {
    if (!lastCulprit) {
      setFixStatus('Run investigation first.', true);
      return;
    }
    document.getElementById('fixBtn').disabled = true;
    document.getElementById('fixBtn').textContent = 'Fixing\u2026';
    setFixStatus('Running fix script\u2026', false);
    document.getElementById('successBanner').style.display = 'none';
    document.getElementById('fixSection-changes').style.display = 'none';

    vscode.postMessage({
      command: 'fix',
      working: lastWorking,
      broken:  lastBroken,
      culprit: lastCulprit,
      file:    lastFile,
    });
  }

  function renderReport(r) {
    var area = document.getElementById('reportArea');
    area.innerHTML = '';

    var hasBugs = r.has_bug || (r.failing_tests && r.failing_tests.length > 0);

    if (!hasBugs) {
      var banner = document.createElement('div');
      banner.className = 'no-bug-banner';
      banner.innerHTML =
        '<div class="no-bug-icon">&#10003;</div>' +
        '<div class="no-bug-content">' +
          '<div class="no-bug-title">No Bugs Detected!</div>' +
          '<div class="no-bug-desc">All tests passed successfully between <code>' + esc(r.working_release) + '</code> and <code>' + esc(r.broken_release) + '</code>. No regressions or failing test cases were found.</div>' +
        '</div>';
      area.appendChild(banner);
    }

    var grid = document.createElement('div');
    grid.className = 'report-grid';

    grid.appendChild(makeCard(
      'Commits Analyzed (' + r.commits_analyzed.length + ')',
      r.commits_analyzed.length === 0 ? 'none' : r.commits_analyzed.join('\n'),
      false
    ));
    grid.appendChild(makeCard(
      'Files Changed (' + r.files_changed.length + ')',
      r.files_changed.length === 0 ? 'none' : r.files_changed.join('\n'),
      false
    ));

    var testsCard = makeCard('Failing Tests (' + r.failing_tests.length + ')', '', false);
    var testsVal  = testsCard.querySelector('.card-value');
    if (r.failing_tests.length === 0) {
      testsVal.appendChild(badge('All passing', 'badge-green'));
    } else {
      r.failing_tests.forEach(function (t) {
        testsVal.appendChild(badge(t, 'badge-red'));
        testsVal.appendChild(document.createTextNode(' '));
      });
    }
    grid.appendChild(testsCard);

    grid.appendChild(makeCard('Suspected Commit', r.suspected_commit, false));
    grid.appendChild(makeCard('Suspected File',   r.suspected_file,   true));

    area.appendChild(grid);
  }

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderFixChanges(fr) {
    var container = document.getElementById('fixChanges');
    container.innerHTML = '';
    (fr.changes || []).forEach(function (ch) {
      var row = document.createElement('div');
      row.className = 'fix-change-row';
      var fname = document.createElement('span');
      fname.className = 'file-name';
      fname.textContent = ch.file;
      var lines = document.createElement('span');
      lines.className = 'lines';
      lines.textContent = ch.lines ? '\u2022 ' + ch.lines : '';
      var summary = document.createElement('span');
      summary.textContent = ch.summary;
      row.appendChild(fname);
      row.appendChild(lines);
      row.appendChild(summary);
      container.appendChild(row);
    });
    document.getElementById('fixPytest').textContent = fr.pytest_output || '';
  }

  function makeCard(labelText, valueText, fullWidth) {
    var card = document.createElement('div');
    card.className = 'card' + (fullWidth ? ' full-width' : '');
    var label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = labelText;
    var value = document.createElement('div');
    value.className = 'card-value';
    value.textContent = valueText;
    card.appendChild(label);
    card.appendChild(value);
    return card;
  }

  function badge(text, cls) {
    var b = document.createElement('span');
    b.className = 'badge ' + cls;
    b.textContent = text;
    return b;
  }

  function showFixSection() {
    document.getElementById('fixSection').style.display = 'block';
    resetFixButton();
    document.getElementById('successBanner').style.display = 'none';
    document.getElementById('fixSection-changes').style.display = 'none';
    setFixStatus('', false);
  }

  function hideFixSection() {
    document.getElementById('fixSection').style.display = 'none';
  }

  function resetFixButton() {
    var btn = document.getElementById('fixBtn');
    btn.disabled = false;
    btn.textContent = 'Fix The Issue';
  }

  function setStatus(text, isError) {
    var el = document.getElementById('status');
    el.textContent = text;
    el.style.color = isError
      ? 'var(--vscode-errorForeground, #f48771)'
      : 'var(--vscode-descriptionForeground)';
  }

  function setFixStatus(text, isError) {
    var el = document.getElementById('fixStatus');
    el.textContent = text;
    el.style.color = isError
      ? 'var(--vscode-errorForeground, #f48771)'
      : 'var(--vscode-descriptionForeground)';
  }

}());

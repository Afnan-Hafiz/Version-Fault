const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const workspaceRoot = path.resolve(__dirname);

console.log('=== TEST 1: Path Resolution Check ===');
const marker = path.join('analyzer', 'report_generator.py');
const markerExists = fs.existsSync(path.join(workspaceRoot, marker));
console.log(`Marker (${marker}) found: ${markerExists}`);

console.log('\n=== TEST 2: Git Ref Validation ===');
const refsToTest = [
  { ref: '8a39af0', shouldExist: true },
  { ref: '8deb5db', shouldExist: true },
  { ref: 'c3efcae', shouldExist: true },
  { ref: 'invalid_sha_12345', shouldExist: false },
];

refsToTest.forEach(({ ref, shouldExist }) => {
  const res = spawnSync('git', ['cat-file', '-e', ref], { cwd: workspaceRoot });
  const exists = res.status === 0;
  const passed = exists === shouldExist;
  console.log(`[${passed ? 'PASS' : 'FAIL'}] Ref "${ref}": exists=${exists} (expected=${shouldExist})`);
});

console.log('\n=== TEST 3: Analyzer Execution with Arbitrary SHAs ===');
const scriptPath = path.join(workspaceRoot, 'analyzer', 'report_generator.py');
const working = '8a39af0';
const broken = '8deb5db';

const py = spawnSync('python', [scriptPath, working, broken, '--workspace', workspaceRoot], {
  cwd: workspaceRoot,
  encoding: 'utf-8',
});

console.log(`Python exit code: ${py.status}`);
if (py.status === 0) {
  try {
    const report = JSON.parse(py.stdout);
    console.log('[PASS] JSON parsed successfully.');
    console.log(`- Working release:  ${report.working_release}`);
    console.log(`- Broken release:   ${report.broken_release}`);
    console.log(`- Suspected commit: ${report.suspected_commit}`);
    console.log(`- Suspected file:   ${report.suspected_file}`);
    console.log(`- Commits analyzed: ${report.commits_analyzed.length}`);
    console.log(`- Failing tests:    ${report.failing_tests.length}`);
  } catch (err) {
    console.error('[FAIL] Could not parse JSON output:', err.message);
  }
} else {
  console.error('[FAIL] Python script failed:', py.stderr);
}

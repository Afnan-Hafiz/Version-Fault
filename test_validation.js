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

console.log('\n=== TEST 3: Analyzer Execution with BUGS (8a39af0 -> 8deb5db) ===');
const scriptPath = path.join(workspaceRoot, 'analyzer', 'report_generator.py');

const pyWithBug = spawnSync('python', [scriptPath, '8a39af0', '8deb5db', '--workspace', workspaceRoot], {
  cwd: workspaceRoot,
  encoding: 'utf-8',
});

console.log(`Python exit code: ${pyWithBug.status}`);
if (pyWithBug.status === 0) {
  const report = JSON.parse(pyWithBug.stdout);
  console.log(`[PASS] Bug detected as expected:`);
  console.log(`- Failing tests:    ${report.failing_tests.length} (expected > 0)`);
  console.log(`- Suspected commit: ${report.suspected_commit}`);
  console.log(`- Has bug:          ${report.has_bug}`);
} else {
  console.error('[FAIL] Python script failed:', pyWithBug.stderr);
}

console.log('\n=== TEST 4: Analyzer Execution with NO BUGS (0879cfa -> 8a39af0) ===');
const pyNoBug = spawnSync('python', [scriptPath, '0879cfa', '8a39af0', '--workspace', workspaceRoot], {
  cwd: workspaceRoot,
  encoding: 'utf-8',
});

console.log(`Python exit code: ${pyNoBug.status}`);
if (pyNoBug.status === 0) {
  const report = JSON.parse(pyNoBug.stdout);
  console.log(`[PASS] Clean release detected as expected:`);
  console.log(`- Failing tests:    ${report.failing_tests.length} (expected 0)`);
  console.log(`- Suspected commit: ${report.suspected_commit}`);
  console.log(`- Has bug:          ${report.has_bug}`);
} else {
  console.error('[FAIL] Python script failed:', pyNoBug.stderr);
}

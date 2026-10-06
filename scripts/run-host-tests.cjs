const fs = require('node:fs/promises');
const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const root = path.resolve(__dirname, '..');
  const fixture = path.join(root, '.runtime', 'host-test');
  await fs.rm(fixture, { recursive: true, force: true });
  await fs.mkdir(path.join(fixture, 'project', 'child', 'deeper'), { recursive: true });
  await fs.mkdir(path.join(fixture, 'second'), { recursive: true });
  await fs.writeFile(path.join(fixture, 'project', 'notes.txt'), 'Explorer Pro native host test\n');
  await fs.writeFile(path.join(fixture, 'project', '.hidden'), 'hidden fixture\n');
  await fs.symlink('notes.txt', path.join(fixture, 'project', 'linked-file'));
  const original = path.join(fixture, 'original.code-workspace');
  await fs.writeFile(original, JSON.stringify({
    folders: [{ path: './project', name: 'Main' }, { path: './second', name: 'Second' }],
    settings: { 'workbench.editor.enablePreview': true }
  }, null, 2));
  let destination = original;
  const profile = await fs.mkdtemp('/tmp/explorer-pro-host-');
  const executable = process.env.VSCODE_EXECUTABLE || '/Applications/Visual Studio Code.app/Contents/MacOS/Code';
  try {
  for (const phase of ['navigator', 'nested', 'back', 'restore', 'restored']) {
    await fs.rm(path.join(fixture, 'result.json'), { force: true });
    await runTests({
      vscodeExecutablePath: executable,
      extensionDevelopmentPath: root,
      extensionTestsPath: path.join(root, 'out', 'hostTest', 'run.js'),
      extensionTestsEnv: { EXPLORER_TEST_FIXTURE: fixture, EXPLORER_TEST_PHASE: phase },
      launchArgs: [destination, '--user-data-dir=' + path.join(profile, 'user-data'), '--extensions-dir=' + path.join(profile, 'extensions'), '--disable-extensions', '--disable-workspace-trust', '--skip-welcome', '--skip-release-notes']
    });
    const result = JSON.parse(await fs.readFile(path.join(fixture, 'result.json'), 'utf8'));
    if (!result.passed || result.phase !== phase) throw Error('Host test did not complete');
    if (result.destination) destination = fileURLToPath(result.destination);
  }
  console.log('All five native VS Code host phases passed.');
  } finally { await fs.rm(profile, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

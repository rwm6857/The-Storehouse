const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'build');
const serverOut = path.join(buildRoot, 'server');
const entry = path.join(repoRoot, 'src', 'server.js');

const nccBin = path.join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'ncc.cmd' : 'ncc'
);

fs.rmSync(serverOut, { recursive: true, force: true });
fs.mkdirSync(serverOut, { recursive: true });

execFileSync(nccBin, ['build', entry, '--no-source-map', '--asset-builds', '-o', serverOut], {
  stdio: 'inherit'
});

const bundled = path.join(serverOut, 'index.js');
const renamed = path.join(serverOut, 'server-bundle.cjs');
if (!fs.existsSync(bundled)) {
  throw new Error('ncc output not found at build/server/index.js');
}
fs.renameSync(bundled, renamed);

// eslint-disable-next-line no-console
console.log('Server bundle created at build/server/server-bundle.cjs');

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(repoRoot, 'build');
const srcPublic = path.join(repoRoot, 'src', 'public');
const srcViews = path.join(repoRoot, 'src', 'views');
const outDist = path.join(buildRoot, 'dist');
const outViews = path.join(buildRoot, 'views');

function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    throw new Error(`Missing directory: ${src}`);
  }
  fs.cpSync(src, dest, { recursive: true });
}

resetDir(outDist);
resetDir(outViews);

copyDir(srcPublic, outDist);
copyDir(srcViews, outViews);

// eslint-disable-next-line no-console
console.log('Client assets copied to build/dist and build/views.');

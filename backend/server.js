// Railway entrypoint: delegates to the full TypeScript server (dist/server.js).
// This guarantees the same routes (auth, folders, settings, etc.) work in
// production regardless of whether Railway runs `npm start` or `node server.js`.

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const distEntry = path.join(__dirname, 'dist', 'server.js');

if (!fs.existsSync(distEntry)) {
  console.log('[startup] dist/server.js not found, running tsc build...');
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc'],
    { cwd: __dirname, stdio: 'inherit' }
  );

  if (result.status !== 0) {
    console.error('[startup] TypeScript build failed.');
    process.exit(result.status || 1);
  }
}

require(distEntry);

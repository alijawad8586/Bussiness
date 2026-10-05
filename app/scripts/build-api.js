// Compiles the shared server code (../functions/src) into api/_core so the Vercel API routes can use it.
// The source is copied first so TypeScript finds firebase-admin in this folder's node_modules.
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const src = path.join(__dirname, '..', '..', 'functions', 'src');
const tmp = path.join(root, 'api', '_src');
const out = path.join(root, 'api', '_core');

fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, tmp, { recursive: true });
fs.rmSync(path.join(tmp, 'index.ts'), { force: true }); // Firebase Functions entry, not used here
execSync('npx tsc -p tsconfig.api.json', { cwd: root, stdio: 'inherit' });
fs.rmSync(tmp, { recursive: true, force: true });
console.log('api/_core built');

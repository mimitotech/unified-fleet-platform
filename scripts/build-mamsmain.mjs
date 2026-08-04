#!/usr/bin/env node
/**
 * Build MAMS into a single deploy folder: mamsmain/
 * Upload mamsmain/ (or mamsmain.zip) to StackCP File Manager.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'mamsmain');

function log(msg) {
  console.log(`[build:deploy] ${msg}`);
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) throw new Error(`Missing ${src}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function writeFile(rel, content) {
  const full = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

process.chdir(root);

log('Running npm run build…');
execSync('npm run build', { stdio: 'inherit', env: process.env });

log('Pruning dev dependencies for runtime bundle…');
execSync('npm prune --omit=dev', { stdio: 'inherit', env: process.env });

log('Assembling mamsmain/…');
rimraf(outDir);
fs.mkdirSync(outDir, { recursive: true });

copyDir(path.join(root, 'backend/dist'), path.join(outDir, 'server'));
copyDir(path.join(root, 'frontend/dist'), path.join(outDir, 'public'));
copyFile(path.join(root, 'hostinger-start.mjs'), path.join(outDir, 'hostinger-start.mjs'));
if (fs.existsSync(path.join(root, '.htaccess'))) {
  copyFile(path.join(root, '.htaccess'), path.join(outDir, '.htaccess'));
}
copyDir(path.join(root, 'node_modules'), path.join(outDir, 'node_modules'));

fs.mkdirSync(path.join(outDir, 'uploads'), { recursive: true });
fs.writeFileSync(path.join(outDir, 'uploads', '.gitkeep'), '');

writeFile(
  'package.json',
  `${JSON.stringify(
    {
      name: 'mams',
      private: true,
      version: '0.1.0',
      type: 'module',
      main: 'hostinger-start.mjs',
      scripts: {
        start: 'node hostinger-start.mjs',
      },
      engines: {
        node: '>=22',
      },
    },
    null,
    2,
  )}\n`,
);

writeFile(
  'ecosystem.config.js',
  `module.exports = {
  apps: [
    {
      name: 'mams',
      cwd: '/home/virtual/vps-e05b3d/2/27d5d7288d/mamsmain',
      script: 'npm',
      args: 'start',
      env: {
        NODE_ENV: 'production',
      },
      exp_backoff_restart_delay: 100,
    },
  ],
};
`,
);

writeFile(
  '.env',
  `NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@123
DB_NAME=mamsdb-35303030746b

API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
VITE_API_URL=

JWT_SECRET=8f905f233b59625107bdaab8c1edc083f6ce9e60543450a0ff1982d81ddd4db0
ENCRYPTION_KEY=3c339ed094c4cfcfe44fd6b0c0c8726e

UPLOAD_DIR=uploads
FRONTEND_DIST=public
REDIS_DISABLED=1
`,
);

writeFile(
  '.env.example',
  `# Copy to .env on the server (same folder as hostinger-start.mjs)
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=nsamba
DB_PASSWORD=Mimito@123
DB_NAME=mamsdb-35303030746b

API_PUBLIC_URL=https://mams.mimitotracking.co.ug
FRONTEND_URL=https://mams.mimitotracking.co.ug
VITE_API_URL=

JWT_SECRET=CHANGE_ME_LONG_RANDOM_STRING
ENCRYPTION_KEY=CHANGE_ME_32_CHAR_MINIMUM_KEY!!

UPLOAD_DIR=uploads
FRONTEND_DIST=public
REDIS_DISABLED=1
`,
);

const required = [
  'server/index.js',
  'public/index.html',
  'hostinger-start.mjs',
  'node_modules/express',
  'package.json',
  '.env',
  'ecosystem.config.js',
];
for (const rel of required) {
  const full = path.join(outDir, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`Deploy bundle incomplete: missing ${rel}`);
  }
}

const zipPath = path.join(root, 'mamsmain.zip');
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

log('Creating mamsmain.zip…');
execSync(`cd "${outDir}" && zip -rq "${zipPath}" .`, { stdio: 'inherit' });

const bytes = fs.statSync(zipPath).size;
log(`Done.`);
log(`  Folder: ${outDir}`);
log(`  Zip:    ${zipPath} (${bytes} bytes)`);
log('');
log('Upload mamsmain.zip to StackCP → mamsmain → extract.');
log('Confirm document root is mamsmain, then Discover applications.');

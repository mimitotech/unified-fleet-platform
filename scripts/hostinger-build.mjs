#!/usr/bin/env node
/**
 * Production build for StackCP / Hostinger.
 * Ensures Linux native binaries for esbuild + rollup (optionalDeps often missing
 * after --ignore-scripts or broken npm optional installs).
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

function log(msg) {
  console.log(`[hostinger-build] ${msg}`);
}

function chmodFile(file) {
  try {
    if (fs.existsSync(file)) fs.chmodSync(file, 0o755);
  } catch {
    /* ignore */
  }
}

function chmodTree(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.isFile()) chmodFile(full);
      else if (stat.isDirectory()) chmodTree(full);
    } catch {
      /* ignore */
    }
  }
}

function npmInstall(packages) {
  const list = packages.join(' ');
  log(`Ensuring packages: ${list}`);
  execSync(`npm install ${list} --no-save --legacy-peer-deps`, {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env, npm_config_optional: 'true' },
  });
}

function ensurePlatformBinaries() {
  const platform = os.platform();
  const arch = os.arch();
  log(`platform=${platform} arch=${arch} node=${process.version}`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 22) {
    throw new Error(
      `Node.js 22+ is required (found ${process.version}). Ask hosting to set Node 22 as default, then rebuild.`,
    );
  }

  if (platform === 'linux' && arch === 'x64') {
    const needed = [];
    const esbuildPkg = path.join(root, 'node_modules', '@esbuild', 'linux-x64');
    const rollupPkg = path.join(root, 'node_modules', '@rollup', 'rollup-linux-x64-gnu');
    if (!fs.existsSync(esbuildPkg)) needed.push('@esbuild/linux-x64');
    if (!fs.existsSync(rollupPkg)) needed.push('@rollup/rollup-linux-x64-gnu');
    // musl variant on some hosts
    const rollupMusl = path.join(root, 'node_modules', '@rollup', 'rollup-linux-x64-musl');
    if (needed.length > 0) {
      try {
        npmInstall(needed);
      } catch (err) {
        log(`optional package install warning: ${err instanceof Error ? err.message : String(err)}`);
        // try musl rollup if gnu failed
        try {
          if (!fs.existsSync(rollupMusl) && needed.some((p) => p.includes('rollup'))) {
            npmInstall(['@rollup/rollup-linux-x64-musl']);
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  const esbuildInstall = path.join(root, 'node_modules', 'esbuild', 'install.js');
  if (fs.existsSync(esbuildInstall)) {
    try {
      execSync(`node "${esbuildInstall}"`, { stdio: 'inherit', cwd: root });
    } catch (err) {
      log(`esbuild install.js warning: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

function fixPermissions() {
  log('Fixing binary permissions…');
  chmodTree(path.join(root, 'node_modules', '.bin'));
  chmodTree(path.join(root, 'node_modules', 'esbuild', 'bin'));

  const esbuildScope = path.join(root, 'node_modules', '@esbuild');
  if (fs.existsSync(esbuildScope)) {
    for (const pkg of fs.readdirSync(esbuildScope)) {
      chmodFile(path.join(esbuildScope, pkg, 'bin', 'esbuild'));
    }
  }
}

function requireFile(rel, label) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) {
    throw new Error(`${label} not found at ${rel}. Run npm install first.`);
  }
  return full;
}

function runNode(scriptPath, args, cwd = root) {
  const cmd = `node "${scriptPath}" ${args}`;
  log(cmd);
  execSync(cmd, { stdio: 'inherit', cwd, env: { ...process.env, FORCE_COLOR: '0' } });
}

ensurePlatformBinaries();
fixPermissions();

const tsc = requireFile('node_modules/typescript/bin/tsc', 'TypeScript');
const vite = requireFile('node_modules/vite/bin/vite.js', 'Vite');

log('Building @ufp/shared…');
runNode(tsc, '-p packages/shared/tsconfig.json');

log('Building frontend…');
runNode(vite, 'build', path.join(root, 'frontend'));

log('Building backend…');
runNode(tsc, '-p backend/tsconfig.json');

log('Build complete.');

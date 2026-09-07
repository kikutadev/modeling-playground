import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, watch } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VIEWER_URL = 'http://127.0.0.1:5188/?model=strix';
const SERVER_URL = 'http://127.0.0.1:5188/';
const SKIP_INITIAL_BUILD = process.argv.includes('--no-initial-build');
const BLENDER = process.env.BLENDER ?? (
  process.platform === 'darwin'
    ? '/Applications/Blender.app/Contents/MacOS/Blender'
    : 'blender'
);
const GLB_PATH = join(ROOT, 'output', 'strix.glb');

const WATCH_FILES = [
  'scripts/build_strix_blender.py',
  'scripts/check_strix_blender.mjs',
  'scripts/write_strix_contract.mjs',
  'models/strix-definition.mjs',
  'models/strix-motion.mjs',
  'models/strix-boost.mjs',
  'models/strix.mjs',
].map((path) => join(ROOT, path));

const BUILD_STEPS = [
  { command: BLENDER, args: ['--background', '--python-exit-code', '1', '--python', 'scripts/build_strix_blender.py'], env: { ...process.env, STRIX_GLTF_ONLY: '1' } },
  { command: process.execPath, args: ['scripts/write_strix_contract.mjs'] },
  { command: process.execPath, args: ['scripts/check_strix_blender.mjs'] },
];

let viteProcess = null;
let buildProcess = null;
let building = false;
let rebuildQueued = false;
let debounceTimer = null;
let shuttingDown = false;

function log(message) {
  console.log(`[strix-dev] ${message}`);
}

async function isServerReady() {
  try {
    const response = await fetch(SERVER_URL, { signal: AbortSignal.timeout(700) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureDevServer() {
  if (await isServerReady()) {
    log(`Vite is already running: ${SERVER_URL}`);
    return;
  }

  const vite = join(ROOT, 'node_modules', '.bin', 'vite');
  if (!existsSync(vite)) {
    throw new Error('Vite is not installed. Run pnpm install first.');
  }

  log('Starting Vite on 127.0.0.1:5188...');
  viteProcess = spawn(vite, ['--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
    cwd: ROOT,
    stdio: 'inherit',
  });

  viteProcess.once('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[strix-dev] Vite exited unexpectedly (code=${code}, signal=${signal}).`);
      process.exitCode = code ?? 1;
      shutdown();
    }
  });

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isServerReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Vite did not become ready within 10 seconds.');
}

async function runStep({ command, args, env = process.env }) {
  if (shuttingDown) return 1;
  buildProcess = spawn(command, args, { cwd: ROOT, stdio: 'inherit', env });
  const exitCode = await new Promise((resolve) => {
    buildProcess.once('exit', (code) => resolve(code ?? 1));
  });
  buildProcess = null;
  return exitCode;
}

async function backupCurrentGlb() {
  if (!existsSync(GLB_PATH)) return null;
  const directory = await mkdtemp(join(tmpdir(), 'strix-dev-'));
  const backup = join(directory, 'strix.glb');
  await copyFile(GLB_PATH, backup);
  return { directory, backup };
}

async function restoreGlb(backup) {
  if (!backup) return;
  await copyFile(backup.backup, GLB_PATH);
}

async function cleanupBackup(backup) {
  if (backup) await rm(backup.directory, { recursive: true, force: true });
}

async function rebuild() {
  if (shuttingDown) return;
  if (building) {
    rebuildQueued = true;
    return;
  }

  building = true;
  rebuildQueued = false;
  const startedAt = performance.now();
  const backup = await backupCurrentGlb();
  log('Generating STRIX with Blender Python and validating the exported GLB...');

  let exitCode = 0;
  try {
    for (const step of BUILD_STEPS) {
      exitCode = await runStep(step);
      if (exitCode !== 0) break;
    }

    const elapsed = ((performance.now() - startedAt) / 1000).toFixed(1);
    if (exitCode === 0) {
      log(`Build passed in ${elapsed}s. Vite will reload the Viewer when output/strix.glb changes.`);
    } else {
      await restoreGlb(backup);
      console.error(`[strix-dev] Build failed after ${elapsed}s (exit ${exitCode}); restored the previous validated GLB.`);
    }
  } finally {
    await cleanupBackup(backup);
    building = false;
  }

  if (rebuildQueued && !shuttingDown) await rebuild();
}

function scheduleRebuild(changedPath) {
  if (shuttingDown) return;
  log(`Changed: ${relative(ROOT, changedPath)}`);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => void rebuild(), 180);
}

const watchers = [];
function startWatchers() {
  for (const path of WATCH_FILES) {
    if (!existsSync(path)) throw new Error(`Missing watched source: ${relative(ROOT, path)}`);
    const watcher = watch(path, { persistent: true }, () => scheduleRebuild(path));
    watchers.push(watcher);
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(debounceTimer);
  for (const watcher of watchers) watcher.close();
  if (buildProcess && !buildProcess.killed) buildProcess.kill('SIGTERM');
  if (viteProcess && !viteProcess.killed) viteProcess.kill('SIGTERM');
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    log(`Received ${signal}; stopping.`);
    shutdown();
  });
}

try {
  await ensureDevServer();
  startWatchers();
  if (!SKIP_INITIAL_BUILD) await rebuild();
  log(`Viewer: ${VIEWER_URL}`);
  log(`Watching ${WATCH_FILES.length} STRIX authoring/reference files. Ctrl-C to stop.`);
} catch (error) {
  console.error(`[strix-dev] ${error instanceof Error ? error.message : String(error)}`);
  shutdown();
  process.exitCode = 1;
}

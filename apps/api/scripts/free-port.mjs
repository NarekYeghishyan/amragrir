#!/usr/bin/env node
/**
 * Clears the API's port before `nest start --watch` tries to bind it.
 *
 * The failure this exists for is a daily one: the watcher runs the app as a
 * child process (`node dist/main`), and when the parent goes away without
 * taking the child with it — a closed terminal, a reloaded editor, Ctrl-C
 * caught at the wrong moment — the orphan keeps the socket. The next `dev`
 * then dies on `EADDRINUSE` with a stack trace through `node:net` that names
 * everything except the actual problem, and the fix is always the same three
 * commands typed by hand.
 *
 * It stops **only** a process it can prove belongs to this checkout: either the
 * command line names this repository, or the port answers `/v1/health` the way
 * this API does. Anything else it refuses to touch and says whose it is —
 * a stranger on 3000 (another project, a container) is the developer's call to
 * make, not this script's. That refusal is the whole safety boundary, so keep
 * it if you change anything here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(API_DIR, '..', '..');
const WINDOWS = process.platform === 'win32';

const say = (line) => console.log(`[dev] ${line}`);

/** stdout of a command, or '' if it is missing, fails, or hangs. Nothing here
 *  is important enough to stop a developer's `dev` from starting. */
function run(file, args) {
  try {
    return execFileSync(file, args, {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return '';
  }
}

/** The port the API is about to ask for — resolved exactly as the app resolves
 *  it, so `PORT=3007 pnpm --filter @amragrir/api dev` frees 3007 and not 3000.
 *  `ConfigModule` loads `.env` without overriding a real environment variable,
 *  which is why `process.env` is read first here too. */
function apiPort() {
  let fromFile;
  try {
    const line = readFileSync(resolve(API_DIR, '.env'), 'utf8')
      .split(/\r?\n/)
      .find((candidate) => /^\s*PORT\s*=/.test(candidate));
    fromFile = line?.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  } catch {
    fromFile = undefined;
  }
  const port = Number(process.env.PORT ?? fromFile ?? 3000);
  return Number.isInteger(port) && port > 0 && port < 65_536 ? port : 3000;
}

/** Whether the port can be bound right now. No host, like `app.listen(port)`,
 *  so this asks the same question Nest is about to ask. */
function isFree(port) {
  return new Promise((done) => {
    const probe = createServer();
    probe.once('error', () => done(false));
    probe.listen(port, () => probe.close(() => done(true)));
  });
}

async function freeWithin(port, ms) {
  const deadline = Date.now() + ms;
  do {
    if (await isFree(port)) return true;
    await new Promise((wait) => setTimeout(wait, 150));
  } while (Date.now() < deadline);
  return false;
}

/** PIDs listening on the port. The Windows branch matches on the address
 *  columns rather than the state column, because `netstat` translates
 *  "LISTENING" on a localised Windows and this has to work on all of them:
 *  a listening row is the one whose remote address is the null one. */
function listeners(port) {
  if (WINDOWS) {
    const found = new Set();
    for (const row of run('netstat', ['-ano', '-p', 'TCP']).split(/\r?\n/)) {
      const cols = row.trim().split(/\s+/);
      if (cols.length < 5 || cols[0] !== 'TCP') continue;
      if (!cols[1].endsWith(`:${port}`)) continue;
      if (cols[2] !== '0.0.0.0:0' && cols[2] !== '[::]:0') continue;
      found.add(Number(cols[4]));
    }
    return [...found].filter(Boolean);
  }
  return run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
    .split(/\s+/)
    .map(Number)
    .filter(Boolean);
}

/** A process's parent and command line, in one call — the command line is what
 *  proves ownership, and the parent is what would put the port straight back. */
function about(pid) {
  const out = WINDOWS
    ? run('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if ($p) { "$($p.ParentProcessId)"; "$($p.CommandLine)" }`,
      ])
    : run('ps', ['-o', 'ppid=,command=', '-p', String(pid)]);

  if (WINDOWS) {
    const [parent = '', ...rest] = out.split(/\r?\n/);
    return { parent: Number(parent.trim()) || 0, command: rest.join(' ').trim() };
  }
  const trimmed = out.trim();
  const gap = trimmed.indexOf(' ');
  return gap === -1
    ? { parent: 0, command: '' }
    : { parent: Number(trimmed.slice(0, gap)) || 0, command: trimmed.slice(gap + 1).trim() };
}

const fromThisRepo = (command) =>
  command !== '' && command.toLowerCase().includes(REPO_ROOT.toLowerCase());

/** The watcher that spawned the holder. Killing the child alone would free the
 *  port and leave a watcher that puts a new one there on the next file save. */
const isWatcher = (command) => /@nestjs[\\/]cli|\bnest(\.js)?["']?\s+start\b/.test(command);

/** A shell that exists only to run the line below it. The Nest CLI starts the
 *  app through one, so the watcher is the holder's *grandparent* — walking past
 *  these is what finds it. */
const isShellWrapper = (command) => /cmd\.exe|[\\/](?:ba|z|d)?sh\b/i.test(command);

/** The watcher above a holder, if it is still running. Climbs only through
 *  processes that belong to this checkout, and stops at the first thing that is
 *  neither a wrapper shell nor the watcher itself — the package manager and
 *  whatever launched it are not this script's to kill. */
function watcherAbove(firstParent) {
  const doomed = [];
  let pid = firstParent;
  for (let step = 0; step < 3 && pid; step += 1) {
    const { parent, command } = about(pid);
    if (!fromThisRepo(command)) break;
    if (isWatcher(command)) {
      doomed.push(pid);
      break;
    }
    if (!isShellWrapper(command)) break;
    doomed.push(pid);
    pid = parent;
  }
  return doomed;
}

/** Whether whatever holds the port answers the way this API does. The fallback
 *  for a holder whose command line could not be read — and the reason a build
 *  started from another checkout is still recognised as ours. */
async function answersAsThisApi(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/v1/health`, {
      signal: AbortSignal.timeout(1_000),
    });
    if (!res.ok) return false;
    const body = await res.json();
    return body?.status === 'ok' && 'db' in body && 'redis' in body;
  } catch {
    return false;
  }
}

function stop(pid, force) {
  if (WINDOWS) {
    // No SIGTERM on Windows; /T takes the process's own children with it.
    run('taskkill', ['/PID', String(pid), '/T', '/F']);
    return;
  }
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch {
    // Already gone — which is the outcome we wanted anyway.
  }
}

async function main() {
  const port = apiPort();
  if (await isFree(port)) return 0;

  const holders = listeners(port);
  if (holders.length === 0) {
    // Bound but unowned: a Windows excluded port range, or a socket in TIME_WAIT.
    // Not ours to solve — let Nest try and report what it gets.
    say(`port ${port} is busy but nothing owns it — starting anyway`);
    return 0;
  }

  const answersAsUs = await answersAsThisApi(port);
  const doomed = new Set();
  const strangers = [];

  for (const pid of holders) {
    const { parent, command } = about(pid);
    if (!fromThisRepo(command) && !answersAsUs) {
      strangers.push(`pid ${pid}  ${command || '(command line unavailable)'}`);
      continue;
    }
    doomed.add(pid);
    if (parent) for (const above of watcherAbove(parent)) doomed.add(above);
  }

  if (doomed.size === 0) {
    say(`port ${port} is held by something that is not this API, so it is left alone:`);
    for (const stranger of strangers) say(`  ${stranger}`);
    const spare = port === 3007 ? 3008 : 3007;
    say(`stop it, or run the API elsewhere:  PORT=${spare} pnpm --filter @amragrir/api dev`);
    return 1;
  }

  const pids = [...doomed];
  say(`port ${port} was still held by this API (${pids.join(', ')}) — stopping it`);
  for (const pid of pids) stop(pid, false);

  if (!(await freeWithin(port, 3_000))) {
    for (const pid of pids) stop(pid, true);
    if (!(await freeWithin(port, 3_000))) {
      say(`port ${port} is still busy after stopping ${pids.join(', ')} — start it by hand`);
      return 1;
    }
  }

  say(`port ${port} is free`);
  return 0;
}

process.exitCode = await main();

import { readFile, mkdir, writeFile, stat } from 'node:fs/promises';
import { parseEnv, parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

// Bounded local qualification. Continuous hosting uses sink/run.mjs directly
// with SUBSTREAMS_API_TOKEN supplied by the host's secret environment.
const { values } = parseArgs({ options: {
  start: { type: 'string' }, stop: { type: 'string' }, pools: { type: 'string' },
  db: { type: 'string', default: '.scratch/graph/sepolia-v0.1.1.sqlite' },
} });
if (!/^\d+$/.test(values.start ?? '') || !/^\d+$/.test(values.stop ?? '') ||
    BigInt(values.stop) <= BigInt(values.start) || BigInt(values.stop) - BigInt(values.start) > 10000n)
  throw new Error('Specify an absolute --start/--stop range of 1–10000 blocks');
if (!values.pools?.split(',').every(pool => /^0x[0-9a-f]{64}$/i.test(pool)))
  throw new Error('Specify an explicit --pools list of 32-byte pool IDs');
// A provider cursor overrides the start argument. Bound the saved head too.
const exists = await stat(values.db).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
if (exists) {
  const db = new DatabaseSync(values.db, { readOnly: true });
  try {
    const head = db.prepare('SELECT number FROM blocks ORDER BY number DESC LIMIT 1').get();
    if (head && (BigInt(head.number) < BigInt(values.start) - 1n || BigInt(head.number) >= BigInt(values.stop)))
      throw new Error('Saved cursor head falls outside the bounded request; use its original start and a later stop');
  } finally { db.close(); }
}
const saved = parseEnv(await readFile('.env', 'utf8'));
const token = saved.SUBSTREAMS_API_TOKEN?.trim();
if (!token || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
  throw new Error('SUBSTREAMS_API_TOKEN is missing or malformed; value withheld');
await mkdir('.scratch/graph', { recursive: true });
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|HOME|LANG|LC_ALL|TMPDIR|TMP|TEMP|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|SSL_CERT_DIR)$/.test(name)));
const child = spawn(process.execPath, ['packages/substreams/sink/run.mjs', '--network', 'sepolia',
  '--pools', values.pools, '--start', values.start, '--stop', values.stop, '--db', values.db],
  { env: { ...inherited, SUBSTREAMS_API_TOKEN: token }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data.toString(); });
const timer = setTimeout(() => child.kill('SIGTERM'), 300000);
let code;
try { code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); }); }
finally { clearTimeout(timer); }
const sanitized = output.split(token).join('[token redacted]');
const log = `.scratch/graph/substreams-${values.start}-${values.stop}.log`;
await writeFile(log, sanitized, { mode: 0o600 });
console.log(JSON.stringify({ exitCode: code, log }));
console.log(sanitized.slice(-4000));
process.exitCode = code ?? 1;

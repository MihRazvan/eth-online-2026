import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(import.meta.url);
const saved = parseEnv(await readFile('.env', 'utf8'));
const key = saved.GRAPH_DEPLOY_KEY?.trim();
const slug = saved.GRAPH_SUBGRAPH_SLUG?.trim();
const version = process.argv[2] ?? 'v0.1.0';
if (!key || !/^[0-9a-fA-F]{32}$/.test(key)) throw new Error('GRAPH_DEPLOY_KEY is missing or malformed; value withheld');
if (slug !== 'usufruct') throw new Error('Expected GRAPH_SUBGRAPH_SLUG=usufruct');
if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) throw new Error('Use a version label such as v0.1.0');
const cli = join(dirname(require.resolve('@graphprotocol/graph-cli/package.json')), 'bin/run.js');
// Keep the deploy key out of OS command arguments and collect/redact CLI output
// before printing or persisting it. No wallet key or RPC secret is passed in.
const runner = `
import { pathToFileURL } from 'node:url';
process.argv = [process.execPath, process.env.USUFRUCT_GRAPH_CLI, 'deploy', process.env.GRAPH_SUBGRAPH_SLUG,
 'packages/subgraph/subgraph.sepolia.yaml', '--node', 'https://api.studio.thegraph.com/deploy/',
 '--deploy-key', process.env.GRAPH_DEPLOY_KEY, '--version-label', process.env.USUFRUCT_GRAPH_VERSION,
 '--output-dir', 'packages/subgraph/build', '--skip-migrations'];
await import(pathToFileURL(process.env.USUFRUCT_GRAPH_CLI).href);
`;
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  /^(PATH|HOME|LANG|LC_ALL|TERM|TMPDIR|TMP|TEMP|NODE_EXTRA_CA_CERTS|HTTP_PROXY|HTTPS_PROXY|NO_PROXY|SSL_CERT_FILE|SSL_CERT_DIR)$/.test(name)));
const env = { ...inherited, GRAPH_DEPLOY_KEY: key, GRAPH_SUBGRAPH_SLUG: slug, USUFRUCT_GRAPH_CLI: cli, USUFRUCT_GRAPH_VERSION: version };
const child = spawn(process.execPath, ['--input-type=module', '-e', runner], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { output += data.toString(); });
const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
const sanitized = output.split(key).join('[deploy key redacted]').replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
await mkdir('.scratch/graph', { recursive: true });
await writeFile('.scratch/graph/studio-deploy.log', sanitized, { mode: 0o600 });
console.log(sanitized);
process.exitCode = code ?? 1;

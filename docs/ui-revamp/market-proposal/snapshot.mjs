// Writes market-snapshot.js from the live stored-market endpoint, so the proposal shows real stored data
// (all sales categories and real histories). Needs the backend running and frontend/.env.local.
//   node docs/ui-revamp/market-proposal/snapshot.mjs
// The snapshot is ignored by git (see .gitignore here): it is a local copy of the database read.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '../../../frontend/.env.local');
const env = Object.fromEntries(readFileSync(envFile, 'utf8').split(/\r?\n/).filter((l) => l.includes('='))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
const base = (env.VITE_API_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const response = await fetch(`${base}/api/v1/market/stored`, { headers: env.VITE_API_KEY ? { 'X-API-Key': env.VITE_API_KEY } : {} });
if (!response.ok) throw new Error(`Stored market read failed: HTTP ${response.status}`);
const data = await response.json();
writeFileSync(join(here, 'market-snapshot.js'), `// Snapshot of GET /api/v1/market/stored, ${new Date().toISOString()}\nwindow.MARKET_SNAPSHOT = ${JSON.stringify(data)};\n`);
console.log(`Wrote market-snapshot.js: ${data.series.length} series, ${data.missing.length} missing.`);

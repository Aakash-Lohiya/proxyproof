import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { openDb } from './db.js';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';

const PORT = Number(process.env.PORT || 4100);
const DB_PATH = process.env.DB_PATH || './data/proxyproof.sqlite';
const JWT_SECRET = process.env.JWT_SECRET || randomBytes(32).toString('hex');
const SIMULATE_BEACON = process.env.SIMULATE_BEACON === '1';

if (!process.env.JWT_SECRET) {
  console.warn('[proxyproof] JWT_SECRET not set: using a random secret, sessions reset on restart');
}
if (SIMULATE_BEACON) {
  console.warn('[proxyproof] SIMULATE_BEACON=1: students can fetch tokens without BLE (demo mode only!)');
}

if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
const db = openDb(DB_PATH);

const server = http.createServer();
const realtime = createRealtime(server, db, JWT_SECRET);
const app = createApp({ db, jwtSecret: JWT_SECRET, realtime, simulateBeacon: SIMULATE_BEACON });
server.on('request', app);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[proxyproof] API listening on http://0.0.0.0:${PORT}  (db: ${DB_PATH})`);
});

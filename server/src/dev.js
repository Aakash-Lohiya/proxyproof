// Development entry: stable JWT secret, simulated beacon enabled, DB next to this file.
// Never use in production: SIMULATE_BEACON lets students fetch tokens without Bluetooth.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

process.env.SIMULATE_BEACON ??= '1';
process.env.JWT_SECRET ??= 'proxyproof-dev-secret';
process.env.DB_PATH ??= join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'dev.sqlite');
process.env.PORT ??= '4100';

await import('./index.js');

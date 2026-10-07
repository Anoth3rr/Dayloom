import path from 'node:path';
import { createDayloomServer } from './app.mjs';
const port = Number(process.env.DAYLOOM_PORT || 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('DAYLOOM_PORT must be a valid TCP port');
const server = createDayloomServer({
  database: path.resolve(process.env.DAYLOOM_DATA_DIR || 'server-data', 'dayloom.sqlite'),
  staticDirectory: path.resolve('dist'),
  ...(process.env.DAYLOOM_ALLOWED_ORIGINS ? { allowedOrigins: process.env.DAYLOOM_ALLOWED_ORIGINS.split(',').map(value => value.trim()) } : {}),
  registration: process.env.DAYLOOM_REGISTRATION !== 'false',
});
server.listen(port, process.env.DAYLOOM_HOST || '127.0.0.1', () => console.log(`Dayloom sync listening on ${process.env.DAYLOOM_HOST || '127.0.0.1'}:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close());

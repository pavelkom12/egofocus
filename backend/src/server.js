import { migrate, pool } from './db.js';
import { createApp } from './app.js';
await migrate();
const app = await createApp();
async function shutdown() {
  await app.close();
  await pool.end();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
await app.listen({ host: '0.0.0.0', port: 8080 });
console.log('EgoFocus API listening on port 8080');

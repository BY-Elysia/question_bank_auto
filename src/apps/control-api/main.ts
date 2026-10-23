import { createApplication } from './application.js';
const { app } = await createApplication();
const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 5002);
await app.listen(port, host);
console.log(`Textbook backend: http://${host}:${port}/api/health`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void app.close().then(() => process.exit(0));
  });

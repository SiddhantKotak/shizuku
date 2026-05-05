import { env } from '@shizuku/config';
import { buildApp } from './app.js';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown_initiated');
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'shutdown_failed');
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: env.API_PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.error({ err }, 'startup_failed');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('fatal startup error', err);
  process.exit(1);
});

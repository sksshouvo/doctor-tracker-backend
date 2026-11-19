import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { Doctor } from './modules/doctors/doctor.model.js';
import { Patient } from './modules/patients/patient.model.js';
import { User } from './modules/users/user.model.js';

async function main() {
  await connectDb();
  if (env.NODE_ENV === 'development') {
    // Keep dev indexes in sync with the schema definitions.
    await Promise.all([User.syncIndexes(), Doctor.syncIndexes(), Patient.syncIndexes()]);
  }
  const server = createApp().listen(env.PORT, () =>
    logger.info(`API listening on http://localhost:${env.PORT}/api/v1`),
  );

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('unhandledRejection', (err) => {
    logger.error({ err }, 'Unhandled rejection');
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});

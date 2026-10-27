process.env.PROCESS_ROLE = process.env.PROCESS_ROLE || 'api';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const { app } = require('./index');
const { sequelize, TikTokChannel, User } = require('./models');
const { encryptToken, isEncryptedToken } = require('./lib/tokenEncryption');
const { getAdminAccount } = require('./lib/adminAccount');
const { refreshAppCache } = require('./services/tiktokAppService');
const { closeAllQueuesAndWorkers } = require('./lib/queue');
const { closeRedis } = require('./lib/redis');

const PORT = Number(process.env.PORT) || 8000;

const initializeApiState = async () => {
  if (!process.env.ADMIN_PASSWORD) throw new Error('ADMIN_PASSWORD must be set in .env');
  if (!process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in .env');

  await sequelize.authenticate();
  const channels = await TikTokChannel.findAll({
    attributes: ['id', 'access_token_encrypted', 'refresh_token_encrypted'],
  });

  for (const channel of channels) {
    const accessToken = channel.access_token_encrypted;
    const refreshToken = channel.refresh_token_encrypted;
    if ((accessToken && !isEncryptedToken(accessToken)) || (refreshToken && !isEncryptedToken(refreshToken))) {
      await channel.update({
        access_token_encrypted: accessToken ? encryptToken(accessToken) : null,
        refresh_token_encrypted: refreshToken ? encryptToken(refreshToken) : null,
      });
    }
  }

  const adminAccount = getAdminAccount();
  const [adminUser] = await User.findOrCreate({
    where: { email: adminAccount.email },
    defaults: { name: adminAccount.username, email: adminAccount.email, role: 'admin' },
  });
  if (adminUser.name !== adminAccount.username || adminUser.email !== adminAccount.email) {
    await adminUser.update({ name: adminAccount.username, email: adminAccount.email });
  }

  await refreshAppCache().catch((error) => {
    console.warn('[TikTokApp] Could not initialize app cache on API start:', error.message);
  });
};

const startApiServer = async () => {
  await initializeApiState();
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(PORT, () => resolve(listener));
    listener.once('error', reject);
  });
  console.info(`[API] Listening on port ${PORT}`);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.info(`[API] Received ${signal}, shutting down gracefully...`);
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([
      closeAllQueuesAndWorkers(),
      closeRedis(),
      sequelize.close(),
    ]);
  };
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));
  return { server, shutdown };
};

if (require.main === module) {
  startApiServer().catch(async (error) => {
    console.error('[API] Failed to start:', error);
    await Promise.allSettled([
      closeAllQueuesAndWorkers(),
      closeRedis(),
      sequelize.close(),
    ]);
    process.exitCode = 1;
  });
}

module.exports = { initializeApiState, startApiServer };

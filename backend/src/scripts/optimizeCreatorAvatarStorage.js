require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const {
  CREATOR_AVATAR_STORAGE_ROOT,
  optimizeCreatorAvatarFile,
} = require('../services/creatorAvatarStorageService');

const configuredConcurrency = Math.max(
  1,
  Math.min(16, Number(process.env.CREATOR_AVATAR_OPTIMIZE_CONCURRENCY) || 4),
);
const configuredMinimumBytes = Math.max(
  4 * 1024,
  Number(process.env.CREATOR_AVATAR_OPTIMIZE_MIN_BYTES) || 20 * 1024,
);

const listAvatarFiles = async (storageRoot) => {
  const shops = await fs.readdir(storageRoot, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const shop of shops) {
    if (!shop.isDirectory()) continue;
    const directory = path.join(storageRoot, shop.name);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && /^[a-f0-9]{32}\.webp$/i.test(entry.name)) {
        files.push(path.join(directory, entry.name));
      }
    }
  }
  return files;
};

const run = async ({
  apply = false,
  concurrency = configuredConcurrency,
  minimumBytes = configuredMinimumBytes,
  storageRoot = CREATOR_AVATAR_STORAGE_ROOT,
  logger = console,
} = {}) => {
  const files = await listAvatarFiles(storageRoot);
  const summary = {
    scanned: files.length,
    eligible: 0,
    optimized: 0,
    skipped: 0,
    failed: 0,
    bytesBefore: 0,
    bytesAfter: 0,
    apply,
  };
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      const source = files[index];
      let temporary = null;
      try {
        const sourceStat = await fs.stat(source);
        summary.bytesBefore += sourceStat.size;
        if (sourceStat.size < minimumBytes) {
          summary.skipped += 1;
          summary.bytesAfter += sourceStat.size;
          continue;
        }
        summary.eligible += 1;
        if (!apply) {
          summary.bytesAfter += sourceStat.size;
          continue;
        }
        temporary = path.join(
          path.dirname(source),
          `.${path.basename(source, '.webp')}.${crypto.randomUUID()}.optimized.webp`,
        );
        await optimizeCreatorAvatarFile(source, temporary);
        const optimizedStat = await fs.stat(temporary);
        if (optimizedStat.size > 0 && optimizedStat.size < sourceStat.size) {
          await fs.rename(temporary, source);
          temporary = null;
          summary.optimized += 1;
          summary.bytesAfter += optimizedStat.size;
        } else {
          summary.skipped += 1;
          summary.bytesAfter += sourceStat.size;
        }
      } catch (error) {
        summary.failed += 1;
        logger.warn('[Creator Avatar Optimize] Failed', { source, message: error.message });
      } finally {
        if (temporary) await fs.unlink(temporary).catch(() => {});
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(files.length || 1, Math.max(1, concurrency)) },
    worker,
  ));
  return summary;
};

if (require.main === module) {
  const apply = process.argv.includes('--apply');
  run({ apply })
    .then((summary) => {
      console.info('[Creator Avatar Optimize] Completed', summary);
      if (!apply) console.info('[Creator Avatar Optimize] Dry run only; pass --apply to replace oversized files.');
    })
    .catch((error) => {
      console.error('[Creator Avatar Optimize] Failed', { message: error.message });
      process.exitCode = 1;
    });
}

module.exports = { listAvatarFiles, run };

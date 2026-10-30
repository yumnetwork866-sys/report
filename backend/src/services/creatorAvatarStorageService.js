const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const CREATOR_AVATAR_STORAGE_ROOT = path.resolve(
  process.env.CREATOR_AVATAR_STORAGE_DIR
    || path.join(__dirname, '..', '..', 'storage', 'creator-avatars'),
);
const CREATOR_AVATAR_PUBLIC_PREFIX = '/api/creator-avatars';
const DEFAULT_MAX_BYTES = Math.max(
  64 * 1024,
  Number(process.env.CREATOR_AVATAR_MAX_BYTES) || 2 * 1024 * 1024,
);
const DEFAULT_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.CREATOR_AVATAR_DOWNLOAD_TIMEOUT_MS) || 10_000,
);
const DEFAULT_AVATAR_SIZE = Math.max(
  64,
  Math.min(512, Number(process.env.CREATOR_AVATAR_SIZE) || 192),
);

const CONTENT_TYPE_EXTENSIONS = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/gif', '.gif'],
]);
const ALLOWED_EXTENSIONS = new Set(CONTENT_TYPE_EXTENSIONS.values());

const isLocalCreatorAvatarUrl = (value) => (
  String(value || '').startsWith(`${CREATOR_AVATAR_PUBLIC_PREFIX}/`)
);

const isAllowedAvatarHost = (hostname) => {
  const normalized = String(hostname || '').toLowerCase();
  return normalized === 'tiktokcdn.com' || normalized.endsWith('.tiktokcdn.com');
};

const safeShopDirectory = (shopId) => String(Math.max(0, Number(shopId) || 0));
const creatorStorageKey = (creator = {}) => {
  const identity = String(
    creator.creator_open_id
      || creator.creator_user_open_id
      || creator.user_id
      || creator.username
      || '',
  ).trim().toLowerCase();
  if (!identity) return null;
  return crypto.createHash('sha256').update(identity).digest('hex').slice(0, 32);
};

const publicAvatarUrl = (shopId, filename) => (
  `${CREATOR_AVATAR_PUBLIC_PREFIX}/${safeShopDirectory(shopId)}/${filename}`
);

const existingAvatar = async (directory, key, shopId, fsModule = fs) => {
  for (const extension of ALLOWED_EXTENSIONS) {
    const filename = `${key}${extension}`;
    try {
      await fsModule.access(path.join(directory, filename));
      return publicAvatarUrl(shopId, filename);
    } catch {
      // Try the next supported extension.
    }
  }
  return null;
};

const readResponseBody = async (response, maxBytes) => {
  const declaredLength = Number(response.headers?.get?.('content-length') || 0);
  if (declaredLength > maxBytes) throw new Error('Creator avatar exceeds the maximum file size.');
  if (!response.body?.getReader) {
    const value = Buffer.from(await response.arrayBuffer());
    if (value.length > maxBytes) throw new Error('Creator avatar exceeds the maximum file size.');
    return value;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new Error('Creator avatar exceeds the maximum file size.');
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
};

const optimizeCreatorAvatarFile = async (source, destination, {
  execFileImpl = execFileAsync,
  size = DEFAULT_AVATAR_SIZE,
} = {}) => {
  await execFileImpl(process.env.FFMPEG_PATH || 'ffmpeg', [
    '-hide_banner',
    '-loglevel', 'error',
    '-i', source,
    '-vf', `scale=${size}:${size}:force_original_aspect_ratio=decrease`,
    '-c:v', 'libwebp',
    '-quality', '78',
    '-compression_level', '6',
    '-frames:v', '1',
    '-y', destination,
  ], { timeout: 15_000, maxBuffer: 256 * 1024 });
  return destination;
};

const cacheCreatorAvatar = async (shopId, creator = {}, {
  fetchImpl = fetch,
  fsModule = fs,
  storageRoot = CREATOR_AVATAR_STORAGE_ROOT,
  maxBytes = DEFAULT_MAX_BYTES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  optimizeImage = optimizeCreatorAvatarFile,
} = {}) => {
  const remoteUrl = creator.avatar_url || creator.avatar?.url || null;
  if (!remoteUrl || isLocalCreatorAvatarUrl(remoteUrl)) return remoteUrl;
  const key = creatorStorageKey(creator);
  if (!key) return remoteUrl;

  let parsed;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return remoteUrl;
  }
  if (parsed.protocol !== 'https:' || !isAllowedAvatarHost(parsed.hostname)) return remoteUrl;

  const directory = path.join(storageRoot, safeShopDirectory(shopId));
  await fsModule.mkdir(directory, { recursive: true });
  const cached = await existingAvatar(directory, key, shopId, fsModule);
  if (cached) return cached;

  const response = await fetchImpl(remoteUrl, {
    redirect: 'follow',
    signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(timeoutMs)
      : undefined,
    headers: { accept: 'image/webp,image/png,image/jpeg,image/gif' },
  });
  if (!response.ok) throw new Error(`Creator avatar download failed with status ${response.status}.`);
  const finalUrl = new URL(response.url || remoteUrl);
  if (finalUrl.protocol !== 'https:' || !isAllowedAvatarHost(finalUrl.hostname)) {
    throw new Error('Creator avatar redirect target is not an allowed TikTok CDN.');
  }
  const contentType = String(response.headers?.get?.('content-type') || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
  const extension = CONTENT_TYPE_EXTENSIONS.get(contentType);
  if (!extension) throw new Error(`Unsupported creator avatar content type: ${contentType || 'unknown'}.`);
  const image = await readResponseBody(response, maxBytes);
  if (!image.length) throw new Error('Creator avatar download returned an empty file.');

  const temporaryId = crypto.randomUUID();
  const downloaded = path.join(directory, `.${key}.${temporaryId}${extension}`);
  const optimized = path.join(directory, `.${key}.${temporaryId}.optimized.webp`);
  let storedFile = downloaded;
  let storedExtension = extension;
  await fsModule.writeFile(downloaded, image, { flag: 'wx' });
  try {
    await optimizeImage(downloaded, optimized);
    const optimizedStat = await fsModule.stat(optimized);
    if (optimizedStat.size > 0 && optimizedStat.size < image.length) {
      storedFile = optimized;
      storedExtension = '.webp';
    }
  } catch {
    // Keep the downloaded image if ffmpeg is unavailable or rejects the source.
  }
  const filename = `${key}${storedExtension}`;
  const destination = path.join(directory, filename);
  try {
    await fsModule.rename(storedFile, destination);
  } finally {
    await Promise.all([
      storedFile === downloaded ? null : fsModule.unlink(downloaded).catch(() => {}),
      storedFile === optimized ? null : fsModule.unlink(optimized).catch(() => {}),
    ]);
  }
  return publicAvatarUrl(shopId, filename);
};

const cacheCreatorAvatars = async (shopId, creators = [], {
  concurrency = 4,
  logger = console,
  ...options
} = {}) => {
  const results = Array.from({ length: creators.length });
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < creators.length) {
      const index = nextIndex;
      nextIndex += 1;
      const creator = creators[index];
      try {
        const avatarUrl = await cacheCreatorAvatar(shopId, creator, options);
        results[index] = {
          ...creator,
          ...(avatarUrl ? { avatar_url: avatarUrl } : {}),
          ...(creator.avatar ? {
            avatar: { ...creator.avatar, ...(avatarUrl ? { url: avatarUrl } : {}) },
          } : {}),
        };
      } catch (error) {
        logger?.warn?.('[Creator Avatar Cache] Download failed', {
          shopId,
          username: creator.username || null,
          message: error.message,
        });
        results[index] = creator;
      }
    }
  };
  const workerCount = Math.min(
    creators.length,
    Math.max(1, Math.min(16, Number(concurrency) || 1)),
  );
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
};

module.exports = {
  CREATOR_AVATAR_STORAGE_ROOT,
  CREATOR_AVATAR_PUBLIC_PREFIX,
  DEFAULT_MAX_BYTES,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_AVATAR_SIZE,
  isLocalCreatorAvatarUrl,
  isAllowedAvatarHost,
  creatorStorageKey,
  optimizeCreatorAvatarFile,
  cacheCreatorAvatar,
  cacheCreatorAvatars,
};

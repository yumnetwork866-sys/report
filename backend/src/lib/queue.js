const { Queue, Worker, QueueEvents } = require('bullmq');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379/1';
const QUEUE_PREFIX = process.env.BULLMQ_PREFIX || '{manage_team}:bull';

const parseRedisConnection = (urlStr) => {
  try {
    const parsed = new URL(urlStr);
    const dbIndex = parsed.pathname ? parseInt(parsed.pathname.slice(1), 10) : 1;
    return {
      host: parsed.hostname || '127.0.0.1',
      port: parsed.port ? parseInt(parsed.port, 10) : 6379,
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      db: Number.isInteger(dbIndex) ? dbIndex : 1,
      maxRetriesPerRequest: null,
    };
  } catch {
    return {
      host: '127.0.0.1',
      port: 6379,
      db: 1,
      maxRetriesPerRequest: null,
    };
  }
};

const redisConnection = parseRedisConnection(REDIS_URL);

const activeQueues = new Map();
const activeWorkers = new Map();
const activeEvents = new Map();

/**
 * Get or initialize a BullMQ Queue
 * @param {string} queueName
 * @param {object} customOpts
 * @returns {Queue}
 */
const getQueue = (queueName, customOpts = {}) => {
  if (activeQueues.has(queueName)) {
    return activeQueues.get(queueName);
  }

  const queue = new Queue(queueName, {
    connection: redisConnection,
    prefix: QUEUE_PREFIX,
    skipEvictionPolicyCheck: true,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
      removeOnComplete: {
        age: 86400 * 3, // keep completed jobs for 3 days
        count: 1000,
      },
      removeOnFail: {
        age: 86400 * 7, // keep failed jobs for 7 days
        count: 2000,
      },
      ...customOpts.defaultJobOptions,
    },
    ...customOpts,
  });

  activeQueues.set(queueName, queue);
  return queue;
};

/**
 * Add a job to a queue
 * @param {string} queueName
 * @param {string} jobName
 * @param {object} data
 * @param {object} opts
 * @returns {Promise<Job>}
 */
const addJob = async (queueName, jobName, data = {}, opts = {}) => {
  const queue = getQueue(queueName);
  return queue.add(jobName, data, opts);
};

/**
 * Create and register a BullMQ Worker
 * @param {string} queueName
 * @param {Function} processor
 * @param {object} workerOpts
 * @returns {Worker}
 */
const createWorker = (queueName, processor, workerOpts = {}) => {
  const worker = new Worker(queueName, processor, {
    connection: redisConnection,
    prefix: QUEUE_PREFIX,
    concurrency: workerOpts.concurrency || 2,
    skipEvictionPolicyCheck: true,
    ...workerOpts,
  });

  worker.on('failed', (job, err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[BullMQ Worker: ${queueName}] Job "${job?.name}" (ID: ${job?.id}) failed:`, err.message);
    }
  });

  worker.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[BullMQ Worker: ${queueName}] Worker error:`, err.message);
    }
  });

  if (!activeWorkers.has(queueName)) {
    activeWorkers.set(queueName, []);
  }
  activeWorkers.get(queueName).push(worker);

  return worker;
};

/**
 * Get or create QueueEvents listener for a queue
 * @param {string} queueName
 * @returns {QueueEvents}
 */
const getQueueEvents = (queueName) => {
  if (activeEvents.has(queueName)) {
    return activeEvents.get(queueName);
  }

  const events = new QueueEvents(queueName, {
    connection: redisConnection,
    prefix: QUEUE_PREFIX,
  });

  activeEvents.set(queueName, events);
  return events;
};

/**
 * Cleanly close all queues, workers, and event listeners
 */
const closeAllQueuesAndWorkers = async () => {
  const closePromises = [];

  for (const workerList of activeWorkers.values()) {
    for (const worker of workerList) {
      closePromises.push(worker.close(true).catch(() => {}));
    }
  }
  activeWorkers.clear();

  for (const events of activeEvents.values()) {
    closePromises.push(events.close().catch(() => {}));
  }
  activeEvents.clear();

  for (const queue of activeQueues.values()) {
    closePromises.push(queue.close().catch(() => {}));
  }
  activeQueues.clear();

  await Promise.all(closePromises);
};

module.exports = {
  getQueue,
  addJob,
  createWorker,
  getQueueEvents,
  closeAllQueuesAndWorkers,
  redisConnection,
  QUEUE_PREFIX,
};

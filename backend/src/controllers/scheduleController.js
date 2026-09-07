const { ScheduledJob, ScheduledJobRun, TikTokShop } = require('../models');
const {
  JOB_KEYS,
  normalizeRunTimes,
  assertTimezone,
  enqueueScheduledJob,
  stopScheduledJob,
} = require('../services/scheduledJobService');

const serializeJob = async (job) => {
  const runs = await ScheduledJobRun.findAll({
    where: { scheduled_job_id: job.id },
    order: [['started_at', 'DESC']],
    limit: 30,
  });
  return { ...job.toJSON(), run_count: job.run_times.length, runs };
};

const listSchedules = async (_req, res) => {
  try {
    const jobs = await ScheduledJob.findAll({ order: [['id', 'ASC']] });
    const shops = await TikTokShop.findAll({
      attributes: ['id', 'name', 'code', 'region'],
      order: [['id', 'ASC']],
    });
    res.json({
      schedules: await Promise.all(jobs.map(serializeJob)),
      shops,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const updateSchedule = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const runTimes = normalizeRunTimes(req.body?.run_times);
    const timezone = assertTimezone(req.body?.timezone);
    await job.update({
      enabled: Boolean(req.body?.enabled),
      timezone,
      run_times: runTimes,
      updated_at: new Date(),
    });
    res.json({ schedule: await serializeJob(job) });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const runScheduleNow = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const { run, created } = await enqueueScheduledJob(job);
    res.status(created ? 202 : 409).json({ run, started: created });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const stopScheduleNow = async (req, res) => {
  try {
    const jobKey = String(req.params.jobKey || '');
    if (!JOB_KEYS.has(jobKey)) return res.status(404).json({ message: 'Schedule not found.' });
    const job = await ScheduledJob.findOne({ where: { job_key: jobKey } });
    if (!job) return res.status(404).json({ message: 'Schedule not found.' });
    const run = await stopScheduledJob(job);
    if (!run) return res.status(409).json({ message: 'This job is not running.' });
    return res.json({ run, stopped: true });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { listSchedules, updateSchedule, runScheduleNow, stopScheduleNow };

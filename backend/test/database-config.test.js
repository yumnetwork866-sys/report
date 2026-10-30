const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const backendRoot = path.resolve(__dirname, '..');

const loadJitOption = (environment) => execFileSync(
  process.execPath,
  ['-e', "const db = require('./src/db/config'); process.stdout.write(db.options.dialectOptions.options);"],
  {
    cwd: backendRoot,
    env: {
      ...process.env,
      DATABASE_URL: 'postgresql://user:password@127.0.0.1:5432/report',
      DB_JIT: '',
      DB_JIT_API: '',
      DB_JIT_WORKER: '',
      ...environment,
    },
    encoding: 'utf8',
  },
);

test('database JIT defaults off for API and on for worker', () => {
  assert.equal(loadJitOption({ PROCESS_ROLE: 'api' }), '-c jit=off');
  assert.equal(loadJitOption({ PROCESS_ROLE: 'worker' }), '-c jit=on');
});

test('role-specific database JIT setting overrides the default', () => {
  assert.equal(loadJitOption({ PROCESS_ROLE: 'api', DB_JIT_API: 'true' }), '-c jit=on');
  assert.equal(loadJitOption({ PROCESS_ROLE: 'worker', DB_JIT_WORKER: 'false' }), '-c jit=off');
});

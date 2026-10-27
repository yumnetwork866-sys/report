const { spawn } = require('node:child_process');

const mode = process.argv[2] === 'dev' ? 'dev' : 'start';
const node = process.execPath;
const commands = mode === 'dev'
  ? [
    [require.resolve('nodemon/bin/nodemon.js'), 'src/api-server.js'],
    [require.resolve('nodemon/bin/nodemon.js'), 'src/worker.js'],
  ]
  : [
    ['src/api-server.js'],
    ['src/worker.js'],
  ];

const children = commands.map((args) => spawn(node, args, {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: process.env,
}));

let stopping = false;
const stopChildren = (signal = 'SIGTERM') => {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
};

for (const child of children) {
  child.once('exit', (code, signal) => {
    if (!stopping) {
      stopChildren('SIGTERM');
      process.exitCode = code ?? (signal ? 1 : 0);
    }
  });
}

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

import { spawn } from 'node:child_process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const port = process.env.PORT?.trim() || '3000';

const child = spawn(
  npmCommand,
  ['run', 'start', '-w', '@post-recovery/web', '--', '--hostname', '0.0.0.0', '--port', port],
  {
    stdio: 'inherit',
    env: process.env,
  },
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

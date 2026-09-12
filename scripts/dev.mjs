import { spawn } from 'node:child_process';

const command = process.platform === 'win32' ? 'corepack.cmd' : 'pnpm';
const children = [
  spawn(command, ['pnpm', 'run', 'dev:api'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' }),
  spawn(command, ['pnpm', '--filter', '@workspace/ecodev', 'dev'], { stdio: 'inherit', env: process.env, shell: process.platform === 'win32' }),
];

let shuttingDown = false;
function stop(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => process.exit(code), 250);
}

for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

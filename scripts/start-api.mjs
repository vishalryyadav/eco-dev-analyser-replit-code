import { spawn } from 'node:child_process';

const port = process.env.PORT ?? '4310';
const child = spawn(process.execPath, ['--enable-source-maps', 'artifacts/api-server/dist/index.mjs'], {
  env: { ...process.env, PORT: port },
  stdio: 'inherit',
  windowsHide: false,
});

const stop = (signal) => child.kill(signal);
process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
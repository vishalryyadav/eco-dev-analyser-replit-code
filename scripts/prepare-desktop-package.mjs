import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const target = path.join(root, 'integrations', 'desktop-app', 'embedded');
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(path.join(root, 'artifacts', 'ecodev', 'dist'), path.join(target, 'web'), { recursive: true });
await cp(path.join(root, 'artifacts', 'api-server', 'dist', 'index.mjs'), path.join(target, 'api.mjs'));
console.log(`Prepared embedded EcoDev web/API bundle at ${target}`);

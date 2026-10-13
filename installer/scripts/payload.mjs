import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const payload = join(root, 'installer/src-tauri/payload');
mkdirSync(payload, { recursive: true });

const run = (cwd, command, args) =>
  execFileSync(command, args, { cwd: join(root, cwd), stdio: 'inherit', shell: process.platform === 'win32' });

run('millennium', 'pnpm', ['exec', 'starlight', 'pack', '--release', '-o', payload]);

run('standalone', 'node', ['scripts/build.mjs']);
copyFileSync(join(root, 'standalone/dist/download-all.exe'), join(payload, 'download-all.exe'));

for (const file of ['dev.brainerd.download-all.star', 'download-all.exe']) {
  if (!existsSync(join(payload, file))) throw new Error(`payload missing ${file}`);
}
console.log(`Payload ready in ${payload}`);

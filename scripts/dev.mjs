import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../', import.meta.url));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--config', path.join(root, 'config/vite.config.ts')], { cwd: root, stdio: 'inherit', windowsHide: true });
let desktop;
let stopped = false;
const stop = () => { if (stopped) return; stopped = true; desktop?.kill(); vite.kill(); };
process.on('SIGINT', stop); process.on('SIGTERM', stop); process.on('exit', stop);
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch('http://127.0.0.1:5173')).ok) break; } catch { /* Vite is starting. */ }
  await new Promise(resolve => setTimeout(resolve, 150));
  if (attempt === 99) { stop(); throw new Error('Vite 启动超时'); }
}
desktop = spawn(require('electron'), [root, '--dev', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', env, windowsHide: true });
desktop.on('exit', stop); vite.on('exit', stop);

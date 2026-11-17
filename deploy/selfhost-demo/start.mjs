import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { demoEnvironment } from './settings.mjs';
const child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', fileURLToPath(new URL('server.mjs', import.meta.url))], {
  env: demoEnvironment(), stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => { console.error('Demon käynnistys epäonnistui.'); process.exitCode = 1; });
child.on('exit', (code) => { process.exitCode = code ?? 1; });

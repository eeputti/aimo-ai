// Own the CLI subtree. IPC disconnect also fires if the runner dies without cleanup.
import { spawn } from 'node:child_process';

const [executable, ...args] = process.argv.slice(2);
const stop = () => {
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => { child.kill(); process.exit(1); });
  } else { try { process.kill(-process.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); process.exit(1); } }
};
const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['pipe', 'inherit', 'inherit'] });
process.on('disconnect', stop);
child.stdin.on('error', () => {});
process.stdin.pipe(child.stdin);
child.on('error', () => { process.exitCode = 1; });
child.once('close', (code) => {
  process.removeListener('disconnect', stop);
  if (process.connected) process.disconnect();
  process.exitCode = code === 0 ? 0 : 1;
});

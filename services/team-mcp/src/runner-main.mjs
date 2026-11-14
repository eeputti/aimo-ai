import crypto from 'node:crypto';
import { runnerConfig } from './runner-config.mjs';
import { resolveCli } from './runner-process.mjs';
import { connectRunner } from './runner-client.mjs';
import { localRunnerState } from './runner-local.mjs';
import { createLocalRunner } from './runner.mjs';

const controller = new AbortController(); const stop = () => controller.abort();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
let remote, journal;
try {
  const settings = runnerConfig(); const instanceId = crypto.randomUUID();
  resolveCli(settings.binary, settings.provider);
  journal = localRunnerState(settings.state, instanceId);
  remote = await connectRunner(settings);
  console.log(`Local runner: ${settings.member}, ${settings.provider}, ${settings.access}\nKeep this terminal open. Existing browser chats are not woken.`);
  await createLocalRunner(settings, remote, journal, { instanceId }).run(controller.signal);
} catch (err) {
  console.error(/^[A-Z][A-Z0-9_]{0,79}$/.test(err.code || '') ? err.code : 'RUNNER_START_FAILED: check .env.runner, CLI installation and server version'); process.exitCode = 1;
} finally {
  controller.abort(); process.off('SIGINT', stop); process.off('SIGTERM', stop);
  await remote?.close(); journal?.close();
}

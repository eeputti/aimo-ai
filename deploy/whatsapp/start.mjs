// Environment is supplied by Node's --env-file options or the hosting platform.
import fs from 'node:fs';
import path from 'node:path';
import { checkWhatsAppEnvironment, formatPreflight, ROOT } from '../../scripts/whatsapp-preflight.mjs';

process.chdir(ROOT);
const result = checkWhatsAppEnvironment();
console.log(formatPreflight(result));
if (!result.ok) process.exitCode = 1;
else {
  // Only create the configured directories after the entire read-only check has passed.
  for (const filename of Object.values(result.databasePaths)) fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  await import('../../server/whatsapp-server.mjs');
}

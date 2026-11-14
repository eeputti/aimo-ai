// Nollaa demon: tyhjentää kannan, generoi demodatan uudelleen ja ajaa syväanalyysin. Aja: npm run reset
import { seedDemo } from '../server/demo.mjs';
import { runDeep } from '../server/agents/deep.mjs';
import { clearApiCache } from '../server/valioApi.mjs';

if (process.argv.includes('--fresh-api')) clearApiCache();
const seed = await seedDemo();
console.log('Demodata:', seed);
const p = await runDeep({ reason: 'demo nollattu' });
console.log(`Ehdotus ${p.id}: ${p.totals.lines} riviä, ${p.totals.net} €, ${p.approvals.length} päätettävää, syväajo ${p.deep.ms} ms`);
for (const s of p.deep.steps) console.log(`  ${String(s.ms).padStart(7)} ms  ${s.name}: ${s.detail}`);
console.log('\n' + p.briefing);

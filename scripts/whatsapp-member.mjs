// Run on the server hosting the WhatsApp DB. No public enrollment/admin endpoint.
import { openWhatsAppStore } from '../server/whatsapp/store.mjs';
import { whatsappDbPath } from '../server/whatsapp/runtime.mjs';

const [command, ...args] = process.argv.slice(2);
const usage = 'Käyttö: npm run whatsapp:member -- invite --phone +358401234567 --company "Ravintola A" --person "Anna"\n       npm run whatsapp:member -- revoke --phone +358401234567';
let store;
try {
  if (!['invite', 'revoke'].includes(command) || args.length % 2) throw new Error(usage);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!['--phone', '--company', '--person'].includes(args[i]) || args[i] in options) throw new Error(usage);
    options[args[i]] = args[i + 1];
  }
  store = openWhatsAppStore(whatsappDbPath());
  if (command === 'invite') {
    const result = store.invite(options['--phone'], options['--company'], options['--person']);
    console.log(`Anna koodi vain kutsutulle henkilölle luotettavaa kanavaa pitkin. Voimassa 10 minuuttia.\nLähetä agentin WhatsApp-numeroon: YHDISTA ${result.code}`);
  } else { store.revoke(options['--phone']); console.log('Numeron yhteys, kutsu ja odottavat vastaukset poistettu.'); }
} catch (err) { console.error(err.message); process.exitCode = 1; }
finally { store?.close(); }

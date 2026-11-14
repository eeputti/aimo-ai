import { config } from './config.mjs';
import { openStore } from './store.mjs';
const [command, ...args] = process.argv.slice(2);
const options = {};
let store;
try {
  if (!['add-member', 'rotate-key', 'revoke-member', 'list-members'].includes(command) || args.length % 2) throw new Error('Usage: npm run admin -- add-member --id daniel-chatgpt --name "Daniel / ChatGPT" --projects aimo-ai');
  for (let i = 0; i < args.length; i += 2) {
    if (!['--id', '--name', '--projects'].includes(args[i]) || Object.hasOwn(options, args[i])) throw new Error('Invalid option');
    options[args[i]] = args[i + 1];
  }
  store = openStore(config().db);
  if (command === 'add-member') {
    const key = store.addMember(options['--id'], options['--name'], (options['--projects'] || '').split(',').filter(Boolean));
    console.log(`Member created: ${options['--id']}\nPrivate member key (shown once): ${key}\nGive only to this member; never commit or send to project messages.`);
  } else if (command === 'rotate-key') console.log(`New private member key: ${store.rotateMember(options['--id'])}`);
  else if (command === 'revoke-member') { store.revokeMember(options['--id']); console.log('Member revoked; credentials and OAuth grants no longer work.'); }
  else console.log(JSON.stringify(store.db.prepare('SELECT id,name,projects,disabled,key_expires FROM members').all(), null, 2));
} catch (err) { console.error(err.message); process.exitCode = 1; }
finally { store?.close(); }

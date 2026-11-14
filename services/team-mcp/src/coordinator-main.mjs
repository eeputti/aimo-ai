import { config } from './config.mjs';
import { openStore } from './store.mjs';
import { coordinatorConfig, createCoordinator } from './coordinator.mjs';
import { createCoordinatorDashboard } from './coordinator-web.mjs';

const controller = new AbortController();
const stop = () => controller.abort();
process.once('SIGINT', stop); process.once('SIGTERM', stop);
let store, server;
try {
  const settings = coordinatorConfig();
  store = openStore(config().db);
  const coordinator = createCoordinator(store, settings);
  const app = createCoordinatorDashboard(store, settings.port);
  server = app.listen(settings.port, '127.0.0.1');
  await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
  console.log(`Koordinaattori: ${settings.mode}\nTilannenäkymä: http://127.0.0.1:${settings.port}\nProjekti: ${settings.project}; palvelutunniste: ${settings.actor}\nCtrl+C sulkee koordinaattorin. Nykyinen MCP-tunneli jatkaa toimintaansa.`);
  await coordinator.run(controller.signal);
} catch (err) {
  console.error(err.code === 'EADDRINUSE' ? 'Koordinaattorin portti on jo käytössä. Älä käynnistä toista samaan porttiin.' : 'Koordinaattori pysähtyi: tarkista asetukset, jäsenen oikeudet ja kantapolku.');
  if (/^(OpenAI mode requires|Invalid coordinator|Coordinator id belongs)/.test(err.message)) console.error(err.message);
  process.exitCode = 1;
} finally {
  controller.abort(); process.off('SIGINT', stop); process.off('SIGTERM', stop);
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  store?.close();
}

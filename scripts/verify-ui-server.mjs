/** One-shot, self-hosted browser gate. No persistent dev server / wait loops.
 * Uses the real Vite config on an isolated port and always closes the server.
 */
import { createServer } from 'vite';
import { uiStagePlan } from './ui-stage-plan.mjs';

if(process.argv.length>3)throw new Error('Expected at most one UI stage argument');
const stages=uiStagePlan(process.argv[2]);
if(stages.dev){
  const port = Number(process.env.UI_TEST_PORT ?? 5174);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('UI_TEST_PORT must be an integer between 1024 and 65535');
  }
  const server = await createServer({
    server: { host: '0.0.0.0', port, strictPort: true },
  });
  try {
    await server.listen();
    // The browser is in the same test process environment, not the user's device.
    // Browser-facing application URLs still stay relative / provider-direct.
    process.env.UI_BASE_URL = `http://127.0.0.1:${port}`;
    await import('./verify-ui.mjs');
  } finally {
    await server.close();
  }
}

// A dev/HMR gate cannot prove production CSP compatibility. Test built dist
// separately under the exact static-host headers, after closing the dev server.
if(stages.production){
  const { verifyProductionCsp } = await import("./verify-csp-ui.mjs");
  await verifyProductionCsp();
}

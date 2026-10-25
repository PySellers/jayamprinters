// Runs the browser suites: node ui_run.mjs [access] [crud] [orders] ...
import { launch, save, RESULTS } from './ui_framework.mjs';
import { accessTests } from './ui_access.mjs';
const which = process.argv.slice(2);
const all = which.length === 0;
const browser = await launch();
let sessions;
try {
  if (all || which.includes('access')) sessions = await accessTests(browser);
  if (all || which.includes('crud')) { const m = await import('./ui_crud.mjs'); await m.crudTests(browser); }
  if (all || which.includes('layout')) { const m = await import('./ui_layout.mjs'); await m.layoutTests(browser); }
  if (all || which.includes('extra')) { const m = await import('./ui_extra.mjs'); await m.extraTests(browser); }
  if (all || which.includes('orders')) { const m = await import('./ui_orders.mjs'); await m.orderTests(browser); }
  if (all || which.includes('enhancements')) { const m = await import('./ui_enhancements.mjs'); await m.enhancementTests(browser); }
} finally {
  await browser.close();
  save(new URL(`./ui_results_${which.join('-') || 'all'}.json`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}

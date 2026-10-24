// Browser tests: Start New Order for every service, extra charges, GST, invoice, payments, printing, job cards, quotations.
import fs from 'node:fs';
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UIORD' + Date.now().toString().slice(-6);
const specs = JSON.parse(fs.readFileSync(new URL('./ui_specs.json', import.meta.url), 'utf-8'));
const money = (s) => Number(String(s).replace(/[₹,\s]/g, ''));
const today = new Date().toISOString().slice(0, 10);

async function totalShown(page) {
  const t = await bodyText(page);
  const m = t.match(/Total:?\s*₹\s*([\d,]+(?:\.\d+)?)/i) || t.match(/Amount:?\s*₹\s*([\d,]+(?:\.\d+)?)/i);
  return m ? money(m[1]) : null;
}

export async function orderTests(browser) {
  const session = await loginApi(...ADMIN);
  const tok = session.access_token;
  const ctx = await signedIn(browser, session);
  let page = await ctx.newPage();
  let live = watch(page);
  const fresh = async () => { await page.close().catch(() => {}); page = await ctx.newPage(); live = watch(page); };
  const mkCustomer = async (suffix) => (await apiCall('POST', '/customers/', { name: `${U} ${suffix}`, phone: '9' + String(Math.random()).slice(2, 11), email: 'o@example.com', reason: 'UI test' }, tok)).data;
  const orderUrl = (cust, catId, gst = 0) => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${catId}&withGst=${gst}&proof1Date=${today}&proof1Time=16%3A15&deliveryDate=${today}`;

  // ------------------------------------------------------------------ Start New Order form
  const M1 = 'Start New Order (dashboard)';
  await run('UI-ORD', M1, 'The Start New Order form shows every field and a Service list with all 14 services', 'Form fields present; 14 services selectable', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    for (const l of ['Billing Person Name', 'Phone Number', 'Proof 1 Date', 'Delivery Date', 'Service']) {
      expect(await page.getByLabel(l, { exact: false }).first().isVisible(), `field "${l}" missing`);
    }
    await page.getByLabel('Service', { exact: false }).first().click();
    const n = await page.getByRole('option').count();
    expect(n >= 14, `only ${n} services in the list`);
    await page.keyboard.press('Escape');
    await shot(page, 'dashboard-start-order');
    return `${n} services in the list`;
  }, page, live);

  await run('UI-ORD', M1, 'Starting an order without a phone number / service is blocked', 'Form does not move on; a message is shown', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForTimeout(700);
    expect(page.url().includes('/dashboard'), 'moved on with an empty form: ' + page.url());
  }, page, live);

  const startCust = { name: `${U} Walkin`, phone: '9' + String(Math.random()).slice(2, 11) };
  await run('UI-ORD', M1, 'Fill the dashboard form, choose Visiting Card and press Start Order', 'Opens the order form for that customer and service', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(startCust.name);
    await page.getByLabel('Phone Number', { exact: false }).first().fill(startCust.phone);
    await pick(page, 'Service', 'Visiting Card');
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    await page.waitForTimeout(800);
    expect((await bodyText(page)).includes(startCust.name), 'customer name not carried to the order form');
    expect((await bodyText(page)).toLowerCase().includes('complete order'), 'order form heading missing');
    await shot(page, 'order-form-visiting-card');
  }, page, live);

  await run('UI-ORD', M1, 'The customer typed on the dashboard was saved as a customer record', 'Customer exists with that phone', async () => {
    const list = (await apiCall('GET', '/customers/', null, tok)).data;
    const c = list.find((x) => x.phone === startCust.phone);
    expect(c && c.name === startCust.name, 'customer not created');
    startCust.id = c.id;
  }, page, live);

  // ------------------------------------------------------------------ price on screen, with extra charges
  const M2 = 'Order form pricing';
  const vc = specs.find((s) => s.service === 'Visiting Card');
  await run('UI-ORD', M2, 'Visiting Card: choosing finish, side and quantity shows the right total', `Total Rs${vc.expected}`, async () => {
    await pick(page, 'Item / Size', 'Visiting Card');
    for (const [a, v] of vc.opts) await pick(page, a, v);
    await page.getByLabel('Qty', { exact: false }).first().fill(String(vc.qty));
    await page.waitForTimeout(1500);
    const t = await totalShown(page);
    expect(t === vc.expected, `screen shows Rs${t}, expected Rs${vc.expected}`);
    return `Rs${t}`;
  }, page, live);

  await run('UI-ORD', M2, 'Ticking an extra charge (Designing Charge Rs300) adds it to the total', `Total rises by Rs300`, async () => {
    await page.getByLabel('Designing Charge', { exact: false }).first().check();
    await page.waitForTimeout(1500);
    const t = await totalShown(page);
    expect(Math.abs(t - (vc.expected + 300)) < 0.01, `screen shows Rs${t}, expected Rs${vc.expected + 300}`);
    return `Rs${t}`;
  }, page, live);

  await run('UI-ORD', M2, 'Un-ticking the extra charge takes it off again', `Total back to Rs${vc.expected}`, async () => {
    await page.getByLabel('Designing Charge', { exact: false }).first().uncheck();
    await page.waitForTimeout(1500);
    const t = await totalShown(page);
    expect(t === vc.expected, `screen shows Rs${t}`);
  }, page, live);

  await run('UI-ORD', M2, 'Changing the quantity to one that has no rate (e.g. 77) stops the price instead of guessing', 'No total / a clear "no price" state', async () => {
    await page.getByLabel('Qty', { exact: false }).first().fill('77');
    await page.waitForTimeout(1500);
    const t = await totalShown(page);
    expect(t === null || t === 0, `screen shows Rs${t} for an un-priced quantity`);
    await page.getByLabel('Qty', { exact: false }).first().fill(String(vc.qty));
    await page.waitForTimeout(1200);
  }, page, live);

  // ------------------------------------------------------------------ complete the order: invoice + job card
  const M3 = 'Complete Order -> Invoice -> Job card';
  let invoiceUrl;
  await run('UI-INV', M3, 'Generate Invoice creates the invoice and opens it', 'Invoice page with the correct grand total', async () => {
    await page.getByLabel('Designing Charge', { exact: false }).first().check();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    invoiceUrl = page.url();
    const t = await bodyText(page);
    expect(t.includes(`₹${(vc.expected + 300).toFixed(2)}`), `grand total Rs${vc.expected + 300} not on the invoice: ` + t.slice(t.indexOf('INV-'), t.indexOf('INV-') + 200));
    expect(t.includes(startCust.name), 'customer name missing on the invoice');
    await shot(page, 'invoice-detail');
    return invoiceUrl.replace(BASE, '');
  }, page, live);

  const invId = () => Number(invoiceUrl.split('/').pop());
  await run('UI-INV', M3, 'A job card was created automatically for the order', 'JC-xxxxx exists for this customer in Pending', async () => {
    const jobs = (await apiCall('GET', '/job-cards/', null, tok)).data.filter((j) => j.customer_id === startCust.id);
    expect(jobs.length === 1, `${jobs.length} job cards`);
    expect(jobs[0].status === 'pending', jobs[0].status);
    return jobs[0].job_number;
  }, page, live);

  await run('UI-INV', M3, 'The new order appears in the Live Job Status board on the dashboard', 'Customer name visible on the board', async () => {
    await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    expect((await bodyText(page)).includes(startCust.name), 'order not on the dashboard board');
    await shot(page, 'dashboard-live-board');
  }, page, live);

  // ------------------------------------------------------------------ payments through the screen
  const M4 = 'Invoice payments (screen)';
  const total = vc.expected + 300;
  await run('UI-PAY', M4, 'Record a part payment by UPI on the invoice screen', 'Status "partially paid"; balance shown', async () => {
    await page.goto(BASE + `/invoices/${invId()}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /record payment/i }).click();
    await page.getByRole('dialog').getByLabel('Amount', { exact: false }).fill('500');
    await page.getByRole('dialog').getByLabel('Method').click();
    await page.getByRole('option', { name: /upi/i }).click();
    await page.getByRole('dialog').getByLabel('Reference Number').fill('UPI-UITEST-1');
    await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    const t = await bodyText(page);
    expect(/partially paid/i.test(t), 'status not part-paid');
    expect(t.includes(`₹${(total - 500).toFixed(2)}`), 'balance due not shown: ' + t.slice(t.indexOf('Totals'), t.indexOf('Totals') + 200));
  }, page, live);

  await run('UI-PAY', M4, 'Paying more than the balance is refused with a message', 'Error shown; invoice unchanged', async () => {
    await page.getByRole('button', { name: /record payment/i }).click();
    await page.getByRole('dialog').getByLabel('Amount', { exact: false }).fill(String(total));
    await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    const open = await page.getByRole('dialog').isVisible();
    const txt = open ? await page.getByRole('dialog').innerText() : '';
    expect(open && /balance due/i.test(txt), 'overpayment not stopped, or no message: ' + txt.slice(0, 160));
    const paid = (await apiCall('GET', `/invoices/${invId()}`, null, tok)).data.amount_paid;
    expect(Math.abs(paid - 500) < 0.01, `invoice now shows Rs${paid} paid`);
    await page.getByRole('dialog').getByRole('button', { name: /cancel/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 });
  }, page, live);

  await run('UI-PAY', M4, 'Pay the rest in cash - invoice becomes Paid', 'Status "paid", balance Rs0', async () => {
    await page.getByRole('button', { name: /record payment/i }).click();
    await page.getByRole('dialog').getByLabel('Amount', { exact: false }).fill(String(total - 500));
    await page.getByRole('dialog').getByRole('button', { name: /^save$/i }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    const t = await bodyText(page);
    expect(/\bpaid\b/i.test(t) && !/partially paid/i.test(t), 'status not paid');
    expect(/Balance Due\s*₹0\.00/.test(t), 'balance not zero');
    await shot(page, 'invoice-paid');
  }, page, live);

  // ------------------------------------------------------------------ printing
  const M5 = 'Printing & Downloads';
  for (const [label, re] of [['A4 Invoice', /\/invoices\/\d+\/pdf\?format=a4/], ['Receipt (80mm)', /thermal_80/], ['Receipt (58mm)', /thermal_58/]]) {
    await run('UI-PRT', M5, `Print > ${label} fetches a real PDF`, 'HTTP 200 application/pdf', async () => {
      await page.goto(BASE + `/invoices/${invId()}`, { waitUntil: 'networkidle' });
      const respP = page.waitForResponse((r) => re.test(r.url()), { timeout: 15000 });
      await page.getByRole('button', { name: /^print$/i }).click();
      await page.getByRole('menuitem', { name: new RegExp(label.replace(/[()]/g, '\\$&')) }).click();
      const r = await respP;
      expect(r.status() === 200 && /pdf/.test(r.headers()['content-type'] || ''), `HTTP ${r.status()} ${r.headers()['content-type']}`);
      await page.waitForTimeout(500);
    }, page, live);
  }
  await run('UI-PRT', M5, 'Download menu offers the pre-printed GST / Cash bill layouts', 'Menu lists bill choices; PDF fetched', async () => {
    await page.goto(BASE + `/invoices/${invId()}`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^download$/i }).click();
    const items = await page.getByRole('menuitem').allInnerTexts();
    expect(items.length >= 2, 'menu has ' + items.length + ' items');
    const respP = page.waitForResponse((r) => /\/pdf|bill-pdf/.test(r.url()), { timeout: 15000 });
    await page.getByRole('menuitem').first().click();
    const r = await respP;
    expect(r.status() === 200, 'HTTP ' + r.status());
    return items.map((i) => i.split('\n')[0]).join(' / ');
  }, page, live);

  // ------------------------------------------------------------------ GST order
  const M6 = 'GST orders';
  const gcust = await mkCustomer('GST');
  await run('UI-GST', M6, 'An order started "With GST" shows GST on the invoice', 'Tax = 18% of the subtotal', async () => {
    await page.goto(BASE + orderUrl(gcust, vc.category_id, 1), { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await pick(page, 'Item / Size', 'Visiting Card');
    for (const [a, v] of vc.opts) await pick(page, a, v);
    await page.getByLabel('Qty', { exact: false }).first().fill(String(vc.qty));
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(900);
    const t = await bodyText(page);
    const tax = Math.round(vc.expected * 0.18 * 100) / 100;
    expect(t.includes(`₹${tax.toFixed(2)}`), `GST Rs${tax} not on the invoice`);
    expect(t.includes(`₹${(vc.expected + tax).toFixed(2)}`), 'grand total with GST missing');
    return `Rs${vc.expected} + GST Rs${tax} = Rs${(vc.expected + tax).toFixed(2)}`;
  }, page, live);

  // ------------------------------------------------------------------ each service through the screen
  const M7 = 'Every service: order form price';
  for (const s of specs) {
    await fresh();
    const cust = await mkCustomer(s.service.slice(0, 8));
    await run('UI-SVC', M7, `${s.service}: pick ${s.product}${s.opts.length ? ' (' + s.opts.map((o) => o[1]).join(', ') + ')' : ''}, qty ${s.qty} -> price on screen`, `Total Rs${s.expected.toLocaleString('en-IN')}`, async () => {
      await page.goto(BASE + orderUrl(cust, s.category_id), { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      if (s.guided === 'bill_book') {
        // guided wizard
        const map = { 'Document Type': 'Document type', 'Paper/GSM Type': 'GSM / grade', 'Copies per Set': 'Copies per set', 'Paper Name': 'Paper name', 'Print Side': 'Print side' };
        await pick(page, 'Document type', s.opts.find((o) => o[0] === 'Document Type')[1]);
        await pick(page, 'Size', s.product.replace('Sheet Printing - ', ''));
        for (const [a, v] of s.opts) if (a !== 'Document Type') await pick(page, map[a], v);
        await page.getByLabel('Quantity (Nos)').fill(String(s.qty));
      } else {
        await pick(page, 'Item / Size', s.product);
        for (const [a, v] of s.opts) await pick(page, a, v);
        if (s.sets > 1) {
          await page.getByLabel('Pages / set').fill(String(s.qty / s.sets));
          await page.getByLabel('Sets', { exact: true }).fill(String(s.sets));
        } else {
          await page.getByLabel('Qty', { exact: false }).first().fill(String(s.qty));
        }
        if (s.area) {
          await page.getByLabel('Width (ft)').fill('8');
          await page.getByLabel('Height (ft)').fill(String(s.area / 8));
        }
      }
      await page.waitForTimeout(1800);
      const t = await totalShown(page);
      expect(t !== null && Math.abs(t - s.expected) < 0.06, `screen shows Rs${t}, expected Rs${s.expected}`);
      await shot(page, 'service-' + s.service.replace(/\W+/g, '-').toLowerCase());
      return `Screen shows Rs${t}`;
    }, page, live);
  }

  // ------------------------------------------------------------------ job cards screen
  const M8 = 'Job cards (screen)';
  await run('UI-JOB', M8, 'The job card list shows the new job with customer, product and status', 'Row visible', async () => {
    await page.goto(BASE + '/job-cards', { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    const r = page.locator('tbody tr', { hasText: startCust.name }).first();
    expect(await r.isVisible(), 'job not listed');
    const txt = (await r.innerText()).replace(/\s+/g, ' ');
    expect(/Visiting Card/i.test(txt), 'product missing: ' + txt);
    return txt.slice(0, 100);
  }, page, live);

  await run('UI-JOB', M8, 'Assign machine / designer / operator from the dialog', 'Assignments saved and shown', async () => {
    const r = page.locator('tbody tr', { hasText: startCust.name }).first();
    await r.getByRole('button', { name: /assign machine/i }).click();
    const d = page.getByRole('dialog');
    await d.getByLabel('Machine').click();
    await page.getByRole('option').nth(1).click();
    await d.getByLabel('Designer').click();
    await page.getByRole('option').nth(1).click();
    await d.getByLabel('Operator').click();
    await page.getByRole('option').nth(1).click();
    await d.getByLabel('Notes').fill('UI test note');
    await d.getByRole('button', { name: /^save$/i }).click();
    await d.waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(700);
    const job = (await apiCall('GET', '/job-cards/', null, tok)).data.find((j) => j.customer_id === startCust.id);
    expect(job.machine_id && job.designer_id && job.operator_id, 'assignments not saved');
  }, page, live);

  await run('UI-JOB', M8, 'Change the job status from the list', 'Status updates through the status control', async () => {
    const r = page.locator('tbody tr', { hasText: startCust.name }).first();
    const chip = r.locator('[class*=MuiChip]').filter({ hasText: /pending/i }).first();
    await chip.click();
    await page.getByRole('menuitem', { name: /printing/i }).click();
    await page.waitForTimeout(900);
    const job = (await apiCall('GET', '/job-cards/', null, tok)).data.find((j) => j.customer_id === startCust.id);
    expect(job.status === 'printing', 'status is ' + job.status);
  }, page, live);

  await run('UI-JOB', M8, 'Open the printable job sheet, edit and save it', 'Sheet opens with invoice number and saves', async () => {
    const r = page.locator('tbody tr', { hasText: startCust.name }).first();
    await r.getByRole('button', { name: /open job card/i }).click();
    await page.waitForURL(/job-cards\/\d+/, { timeout: 8000 });
    await page.waitForTimeout(1000);
    expect(/JOB CARD No: INV-/.test(await bodyText(page)), 'invoice no. missing on the sheet');
    await shot(page, 'job-card-sheet');
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(900);
  }, page, live);

  await run('UI-JOB', M8, 'Delivery challan can be opened for a job', 'DC dialog/page opens', async () => {
    await page.goto(BASE + '/job-cards', { waitUntil: 'networkidle' });
    const r = page.locator('tbody tr', { hasText: startCust.name }).first();
    await r.getByRole('button', { name: /delivery challan/i }).click();
    await page.waitForTimeout(900);
    expect(/To \(up to 3 lines\)/i.test(await bodyText(page)) || (await page.getByRole('dialog').count()) > 0, 'challan form did not open');
    await shot(page, 'delivery-challan');
  }, page, live);

  // ------------------------------------------------------------------ quotations
  const M9 = 'Quotations (screen)';
  await run('UI-QUO', M9, 'Create a quotation from the Quotations screen', 'Quotation appears in the list as Draft', async () => {
    const qc = await mkCustomer('Quote');
    await page.goto(BASE + '/quotations', { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /new quotation/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 8000 });
    await page.waitForTimeout(700);
    await page.getByLabel('Customer Name', { exact: false }).first().fill(qc.name);
    await page.getByRole('option', { name: qc.name }).first().click();
    await pick(page, 'Service', 'Visiting Card');
    await pick(page, 'Item / Size', 'Visiting Card');
    for (const [a, v] of vc.opts) await pick(page, a, v);
    await page.getByLabel('Qty', { exact: false }).first().fill(String(vc.qty));
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /create quotation/i }).click();
    await page.waitForURL(/quotations(\/\d+)?$/, { timeout: 12000 });
    await page.waitForTimeout(700);
    await page.goto(BASE + '/quotations', { waitUntil: 'networkidle' });
    expect((await bodyText(page)).includes(qc.name), 'quotation not listed');
    await shot(page, 'quotations-list');
  }, page, live);

  await run('UI-QUO', M9, 'Open a quotation and download its PDF', 'Detail opens; PDF returns 200', async () => {
    await page.locator('tbody tr').first().getByRole('button', { name: /^view$/i }).click();
    await page.waitForURL(/quotations\/\d+/, { timeout: 8000 });
    await page.waitForTimeout(800);
    await page.goBack();
    const respP = page.waitForResponse((r) => /quotations\/\d+\/pdf/.test(r.url()), { timeout: 15000 });
    await page.locator('tbody tr').first().getByRole('button', { name: /^download$/i }).click();
    const r = await respP;
    expect(r.status() === 200, 'HTTP ' + r.status());
  }, page, live);

  await ctx.close();
}

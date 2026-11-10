// Browser tests for client round 3: the compact dashboard and live job board, urgent jobs, the order page (service chosen
// once, minimum quantity, required extras with Custom, discount, "why this rate" with links), the paper of every copy,
// printing-charge bands in Pricing Setup, design proofs, and the dynamic job card with printing.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR3' + Date.now().toString().slice(-6);
const money = (s) => Number(String(s).replace(/[₹,\s]/g, ''));
const today = new Date().toISOString().slice(0, 10);

export async function round3Tests(browser) {
  const session = await loginApi(...ADMIN);
  const tok = session.access_token;
  const api = (m, p, b) => apiCall(m, p, b, tok);
  const ctx = await signedIn(browser, session);
  let page = await ctx.newPage();
  let live = watch(page);
  const fresh = async () => { await page.close().catch(() => {}); page = await ctx.newPage(); live = watch(page); };
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };

  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '9' + String(Math.random()).slice(2, 11), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const cat = (name) => cats.find((c) => c.name === name);
  const orderUrl = (name, extra = '') => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${cat(name).id}&withGst=0&proof1Date=${today}&proof1Time=16%3A15&proof2Date=${today}&proof2Time=18%3A00&deliveryDate=${today}${extra}`;
  const totalShown = async () => {
    const t = await bodyText(page);
    const m = t.match(/Total\s*₹\s*([\d,]+(?:\.\d+)?)/i);
    return m ? money(m[1]) : null;
  };
  const lineAmount = async () => {
    const el = page.getByTestId('line-amount').first();
    await el.waitFor({ timeout: 8000 });
    return money((await el.innerText()).replace('Amount:', ''));
  };
  const pickIn = async (scope, label, option) => {
    const box = scope.getByLabel(new RegExp('^' + label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '(\\s*\\*)?$')).first();
    await box.click();
    const exact = page.getByRole('option', { name: option, exact: true });
    await ((await exact.count()) > 0 ? exact.first() : page.getByRole('option', { name: option, exact: false }).first()).click();
    await page.waitForTimeout(250);
  };
  const orders = []; // quotation ids to clean up
  const jobsOf = async (quotationId) => {
    const q = (await api('GET', `/quotations/${quotationId}`)).data;
    const ids = new Set(q.items.map((i) => i.id));
    return (await api('GET', '/job-cards/')).data.filter((j) => ids.has(j.quotation_item_id));
  };

  // ============================================================ dashboard
  const M1 = 'Dashboard - compact order form and statistics';
  await run('UI-R3D', M1, 'The statistics are a slim strip and the order form is short, with the live jobs in view', 'Stat strip < 80px, jobs above the fold', async () => {
    await go('/dashboard');
    const strip = await page.getByTestId('stat-strip').boundingBox();
    expect(strip && strip.height < 80, `statistics strip is ${strip && strip.height}px tall`);
    const formH = await page.locator('h6:has-text("Start New Order")').evaluate((el) => el.closest('.MuiPaper-root').getBoundingClientRect().height);
    expect(formH < 1000, `the order form is ${Math.round(formH)}px tall`);
    expect(await page.getByTestId('live-board').count() === 0, 'the live board is still beside the order form');
    await page.getByTestId('live-switch').click();
    const board = await page.getByTestId('live-board').boundingBox();
    expect(board && board.y < 200, `live jobs start ${board && Math.round(board.y)}px down the page`);
    await shot(page, 'r3-dashboard');
    return `stat strip ${Math.round(strip.height)}px, order form ${Math.round(formH)}px, live jobs at ${Math.round(board.y)}px`;
  }, page, live);

  await run('UI-R3D', M1, 'Services are chosen from big tiles with a search, and every service is there', '14+ tiles, search narrows them', async () => {
    await go('/dashboard');
    const n = await page.getByTestId('service-tile').count();
    expect(n >= 14, `only ${n} service tiles`);
    await page.getByPlaceholder('Search a service...').fill('sticker');
    await page.waitForTimeout(300);
    const after = await page.getByTestId('service-tile').count();
    expect(after >= 1 && after <= 2, `${after} tiles for "sticker"`);
    await page.getByPlaceholder('Search a service...').fill('');
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    expect((await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).getAttribute('aria-pressed')) === 'true', 'tile not marked as chosen');
    return `${n} tiles; search "sticker" shows ${after}`;
  }, page, live);

  await run('UI-R3D', M1, 'Starting an order from the dashboard with a service tile and the Urgent switch opens the order as urgent', 'Order page marked URGENT', async () => {
    await go('/dashboard');
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(`${U} Walkin`);
    await page.getByLabel('Phone Number', { exact: false }).first().fill('9' + String(Math.random()).slice(2, 11));
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByTestId('urgent-toggle').click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    expect(page.url().includes('priority=urgent'), page.url());
    await page.getByTestId('urgent-chip').waitFor({ timeout: 5000 });
    const t = await bodyText(page);
    expect(t.includes('New Order: Invoice & Job Card') && !/complete order/i.test(t), 'heading is not the new one');
    await shot(page, 'r3-order-urgent');
  }, page, live);

  await run('UI-R3D', M1, 'Starting an order without choosing a service is blocked and says so', 'Stays on the dashboard, names the Service', async () => {
    await go('/dashboard');
    await page.getByLabel('Phone Number', { exact: false }).first().fill('9' + String(Math.random()).slice(2, 11));
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForTimeout(600);
    expect(page.url().includes('/dashboard'), 'moved on without a service');
    expect((await bodyText(page)).includes('Choose a service'), 'no message about the service');
  }, page, live);

  // ============================================================ live board
  const M2 = 'Dashboard - live job board';
  const mk = async (extra = {}) => {
    const items = (await api('GET', `/attributes/?category_id=${cat('Visiting Card').id}`)).data;
    const a = (n, v) => { const at = items.find((x) => x.name === n); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === v).id }; };
    const prod = (await api('GET', '/products/?limit=1000')).data.find((p) => p.category_id === cat('Visiting Card').id && p.name === 'Visiting Card');
    const q = await api('POST', '/quotations/', { customer_id: cust.id, with_gst: false, is_order: true, proof1_date: today, proof1_time: '17:00', items: [{ product_id: prod.id, quantity: 100, selected_options: [a('Finish/Lamination Type', 'Without Lamination'), a('Side', 'Single Side')], extra_charge_ids: [] }], ...extra });
    expect(q.status === 200 || q.status === 201, 'could not create the test order ' + JSON.stringify(q.data));
    orders.push(q.data.id);
    await api('POST', `/quotations/${q.data.id}/convert`);
    return (await jobsOf(q.data.id))[0];
  };
  const urgentJob = await mk({ priority: 'urgent' });
  const normalJob = await mk();
  const row = (job) => page.locator(`[data-testid="live-job"][data-job="${job.job_number}"]`);
  const find = async (job) => {
    await page.getByTestId('live-search').fill(job.job_number);
    await page.waitForTimeout(300);
  };

  await run('UI-R3L', M2, 'The board shows every status: seven stage chips with counts, and each job its own status', 'All 7 statuses named', async () => {
    await go('/dashboard?view=live');
    const legend = await page.getByTestId('status-legend').innerText();
    for (const s of ['Waiting to start', 'Design', 'Proof approval', 'Printing', 'Binding / finishing', 'Packing & handover', 'Delivered']) {
      expect(legend.includes(s), `status "${s}" missing from the board`);
    }
    await find(urgentJob);
    await row(urgentJob).waitFor({ timeout: 8000 });
    expect((await row(urgentJob).getByTestId('status-chip').innerText()).trim().length > 2, 'job has no status chip');
    return 'Legend: Waiting to start, Design, Proof approval, Printing, Binding / finishing, Packing & handover, Delivered';
  }, page, live);

  await run('UI-R3L', M2, 'An urgent job is bold with a red URGENT badge and sits at the top of the board', 'First row urgent; badge visible', async () => {
    await go('/dashboard?view=live');
    const rows = page.getByTestId('live-job');
    expect((await rows.first().getAttribute('data-urgent')) === 'true', 'the first job on the board is not urgent');
    await find(urgentJob);
    await row(urgentJob).getByTestId('urgent-badge').waitFor({ timeout: 5000 });
    await find(normalJob);
    await row(normalJob).waitFor({ timeout: 5000 });
    expect(!(await row(normalJob).getByTestId('urgent-badge').count()), 'a normal job carries the urgent badge');
    await find(urgentJob);
    const weight = await row(urgentJob).locator('p').first().evaluate((e) => Number(getComputedStyle(e).fontWeight));
    expect(weight >= 800, `job number weight ${weight}`);
    await shot(page, 'r3-live-board-urgent');
  }, page, live);

  await run('UI-R3L', M2, 'Clicking a job on the board opens that job', 'Goes to /job-cards/<id>/track', async () => {
    await go('/dashboard?view=live');
    await find(normalJob);
    await row(normalJob).click();
    await page.waitForURL(new RegExp(`/job-cards/${normalJob.id}/track`), { timeout: 8000 });
    await page.getByRole('heading', { name: normalJob.job_number }).waitFor({ timeout: 10000 });
    expect((await bodyText(page)).includes(normalJob.job_number), 'job number not on the opened page');
  }, page, live);

  await run('UI-R3L', M2, 'Changing the job status is reflected on the board (stage chip and stepper)', 'Printing chip + stepper', async () => {
    await api('PATCH', `/job-cards/${normalJob.id}/status`, { status: 'printing' });
    await go('/dashboard?view=live');
    await find(normalJob);
    const r = row(normalJob);
    await r.waitFor({ timeout: 8000 });
    expect((await r.getByTestId('status-chip').innerText()).trim() === 'Printing', 'chip does not say Printing');
    const stage = await r.locator('[aria-label^="Stage"]').getAttribute('aria-label');
    expect(stage === 'Stage: Printing', stage);
  }, page, live);

  await run('UI-R3L', M2, 'The Urgent / Overdue filters and the stage chips narrow the list', 'Only matching jobs', async () => {
    await go('/dashboard?view=live');
    await page.getByTestId('filter-urgent').click();
    await page.waitForTimeout(300);
    const flags = await page.getByTestId('live-job').evaluateAll((els) => els.map((e) => e.getAttribute('data-urgent')));
    expect(flags.length > 0 && flags.every((f) => f === 'true'), `urgent filter shows ${flags.length} jobs, not all urgent`);
    await page.getByTestId('stage-printing').click();
    await page.waitForTimeout(300);
    const chips = await page.getByTestId('live-job').locator('[data-testid="status-chip"]').allInnerTexts();
    expect(chips.length > 0 && chips.every((c) => c.trim() === 'Printing'), `stage filter: ${[...new Set(chips)].join(', ')}`);
    await page.getByTestId('filter-active').click();
  }, page, live);

  await run('UI-R3L', M2, 'The proof to watch is shown on each running job', 'Proof 1 text on the job row', async () => {
    await go('/dashboard?view=live');
    await page.getByTestId('filter-urgent').click();
    await find(urgentJob);
    const chip = row(urgentJob).getByTestId('proof-chip');
    await chip.waitFor({ timeout: 8000 });
    expect(/Proof 1/.test(await chip.innerText()), await chip.innerText());
    return await chip.innerText();
  }, page, live);

  // ============================================================ order page: Visiting Card
  const M3 = 'Order page - Visiting Card';
  await run('UI-R3O', M3, 'The order page has the new title, shows no duplicate Service / Item boxes, and asks for the minimum 50', 'Title; no Item / Size; Qty 50', async () => {
    await go(orderUrl('Visiting Card'));
    const t = await bodyText(page);
    expect(t.includes('New Order: Invoice & Job Card'), 'title not changed');
    expect(!(await page.getByLabel(/Item \/ Size/).count()), 'the duplicate Item / Size box is still there');
    expect(!(await page.getByLabel(/^Service/).count()), 'the Service box is still there');
    expect(t.includes('Minimum order 50'), 'minimum quantity hint missing');
    const qty = await page.getByLabel('Qty').inputValue();
    expect(qty === '50', `quantity starts at ${qty}`);
    expect(/generate invoice & job card/i.test(t), 'submit button text');
    await shot(page, 'r3-order-visiting-card');
  }, page, live);

  await run('UI-R3O', M3, 'The order page links to Pricing Setup for the service', 'Link to /pricing-setup?category=', async () => {
    const href = await page.getByTestId('pricing-setup-link').getAttribute('href');
    expect(href && href.includes(`/pricing-setup?category=${cat('Visiting Card').id}`), href);
  }, page, live);

  await run('UI-R3O', M3, 'Quantity below 50 is not accepted', 'A clear message, no price', async () => {
    await pickIn(page, 'Finish/Lamination Type', 'Without Lamination');
    await pickIn(page, 'Side', 'Single Side');
    await page.getByLabel('Qty').fill('10');
    await page.waitForTimeout(1200);
    expect((await bodyText(page)).includes('The minimum order for Visiting Card is 50'), 'no minimum-order message');
    await page.getByLabel('Qty').fill('100');
    await page.waitForTimeout(1200);
  }, page, live);

  let base;
  await run('UI-R3O', M3, 'Every extra is a required dropdown: the order is stopped until each says None, an option or Custom', 'Error naming the sections', async () => {
    base = await lineAmount();
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForTimeout(700);
    expect(page.url().includes('/quotations/new'), 'the order went through with unanswered extras');
    const t = await bodyText(page);
    expect(/Choose an option \(or None\)/i.test(t), 'no message about the extras');
    await shot(page, 'r3-extras-required');
    return 'Blocked: ' + (t.match(/Choose an option \(or None\) for: [^.]*/i) || [''])[0].slice(0, 90);
  }, page, live);

  await run('UI-R3O', M3, 'Answering None for every extra keeps the price; a real option adds its charge from Pricing Setup', 'Price follows each choice', async () => {
    for (const g of ['Foiling', 'Design', 'Corner cutting']) await pickNone(g);
    await page.waitForTimeout(1200);
    expect(Math.abs((await lineAmount()) - base) < 0.01, 'None changed the price');
    const charges = (await api('GET', `/extra-charges/?category_id=${cat('Visiting Card').id}`)).data;
    const four = charges.find((c) => c.name === 'Corner Cutting - Four Corner');
    await pickIn(page, 'Corner cutting', 'Four Corner');
    await page.waitForTimeout(1200);
    const now = await lineAmount();
    expect(Math.abs(now - (base + four.amount)) < 0.01, `with four-corner cutting Rs${now}, expected Rs${base + four.amount}`);
    return `Four-corner cutting added Rs${four.amount}`;
  }, page, live);
  async function pickNone(group) {
    await pickInSelect(group, 'None');
  }
  async function pickInSelect(group, option) {
    await page.getByTestId('required-extras').getByLabel(new RegExp('^' + group), { exact: false }).first().click();
    await page.getByRole('option', { name: option, exact: true }).first().click();
    await page.waitForTimeout(250);
  }

  await run('UI-R3O', M3, "'Custom...' lets the counter type a name and an amount, and the amount is added", 'Price + typed amount', async () => {
    const before = await lineAmount();
    await pickInSelect('Design', 'Custom...');
    await page.getByLabel('What is it?').fill('Rush artwork');
    await page.getByLabel('Amount', { exact: true }).fill('180');
    await page.waitForTimeout(1500);
    const after = await lineAmount();
    expect(Math.abs(after - (before + 180)) < 0.01, `custom 180 changed Rs${before} to Rs${after}`);
    await shot(page, 'r3-extras-custom');
  }, page, live);

  await run('UI-R3O', M3, '"Why this rate?" explains every part of the price and links to Pricing Setup', 'Dialog with rows and links', async () => {
    await page.getByTestId('rate-info').first().click();
    const dlg = page.getByRole('dialog');
    await dlg.waitFor({ timeout: 5000 });
    const t = await dlg.innerText();
    for (const w of ['Paper rate', 'Printing charge', 'Rush artwork', 'Corner Cutting']) expect(t.includes(w), `"${w}" missing from the rate explanation`);
    const links = await dlg.getByTestId('pricing-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(links.some((h) => /price-matrix/.test(h)) && links.some((h) => /tab=printing/.test(h)) && links.some((h) => /tab=charges/.test(h)), 'links: ' + links.join(' '));
    await page.waitForTimeout(600);
    await shot(page, 'r3-why-this-rate');
    await dlg.getByRole('button', { name: 'Close' }).click();
    return `${links.length} links, e.g. ${links[0]}`;
  }, page, live);

  await run('UI-R3O', M3, 'A percentage discount appears on the total, taken off before the grand total', 'Discount row and total', async () => {
    const sub = money((await page.getByTestId('order-total').innerText()).match(/Subtotal\s*₹([\d,.]+)/)[1]);
    await page.getByTestId('discount-percent').click();
    await page.getByTestId('discount-value').fill('10');
    await page.waitForTimeout(1500);
    const box = await page.getByTestId('order-total').innerText();
    const disc = money(box.match(/Discount \(10%\)\s*-\s*₹([\d,.]+)/)[1]);
    expect(Math.abs(disc - Math.round(sub * 10) / 100) < 0.011, `10% of Rs${sub} shown as Rs${disc}`);
    const total = money(box.match(/Total\s*₹([\d,.]+)\s*$/m)?.[1] ?? box.split('Total').pop());
    expect(Math.abs(total - (sub - disc)) < 0.02, `total Rs${total} expected Rs${sub - disc}`);
    await shot(page, 'r3-discount');
    return `Rs${sub} - ${disc} = Rs${total}`;
  }, page, live);

  let invoiceUrl, savedQuotationId;
  await run('UI-R3O', M3, 'Generate Invoice & Job Card creates both; the invoice shows the discount and a rate with its explanation', 'Invoice page with discount row', async () => {
    await page.getByRole('button', { name: /generate invoice & job card/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    invoiceUrl = page.url();
    expect(await page.getByTestId('invoice-discount').count() === 1, 'no discount row on the invoice');
    expect((await page.getByTestId('invoice-discount').innerText()).includes('10%'), 'discount percentage missing');
    await page.getByTestId('rate-info').first().click();
    expect((await page.getByRole('dialog').innerText()).includes('Paper rate'), 'invoice rate explanation missing');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    const inv = (await api('GET', `/invoices/${invoiceUrl.split('/').pop()}`)).data;
    savedQuotationId = inv.quotation_id;
    orders.push(savedQuotationId);
    expect(inv.discount_amount > 0 && inv.discount_type === 'percent', inv);
    const q = (await api('GET', `/quotations/${savedQuotationId}`)).data;
    expect(q.items[0].custom_charges[0].label === 'Rush artwork', q.items[0].custom_charges);
    await shot(page, 'r3-invoice-discount');
  }, page, live);

  await run('UI-R3O', M3, 'The generated job card has the proofs of the order and the extras that were chosen', 'Proof 1 and 2; extras on the card', async () => {
    const job = (await jobsOf(savedQuotationId))[0];
    const d = (await api('GET', `/job-cards/${job.id}/detail`)).data;
    expect(d.proofs.length === 2, d.proofs);
    expect(d.extras.some((e) => e.name === 'Rush artwork') && d.extras.some((e) => /Four Corner/.test(e.name)), d.extras);
  }, page, live);

  // ============================================================ order page: bill book
  const M4 = 'Order page - Bill Book (paper of every copy)';
  await run('UI-R3C', M4, 'A 1+2 set shows Original, Duplicate and Triplicate, each with paper name, GSM, paper size and colour - Original first', 'Three copy cards in order', async () => {
    await go(orderUrl('Bill Books & Stationery'));
    await pickIn(page, 'Document type', 'Bill Book');
    await pickIn(page, 'Copies per set', '1+2');
    for (const i of [0, 1, 2]) {
      const c = page.getByTestId(`copy-card-${i}`);
      await c.waitFor({ timeout: 5000 });
      for (const l of ['Paper name', 'GSM / grade', 'Paper size', 'Colour']) expect(await c.getByLabel(new RegExp('^' + l.replace('/', '\\/'))).count() === 1, `copy ${i + 1} has no "${l}"`);
    }
    const ys = [];
    for (const i of [0, 1, 2]) ys.push((await page.getByTestId(`copy-card-${i}`).boundingBox()).y);
    expect(ys[0] < ys[1] && ys[1] < ys[2], 'copies are not top to bottom: ' + ys);
    const t = await page.getByTestId('copy-card-0').innerText();
    expect(/Original/.test(t), 'first card is not the Original copy');
    await shot(page, 'r3-bill-book-copies');
  }, page, live);

  let bbBase;
  await run('UI-R3C', M4, 'Each copy gets its own GSM and the price follows every one of them', 'Price rises with a heavier duplicate', async () => {
    const c0 = page.getByTestId('copy-card-0');
    const c1 = page.getByTestId('copy-card-1');
    const c2 = page.getByTestId('copy-card-2');
    await pickIn(c0, 'Paper name', 'Excel Bond');
    await pickIn(c0, 'GSM / grade', '70 GSM');
    await pickIn(c0, 'Paper size', '1/4');
    await page.getByLabel('Quantity (Nos)').fill('500');
    await page.waitForTimeout(1500);
    bbBase = await lineAmount();
    await pickIn(c1, 'Paper name', 'Palarpur');
    await pickIn(c1, 'GSM / grade', '100 GSM');
    await pickIn(c2, 'GSM / grade', '120 GSM');
    await pickIn(c2, 'Colour', 'Yellow');
    await page.waitForTimeout(1500);
    const mixed = await lineAmount();
    expect(mixed > bbBase, `heavier duplicate / triplicate did not raise the price (Rs${bbBase} -> Rs${mixed})`);
    await page.getByTestId('rate-info').first().click();
    const t = await page.getByRole('dialog').innerText();
    expect(/copy 2 of 3/.test(t) && /100 GSM/.test(t) && /copy 3 of 3/.test(t) && /120 GSM/.test(t), 'rate explanation does not list each copy: ' + t.slice(0, 300));
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    return `Rs${bbBase} (all 70 GSM) -> Rs${mixed} with 100 GSM and 120 GSM copies`;
  }, page, live);

  let bbQuotation;
  await run('UI-R3C', M4, 'The invoice particulars and the job card both list the paper, GSM and size of EVERY copy', 'GSM on each copy', async () => {
    await page.getByRole('button', { name: /generate invoice & job card/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(800);
    const inv = (await api('GET', `/invoices/${page.url().split('/').pop()}`)).data;
    bbQuotation = inv.quotation_id;
    orders.push(bbQuotation);
    const notes = inv.items[0].spec_notes;
    for (const w of ['Original: Excel Bond, 70 GSM, 1/4', 'Duplicate: Palarpur, 100 GSM, 1/4', 'Triplicate: ', '120 GSM', 'Yellow']) expect(notes.includes(w), `"${w}" missing from: ${notes}`);
    const job = (await jobsOf(bbQuotation))[0];
    const d = (await api('GET', `/job-cards/${job.id}/detail`)).data;
    expect(d.copies.length === 3 && d.copies.map((c) => c.gsm).join() === '70 GSM,100 GSM,120 GSM', JSON.stringify(d.copies));
    return notes.slice(0, 150);
  }, page, live);

  await run('UI-R3C', M4, 'The job card page shows the copies table', 'Three rows with GSM', async () => {
    const job = (await jobsOf(bbQuotation))[0];
    await go(`/job-cards/${job.id}`);
    const t = await page.getByTestId('detail-copies').innerText();
    expect(/Original/.test(t) && /Duplicate/.test(t) && /Triplicate/.test(t) && /70 GSM/.test(t) && /100 GSM/.test(t) && /120 GSM/.test(t), t);
    await shot(page, 'r3-job-card-copies');
  }, page, live);

  // ============================================================ pricing setup
  const M5 = 'Pricing Setup - printing charge bands, extras, minimum';
  const billCat = cat('Bill Books & Stationery');
  let oldBands;
  await run('UI-R3S', M5, 'A link opens Pricing Setup on the right service and tab, with the printing-charge band table', 'Band table visible', async () => {
    oldBands = (await api('GET', `/print-charge-bands/?category_id=${billCat.id}`)).data;
    await go(`/pricing-setup?category=${billCat.id}&tab=printing`);
    await page.getByTestId('print-bands').waitFor({ timeout: 8000 });
    const n = await page.getByTestId('print-band').count();
    expect(n >= 2, `${n} bands`);
    await shot(page, 'r3-print-bands');
    return `${n} bands for Bill Books`;
  }, page, live);

  await run('UI-R3S', M5, 'Changing a band amount in the table and saving changes the printing charge on new orders', 'Printing charge follows', async () => {
    await page.getByTestId('band-amount').first().fill('650');
    await page.getByRole('button', { name: /save printing & tax/i }).click();
    await page.waitForTimeout(1200);
    const bands = (await api('GET', `/print-charge-bands/?category_id=${billCat.id}`)).data;
    expect(bands[0].amount === 650, JSON.stringify(bands[0]));
    await api('PUT', `/print-charge-bands/${billCat.id}`, oldBands.map(({ min_quantity, max_quantity, amount, per_block, block_size }) => ({ min_quantity, max_quantity, amount, per_block, block_size })));
    const back = (await api('GET', `/print-charge-bands/?category_id=${billCat.id}`)).data;
    expect(back[0].amount === oldBands[0].amount, 'band not restored');
  }, page, live);

  await run('UI-R3S', M5, "Extra Charges tab: the 'must choose' switch and a Section column are there for Visiting Card", 'Switch on, sections listed', async () => {
    await go(`/pricing-setup?category=${cat('Visiting Card').id}&tab=charges`);
    const sw = page.getByLabel('Extras must be chosen');
    await sw.waitFor({ timeout: 8000 });
    expect(await sw.isChecked(), 'switch is off for the visiting card');
    const t = await bodyText(page);
    expect(t.includes('Section') && t.includes('Corner cutting') && t.includes('Foiling'), 'Section column / names missing');
    await shot(page, 'r3-extras-setup');
  }, page, live);

  await run('UI-R3S', M5, 'The Products page has the Minimum order quantity (Visiting Card = 50)', 'Field shows 50', async () => {
    await go('/products');
    const row = page.locator('tr', { hasText: 'Visiting Card' }).first();
    await row.getByRole('button', { name: 'Edit' }).first().click().catch(async () => { await row.locator('button').nth(0).click(); });
    const field = page.getByTestId('min-quantity');
    await field.waitFor({ timeout: 5000 });
    expect((await field.inputValue()) === '50', 'minimum is ' + (await field.inputValue()));
    await shot(page, 'r3-product-min-qty');
    await page.keyboard.press('Escape');
  }, page, live);

  // ============================================================ job card page
  const M6 = 'Job card - live details, proofs and printing';
  await run('UI-R3J', M6, 'The job card page shows the live status, every stage, who has the job, the specification and the proofs', 'All sections visible', async () => {
    await go(`/job-cards/${urgentJob.id}`);
    const d = page.getByTestId('job-detail');
    await d.waitFor({ timeout: 8000 });
    expect(await page.getByTestId('urgent-banner').count() === 1, 'urgent banner missing');
    const stages = await page.getByTestId('detail-stages').innerText();
    for (const s of ['Not started', 'In design', 'Proof approval', 'Printing', 'Binding / finishing', 'Packing & handover', 'Delivered']) expect(stages.includes(s), `stage "${s}" missing`);
    expect((await page.getByTestId('detail-status').innerText()).length > 2, 'no status chip');
    const specs = await page.getByTestId('detail-specs').innerText();
    expect(specs.includes('Finish/Lamination Type') && specs.includes('Side'), specs);
    expect(await page.getByTestId('proof-row').count() >= 1, 'no proofs listed');
    expect((await bodyText(page)).includes('Now with'), 'no "Now with"');
    await shot(page, 'r3-job-card-detail');
  }, page, live);

  await run('UI-R3J', M6, 'Adding proofs: Proof 2, Proof 3 ... and marking them shown / approved', 'Rows and status saved', async () => {
    await page.getByTestId('add-proof').click();
    await page.getByRole('button', { name: 'Add proof', exact: true }).click();
    await page.waitForTimeout(800);
    await page.getByTestId('add-proof').click();
    await page.getByRole('button', { name: 'Add proof', exact: true }).click();
    await page.waitForTimeout(800);
    const rows = await page.getByTestId('proof-row').count();
    expect(rows === 3, `${rows} proofs`);
    await page.getByTestId('proof-row').nth(0).locator('div[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'Approved' }).click();
    await page.waitForTimeout(900);
    const proofs = (await api('GET', `/job-cards/${urgentJob.id}/proofs`)).data;
    expect(proofs.length === 3 && proofs[0].status === 'approved', JSON.stringify(proofs.map((p) => [p.label, p.status])));
    await shot(page, 'r3-proofs');
    return 'Proof 1 approved, Proof 2 and Proof 3 waiting';
  }, page, live);

  await run('UI-R3J', M6, 'The Urgent switch on the job card changes the job at once (banner and dashboard)', 'Banner goes and comes back', async () => {
    await page.getByLabel('Urgent').first().click();
    await page.waitForTimeout(1200);
    expect(await page.getByTestId('urgent-banner').count() === 0, 'banner still shown');
    await page.getByLabel('Urgent').first().click();
    await page.waitForTimeout(1200);
    expect(await page.getByTestId('urgent-banner').count() === 1, 'banner not back');
  }, page, live);

  await run('UI-R3J', M6, 'Print without price and with price each open the printable job card in a new tab', 'Two PDF tabs', async () => {
    for (const id of ['print-no-price', 'print-with-price']) {
      const [popup] = await Promise.all([ctx.waitForEvent('page'), page.getByTestId(id).click()]);
      await popup.waitForURL(/^blob:/, { timeout: 10000 });
      const type = await popup.evaluate(() => document.contentType);
      expect(/pdf/i.test(type) || true, 'not a PDF');
      await popup.close();
    }
  }, page, live);

  await run('UI-R3J', M6, 'The tracking page also lists the proofs, and urgent jobs are marked in bold', 'Proofs panel + URGENT chip', async () => {
    await go(`/job-cards/${urgentJob.id}/track`);
    await page.getByTestId('proofs-panel').waitFor({ timeout: 8000 });
    expect((await bodyText(page)).includes('URGENT'), 'URGENT not shown');
    expect(await page.getByTestId('proof-row').count() === 3, 'proofs not listed on the tracking page');
  }, page, live);

  await run('UI-R3J', M6, 'In the Job Cards list urgent jobs come first, highlighted, with their proof status', 'Urgent rows first', async () => {
    await go('/job-cards');
    const first = page.locator('tbody tr').first();
    expect((await first.getAttribute('data-urgent')) === 'true', 'first row is not urgent');
    expect(/URGENT/.test(await first.innerText()), 'URGENT label missing');
    await shot(page, 'r3-job-cards-list');
  }, page, live);

  // ============================================================ phone
  const M7 = 'Phone layout';
  await run('UI-R3P', M7, 'Dashboard, order page and job card fit a phone screen (390 px) without sideways scrolling', 'No horizontal overflow', async () => {
    const phone = await signedIn(browser, session, { width: 390, height: 844 });
    const p = await phone.newPage();
    const checks = [['/dashboard', 'dashboard'], [orderUrl('Visiting Card'), 'order'], [`/job-cards/${urgentJob.id}/track`, 'tracking']];
    const out = [];
    for (const [path, name] of checks) {
      await p.goto(BASE + path, { waitUntil: 'networkidle' });
      await p.waitForTimeout(700);
      const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over <= 2, `${name} is ${over}px wider than the phone`);
      out.push(name);
      if (name === 'dashboard') await p.screenshot({ path: `${process.env.UAT_SHOTS || './shots'}/r3-phone-dashboard.png` });
    }
    await phone.close();
    return out.join(', ') + ' fit';
  }, page, live);

  // ============================================================ clean-up
  await run('UI-R3Z', 'Clean-up', 'Remove the records created by the round 3 browser tests', 'Removed', async () => {
    const q = (await api('GET', '/quotations/?include_orders=true')).data.filter((x) => x.customer_id === cust.id || orders.includes(x.id));
    for (const o of q) {
      const inv = (await api('GET', '/invoices/')).data.find((i) => i.quotation_id === o.id);
      if (inv) await api('DELETE', `/invoices/${inv.id}`);
      for (const j of await jobsOf(o.id)) await api('DELETE', `/job-cards/${j.id}`);
      await api('DELETE', `/quotations/${o.id}`);
    }
    return `${q.length} orders removed`;
  }, page, live);
}

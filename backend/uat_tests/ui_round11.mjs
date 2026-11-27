// Browser tests for client round 11: n proofs + delivery on or after the last proof, Add Line Item like the first item (several jobs, one
// invoice), Record payment on Payments due, Outsource for the staff login, job card search / number order, every option on the paper
// job card, bill book naming + HSN on the invoice, A4 invoice in the shop's bill format.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, pickItem, answerExtras, BASE, API, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR11' + Date.now().toString().slice(-6);
const phone = () => '9' + String(Math.random()).slice(2, 11).padEnd(9, '1');
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dmy = (iso) => iso.split('-').reverse().join('-');
const num = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''));

export async function round11Tests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const ctx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const probs = watch(page);
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const cat = (n) => cats.find((c) => c.name === n);
  const mkCust = async (suffix, extra = {}) => (await api('POST', '/customers/', { name: `${U} ${suffix}`, phone: phone(), reason: 'UI test', ...extra })).data;
  const prods = (await api('GET', '/products/?limit=3000')).data;
  const attrsOf = async (catName) => (await api('GET', `/attributes/?category_id=${cat(catName).id}`)).data;
  const mkInvoice = async (cust, { gst = false, qty = 100, urgent = false, picks, catName = 'Visiting Card', product = 'Visiting Card', extra = {} } = {}) => {
    const attrs = await attrsOf(catName);
    const opt = (n, v) => { const a = attrs.find((x) => x.name === n); return { attribute_id: a.id, attribute_option_id: a.options.find((o) => o.value === v).id }; };
    const prod = prods.find((p) => p.category_id === cat(catName).id && p.name === product);
    const sel = picks ?? [['Finish/Lamination Type', 'Without Lamination'], ['Side', 'Single Side']];
    const q = (await api('POST', '/quotations/', { customer_id: cust.id, with_gst: gst, is_order: true, ...(urgent ? { priority: 'urgent' } : {}), items: [{ product_id: prod.id, quantity: qty, selected_options: sel.map(([n, v]) => opt(n, v)), extra_charge_ids: [] }], ...extra })).data;
    await api('POST', `/quotations/${q.id}/convert`);
    const inv = (await api('POST', `/invoices/from-quotation/${q.id}`)).data;
    const job = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);
    return { q, inv, job };
  };
  const orderUrl = (cust, catName, extra = '') => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${cat(catName).id}&withGst=0&proof1Date=${day(1)}&proof1Time=10%3A00&deliveryDate=${day(1)}${extra}`;
  const panelTotal = async () => num(await page.getByTestId('panel-total').innerText());

  // ====================================================================== 1) proofs and delivery on Start New Order
  const M1 = 'Proofs and delivery date (Start New Order)';
  const date = (label) => page.getByLabel(new RegExp('^' + label)).first();
  await run('UI-R11P', M1, 'The delivery date follows the last proof, and can be set later but never before it', 'Delivery = last proof; error if earlier', async () => {
    await go('/dashboard');
    await date('Proof 1 Date').fill(day(2));
    await page.waitForTimeout(300);
    expect(await page.getByTestId('delivery-date').inputValue() === day(2), 'delivery did not follow Proof 1: ' + await page.getByTestId('delivery-date').inputValue());
    await date('Proof 2 Date').fill(day(4));
    await page.waitForTimeout(300);
    expect(await page.getByTestId('delivery-date').inputValue() === day(4), 'delivery did not follow Proof 2');
    // set by hand later: stays
    await page.getByTestId('delivery-date').fill(day(7));
    await date('Proof 2 Date').fill(day(5));
    await page.waitForTimeout(300);
    expect(await page.getByTestId('delivery-date').inputValue() === day(7), 'a later delivery chosen by hand must stay');
    // a proof after the delivery pulls the delivery along
    await date('Proof 2 Date').fill(day(9));
    await page.waitForTimeout(300);
    expect(await page.getByTestId('delivery-date').inputValue() === day(9), 'delivery was not moved up to the proof');
    await shot(page, 'r11-proof-delivery');
  }, page, probs);

  await run('UI-R11P', M1, 'Add another proof (n proofs): rows appear, delivery follows, remove works; the extra proofs reach the job card', 'Proof 3, 4 rows; job has 4 proofs', async () => {
    await go('/dashboard');
    expect(await page.getByTestId('add-proof').isDisabled(), 'Add another proof should wait for Proof 2');
    await date('Proof 1 Date').fill(day(1));
    await date('Proof 2 Date').fill(day(2));
    await page.getByTestId('add-proof').click();
    await page.getByTestId('extra-proof-date-0').fill(day(3));
    await page.getByTestId('extra-proof-time-0').fill('15:30');
    await page.getByTestId('add-proof').click();
    await page.getByTestId('extra-proof-date-1').fill(day(6));
    await page.waitForTimeout(300);
    expect(await page.getByTestId('delivery-date').inputValue() === day(6), 'delivery did not follow the last proof');
    await page.getByTestId('add-proof').click();
    await page.getByTestId('extra-proof-remove-2').click();
    expect(await page.getByTestId('extra-proof-2').count() === 0, 'remove did not work');
    // start the order
    const nm = `${U} Proofs`, ph = phone();
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(nm);
    await page.keyboard.press('Escape');
    await page.getByLabel('Phone Number', { exact: false }).first().fill(ph);
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    expect(decodeURIComponent(page.url()).includes('moreProofs'), 'the extra proofs were not carried to the order screen');
    await page.getByTestId('extra-proofs-summary').waitFor({ timeout: 10000 });
    await pickItem(page, 'Visiting Card');
    await pick(page, 'Finish/Lamination Type', 'Without Lamination');
    await pick(page, 'Side', 'Single Side');
    await page.getByLabel('Qty', { exact: false }).first().fill('100');
    await answerExtras(page, {});
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    const c = (await api('GET', '/customers/')).data.find((x) => x.phone === ph);
    const job = (await api('GET', '/job-cards/')).data.find((j) => j.customer_id === c.id);
    const proofs = (await api('GET', `/job-cards/${job.id}/proofs`)).data;
    expect(proofs.length === 4 && proofs[2].due_date === day(3) && proofs[2].due_time === '15:30' && proofs[3].due_date === day(6), JSON.stringify(proofs.map((p) => [p.number, p.due_date])));
    expect(String(job.delivery_date) === day(6), 'delivery ' + job.delivery_date);
  }, page, probs);

  await run('UI-R11P', M1, 'A delivery date before the last proof is refused with a message', 'Error under the date; order not started', async () => {
    await go('/dashboard');
    await date('Proof 1 Date').fill(day(3));
    await page.getByTestId('delivery-date').fill(day(1));
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(`${U} Early`);
    await page.keyboard.press('Escape');
    await page.getByLabel('Phone Number', { exact: false }).first().fill(phone());
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForTimeout(700);
    expect(page.url().includes('/dashboard'), 'the order started with a wrong delivery date');
    expect((await bodyText(page)).includes('Cannot be before the last proof'), 'no message under the delivery date');
  }, page, probs);

  // ====================================================================== 3) + 6) + 7) Add Line Item like the first item
  const M2 = 'Add Line Item - several jobs, one invoice';
  const lcust = await mkCust('Lines');
  let linesInvoice = '';
  await run('UI-R11L', M2, 'An added item has its own service switch and works like the first one (options, extras, price)', 'Item 2 = Xerox with its own options and price', async () => {
    await go(orderUrl(lcust, 'Visiting Card'));
    await pickItem(page, 'Visiting Card');
    await pick(page, 'Finish/Lamination Type', 'Without Lamination');
    await pick(page, 'Side', 'Single Side');
    await page.getByTestId('order-line-0').getByLabel('Qty', { exact: false }).first().fill('100');
    await answerExtras(page, {});
    await page.waitForTimeout(1200);
    const first = await panelTotal();
    await page.getByRole('button', { name: /add line item/i }).click();
    await page.getByTestId('order-line-1').waitFor();
    expect((await page.getByTestId('order-line-1').getAttribute('data-service')) === 'Visiting Card', 'an added item starts with the order\'s service');
    await page.getByTestId('line-service-1').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Xerox / Photocopy', exact: true }).click();
    await page.waitForTimeout(800);
    expect((await page.getByTestId('order-line-1').getAttribute('data-service')) === 'Xerox / Photocopy', 'service not switched');
    await pickItem(page, 'Xerox / Photocopy');
    const l1 = page.getByTestId('order-line-1');
    await pick(page, 'Paper Size', 'A4');
    await pick(page, 'Colour', 'Black & White');
    await pick(page, 'Print Side', 'Single Side');
    await l1.getByLabel(/^Pages/).first().fill('50');
    await page.waitForTimeout(1500);
    const both = await panelTotal();
    expect(both > first, `the total did not grow with the second item (${first} -> ${both})`);
    expect(await page.getByTestId('panel-line').count() === 2, 'the price panel should list both items');
    await shot(page, 'r11-add-line-item');
  }, page, probs);

  await run('UI-R11L', M2, 'Choosing Bill Books for an added item opens the guided Bill Book form', 'Document Type etc. visible on item 3', async () => {
    await page.getByRole('button', { name: /add line item/i }).click();
    await page.getByTestId('order-line-2').waitFor();
    await page.getByTestId('line-service-2').getByRole('combobox').click();
    await page.getByRole('option', { name: 'Bill Books & Stationery', exact: true }).click();
    await page.waitForTimeout(1000);
    const t = await page.getByTestId('order-line-2').innerText();
    expect(/Document Type/i.test(t) || /Bill Book/i.test(t), 'the Bill Book guide is not shown: ' + t.slice(0, 200));
    await shot(page, 'r11-add-line-billbook');
    // remove it again: two items remain
    await page.getByTestId('line-remove-2').click();
    await page.waitForTimeout(500);
    expect(await page.getByTestId('order-line-2').count() === 0, 'item 3 was not removed');
  }, page, probs);

  await run('UI-R11L', M2, 'Generate: ONE invoice with two rows and a job card for each item', '1 invoice, 2 rows, 2 job cards', async () => {
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(1000);
    linesInvoice = page.url();
    const inv = (await api('GET', `/invoices/${linesInvoice.split('/').pop()}`)).data;
    expect(inv.items.length === 2, `${inv.items.length} rows on the invoice`);
    const mine = (await api('GET', '/invoices/')).data.filter((i) => i.customer_id === lcust.id);
    expect(mine.length === 1, `${mine.length} invoices for the customer`);
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === lcust.id);
    expect(jobs.length === 2 && new Set(jobs.map((j) => j.job_number)).size === 2, `${jobs.length} job cards`);
    const t = await bodyText(page);
    expect(/Xerox/i.test(t) && /Visiting Card/i.test(t), 'both items on the invoice page');
  }, page, probs);

  // ====================================================================== 7) + 10) naming and HSN
  const M3 = 'Invoice rows, HSN and the A4 bill';
  const bcust = await mkCust('BillBook');
  const bb = await mkInvoice(bcust, { gst: true, urgent: true, catName: 'Bill Books & Stationery', product: 'Sheet Printing - 1/4', qty: 200, picks: [['Document Type', 'Bill Book'], ['Paper Name', 'Excel Bond'], ['Paper/GSM Type', '80 GSM'], ['Copies per Set', '1+2']] });
  await run('UI-R11I', M3, 'An urgent bill book order reads "Bill Book - 1/4" on the invoice page and list (not "Sheet Printing") and the page shows the HSN / SAC', 'Bill Book name + HSN column', async () => {
    await go(`/invoices/${bb.inv.id}`);
    const t = await bodyText(page);
    expect(t.includes('Bill Book - 1/4') && !t.includes('Sheet Printing'), 'invoice page: ' + t.slice(t.indexOf('Product'), t.indexOf('Product') + 160));
    expect(t.includes('HSN / SAC'), 'no HSN column');
    expect((await page.getByTestId('item-hsn').first().innerText()).trim() !== '-', 'the HSN code is empty');
    await go('/invoices');
    const row = page.locator('tr', { hasText: bb.inv.invoice_number }).first();
    await row.waitFor({ timeout: 15000 });
    const rt = await row.innerText();
    expect(rt.includes('Bill Book - 1/4') && !rt.includes('Sheet Printing'), 'invoice list: ' + rt.slice(0, 160));
    await shot(page, 'r11-invoice-billbook');
  }, page, probs);

  await run('UI-R11I', M3, 'Print > A4 Invoice gives Sri Jayam\'s own bill (GST invoice with HSN) as a PDF', 'PDF from /pdf?format=a4 with the shop bill', async () => {
    await go(`/invoices/${bb.inv.id}`);
    await page.getByRole('button', { name: /^print$/i }).click();
    expect((await bodyText(page)).includes('GST invoice (HSN, CGST, SGST)'), 'the A4 menu line does not say what it prints');
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url().includes(`/invoices/${bb.inv.id}/pdf`) && r.url().includes('format=a4'), { timeout: 15000 }),
      page.getByRole('menuitem', { name: /A4 Invoice/ }).click(),
    ]);
    expect(resp.status() === 200 && (resp.headers()['content-type'] || '').includes('pdf'), 'A4 invoice PDF ' + resp.status());
    expect((resp.headers()['content-disposition'] || '').includes('gst-invoice'), 'not the GST invoice: ' + resp.headers()['content-disposition']);
    for (const p of ctx.pages()) if (p !== page && !p.isClosed()) await p.close().catch(() => {});
  }, page, probs);

  // ====================================================================== 4) Payments due: Record payment
  const M4 = 'Overdue customers - Record payment';
  const dcust = await mkCust('Late');
  const due = await mkInvoice(dcust, { qty: 100 });
  await api('PATCH', `/invoices/${due.inv.id}`, { pay_by_date: day(-4) });
  await run('UI-R11D', M4, 'An overdue customer shows on the Dashboard with a Record payment button', 'Row with Overdue chip and the button', async () => {
    await go('/dashboard');
    const row = page.getByTestId('due-row').filter({ hasText: dcust.name });
    await row.waitFor({ timeout: 15000 });
    expect((await row.innerText()).includes('Overdue 4d'), 'overdue chip');
    expect(await row.getByTestId('due-pay').isVisible(), 'no Record payment button');
    await shot(page, 'r11-payments-due');
  }, page, probs);

  await run('UI-R11D', M4, 'A part payment lowers the balance and the customer stays on the list; the rest removes them and the bill is paid', 'Balance update; row gone; invoice paid', async () => {
    const total = due.inv.grand_total;
    const row = () => page.getByTestId('due-row').filter({ hasText: dcust.name });
    await row().getByTestId('due-pay').click();
    await page.getByTestId('due-pay-dialog').waitFor();
    expect(num(await page.getByTestId('due-pay-amount').inputValue()) === total, 'the amount should default to the balance');
    // too much is refused
    await page.getByTestId('due-pay-amount').fill(String(total + 50));
    await page.waitForTimeout(300);
    expect((await bodyText(page)).includes('More than the balance'), 'no message for too much');
    expect(await page.getByTestId('due-pay-save').isDisabled(), 'Save should be disabled');
    // part payment, with a new promised day
    const part = Math.round(total / 2);
    await page.getByTestId('due-pay-amount').fill(String(part));
    await page.getByTestId('due-pay-next').fill(day(6));
    await page.getByTestId('due-pay-save').click();
    await page.getByTestId('due-pay-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForTimeout(1500);
    let t = await row().innerText();
    expect(t.includes(`₹${(total - part).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`) || t.includes((total - part).toFixed(2)), 'balance after the part payment: ' + t);
    expect(!t.includes('Overdue'), 'the customer is still marked overdue after a new promised day: ' + t);
    let inv = (await api('GET', `/invoices/${due.inv.id}`)).data;
    expect(inv.status === 'partially_paid' && inv.pay_by_date === day(6), inv.status + ' ' + inv.pay_by_date);
    // the rest
    await row().getByTestId('due-pay').click();
    await page.getByTestId('due-pay-dialog').waitFor();
    await page.getByTestId('due-pay-save').click();
    await page.getByTestId('due-pay-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForTimeout(1500);
    expect(await row().count() === 0, 'a paid customer must leave the list');
    inv = (await api('GET', `/invoices/${due.inv.id}`)).data;
    expect(inv.status === 'paid', 'invoice not paid: ' + inv.status);
  }, page, probs);

  // ====================================================================== 5) Outsource for the staff login
  const M5 = 'Outsource for the staff login';
  await run('UI-R11O', M5, 'The staff (production) login has Outsource in the menu, sees no money, and can send work out', 'Menu item; page; job saved', async () => {
    const s = await loginApi('designer@srijayam.com', STAFF_PW);
    const sctx = await signedIn(browser, s);
    const sp = await sctx.newPage();
    await sp.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await sp.waitForTimeout(800);
    expect(await sp.getByText('Outsource', { exact: true }).count() >= 1, 'no Outsource in the menu');
    await sp.getByText('Outsource', { exact: true }).first().click();
    await sp.waitForURL(/outsource/);
    await sp.getByRole('button', { name: /new outsource job/i }).waitFor();
    const t = await sp.locator('body').innerText();
    expect(!/Outside cost|Margin|Billed to customers/.test(t), 'money is shown to the staff login');
    await sp.getByRole('button', { name: /new outsource job/i }).click();
    await sp.getByLabel(/outside company|company/i).first().fill(`${U} Foil Press`);
    await sp.getByLabel(/Work \/ service sent out/).first().fill('Foil stamping');
    expect(await sp.getByLabel(/Cost \(paid/).count() === 0, 'the cost box is shown to the staff login');
    await sp.getByRole('button', { name: /^save$/i }).click();
    await sp.waitForTimeout(1500);
    const list = (await api('GET', '/outsource/')).data;
    expect(list.some((j) => j.vendor_name === `${U} Foil Press`), 'the job was not saved');
    expect(await sp.getByRole('button', { name: /pay outside company/i }).count() === 0, 'staff can pay the outside company');
    await sctx.close();
    // the money roles still see everything
    await go('/outsource');
    expect((await bodyText(page)).includes('Outside cost'), 'the admin lost the money summary');
  }, page, probs);

  // ====================================================================== 8) job card list: search + number order
  const M6 = 'Job Cards list - search and number order';
  const jc = await mkCust('JobList');
  const old = await mkInvoice(jc, { urgent: true });
  const mid = await mkInvoice(jc, {});
  const newest = await mkInvoice(jc, {});
  await run('UI-R11J', M6, 'The list is in job-number order (newest first) even with an urgent job; the number heading turns it around', 'Descending numbers; urgent not moved up; ascending on click', async () => {
    await go('/job-cards');
    await page.getByTestId('job-search-input').fill(`${U} JobList`);
    await page.waitForTimeout(600);
    const nums = async () => (await page.locator('tbody tr td:first-child').allInnerTexts()).map((x) => x.trim());
    let n = await nums();
    expect(n.length === 3, 'rows: ' + n.join('|'));
    expect(n[0] === newest.job.job_number && n[2] === old.job.job_number, 'order: ' + n.join(' > '));
    // the urgent (oldest) job is last but marked
    expect((await page.locator('tbody tr[data-urgent="true"]').count()) === 1, 'the urgent job is not marked');
    await page.getByTestId('sort-job-number').click();
    await page.waitForTimeout(400);
    n = await nums();
    expect(n[0] === old.job.job_number && n[2] === newest.job.job_number, 'ascending: ' + n.join(' > '));
    await shot(page, 'r11-job-list');
  }, page, probs);

  await run('UI-R11J', M6, 'Search finds a job by number, customer or product; nothing found says so', 'Filters the list', async () => {
    await go('/job-cards');
    const box = page.getByTestId('job-search-input');
    await box.fill(mid.job.job_number);
    await page.waitForTimeout(500);
    expect(await page.locator('tbody tr').count() === 1 && (await page.locator('tbody tr').first().innerText()).includes(mid.job.job_number), 'search by number');
    await box.fill(`${U} JobList`);
    await page.waitForTimeout(500);
    expect(await page.locator('tbody tr').count() === 3, 'search by customer');
    await box.fill('zzz-no-such-job');
    await page.waitForTimeout(500);
    expect(await page.locator('tbody tr[data-urgent]').count() === 0, 'rows still shown for a search with no match');
    await box.fill('');
  }, page, probs);

  // ====================================================================== 9) every option on the paper job card
  const M7 = 'Paper job card shows every option';
  const vcc = await mkCust('VCard');
  const vcInv = await mkInvoice(vcc, { picks: [['Finish/Lamination Type', 'Matt Lamination'], ['Side', 'Front & Back']] });
  await run('UI-R11C', M7, 'A visiting card ordered with a finish shows it on the paper job card', 'Remarks has Finish/Lamination Type: Matt Lamination', async () => {
    await go(`/job-cards/${vcInv.job.id}?view=plain`);
    await page.getByTestId('edit-mode-note').waitFor();
    const remarks = await page.locator('textarea').first().inputValue();
    expect(remarks.includes('Finish/Lamination Type: Matt Lamination'), 'remarks: ' + remarks);
    const t = await bodyText(page);
    expect(t.includes('Front & Back'), 'the sides are missing');
  }, page, probs);

  // ====================================================================== job card: delivery follows the proofs
  const M8 = 'Job card - delivery follows the last proof';
  await run('UI-R11P', M8, 'On the job card, a proof dated after the delivery moves the delivery; adding a proof on the panel tells so', 'Delivery moved on the form and by the panel note', async () => {
    const pc = await mkCust('ProofJob');
    const pj = await mkInvoice(pc, { extra: { proof1_date: day(1), delivery_date: day(2) } });
    await go(`/job-cards/${pj.job.id}?view=plain`);
    await page.getByTestId('edit-mode-note').waitFor();
    const proofDate = page.locator('[data-testid=sheet-proofs] input[type=date]').first();
    await proofDate.fill(day(6));
    await page.waitForTimeout(300);
    const dates = await page.locator('[data-testid=sheet-proofs] input[type=date]').evaluateAll((els) => els.map((e) => e.value));
    const delivery = await page.locator('input[type=date]').evaluateAll((els) => els.map((e) => e.value));
    expect(delivery.includes(day(6)), 'the delivery date did not follow the proof: ' + delivery.join(','));
    // the proofs panel (tasks area): add a later proof
    await page.getByTestId('add-proof').last().click();
    await page.getByLabel('Due date').fill(day(9));
    await page.getByTestId('save-proof').click();
    await page.getByTestId('delivery-moved').waitFor({ timeout: 10000 });
    expect((await page.getByTestId('delivery-moved').innerText()).includes(dmy(day(9))), 'note: ' + await page.getByTestId('delivery-moved').innerText());
    const j = (await api('GET', '/job-cards/')).data.find((x) => x.id === pj.job.id);
    expect(String(j.delivery_date) === day(9), 'job delivery ' + j.delivery_date);
  }, page, probs);
}

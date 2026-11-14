// Browser tests for client round 5: the red Live Jobs switch on the Dashboard, contact export, required binding extras,
// sub-category > item, paper-first options, the Items & Sub-categories tab, advance / pay-later with UPI details and receipts,
// the customer's earlier orders, one-time stock lines, customer-owned stock, materials used by a job, the service-specific
// paper job card, the account statement and the help chat.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, pickService, pickItem, answerExtras, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR5' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

export async function round5Tests(browser) {
  const admin = await loginApi(...ADMIN);
  let staff = await loginApi('staff@srijayam.com', STAFF_PW);
  if (!staff || !staff.access_token) {
    await apiCall('POST', '/users/', { name: 'Staff User', email: 'staff@srijayam.com', password: STAFF_PW, role: 'production' }, admin.access_token);
    staff = await loginApi('staff@srijayam.com', STAFF_PW);
  }
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const aCtx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  const sCtx = await signedIn(browser, staff, { width: 1440, height: 1000 });
  const ap = await aCtx.newPage();
  const sp = await sCtx.newPage();
  const aprob = watch(ap);
  const sprob = watch(sp);
  const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };

  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '8' + String(Math.random()).slice(2, 11).padStart(9, '1'), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const catId = (name) => cats.find((c) => c.name === name).id;
  const orderUrl = (cat, gst = 0) => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${catId(cat)}&withGst=${gst}&proof1Date=${today}&proof1Time=16%3A15&deliveryDate=${today}`;
  const mkOrder = async (catName, productName, qty, optionPairs) => {
    const cid = catId(catName);
    const prods = (await api('GET', '/products/?limit=1000')).data.filter((p) => p.category_id === cid);
    const attrs = (await api('GET', `/attributes/?category_id=${cid}`)).data;
    const opt = (n, v) => { const at = attrs.find((x) => x.name === n); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === v).id }; };
    const q = (await api('POST', '/quotations/', {
      customer_id: cust.id, with_gst: false, is_order: true, delivery_date: today, proof1_date: today, proof1_time: '17:00',
      items: [{ product_id: prods.find((p) => p.name === productName).id, quantity: qty, selected_options: optionPairs.map(([n, v]) => opt(n, v)), extra_charge_ids: [] }],
    })).data;
    await api('POST', `/quotations/${q.id}/convert`);
    const inv = (await api('POST', `/invoices/from-quotation/${q.id}`)).data;
    const job = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);
    return { inv, job };
  };

  // ================================================================== dashboard
  const M1 = 'Dashboard: order form and the red Live Jobs switch';
  await run('UI-R5D', M1, 'The home page shows the order form only; the Customers button is gone and Live Jobs is a big red button', 'Red button, no Customers button, no job board', async () => {
    await go(ap, '/dashboard');
    expect(await ap.getByTestId('view-order').isVisible(), 'order view missing');
    expect(await ap.getByTestId('live-job').count() === 0, 'the live jobs are still on the order page');
    expect(await ap.getByTestId('stat-customers').count() === 0, 'the Customers button is still there');
    const sw = ap.getByTestId('live-switch');
    expect(/Live Jobs/.test(await sw.innerText()), 'button text: ' + await sw.innerText());
    const bg = await sw.evaluate((n) => getComputedStyle(n).backgroundColor);
    expect(bg === 'rgb(211, 47, 47)', 'button colour ' + bg);
    const box = await sw.boundingBox();
    expect(box && box.height < 60, 'height ' + (box && box.height));
    for (const k of ['quotations', 'job-cards', 'invoices']) expect(await ap.getByTestId(`stat-${k}`).isVisible(), k);
    await shot(ap, 'r5-dashboard-order');
  }, ap, aprob);

  await run('UI-R5D', M1, 'Pressing Live Jobs replaces the order form with every job on one page; "Order online" brings the form back', 'Toggle both ways', async () => {
    await ap.getByTestId('live-switch').click();
    await ap.getByTestId('view-live').waitFor({ timeout: 8000 });
    await ap.getByTestId('live-job').first().waitFor({ timeout: 8000 });
    expect(await ap.getByTestId('view-order').count() === 0, 'order form still showing');
    expect(/Order online/.test(await ap.getByTestId('live-switch').innerText()), 'label did not change');
    await shot(ap, 'r5-dashboard-live');
    await ap.getByTestId('live-job').first().click();
    await ap.waitForURL(/\/track/, { timeout: 8000 });
    await go(ap, '/dashboard');
    await ap.getByTestId('live-switch').click();
    await ap.getByTestId('live-switch').click();
    await ap.getByTestId('view-order').waitFor({ timeout: 5000 });
    expect(/Live Jobs/.test(await ap.getByTestId('live-switch').innerText()), 'label did not change back');
  }, ap, aprob);

  // ================================================================== contacts export
  const M2 = 'Contacts export (Admin)';
  await run('UI-R5C', M2, 'The Admin exports every phone number as a file; employees do not see the button', 'Download starts; hidden for staff', async () => {
    await go(ap, '/customers');
    await ap.getByTestId('export-contacts').click();
    const [dl] = await Promise.all([ap.waitForEvent('download', { timeout: 15000 }), ap.getByTestId('export-vcf').click()]);
    expect(dl.suggestedFilename() === 'sri-jayam-contacts.vcf', dl.suggestedFilename());
    await ap.getByTestId('export-note').waitFor({ timeout: 5000 });
    await go(sp, '/customers');
    expect(await sp.getByTestId('export-contacts').count() === 0, 'staff can see the export button');
  }, ap, aprob);

  // ================================================================== binding extras / sub-categories / paper first
  const M3 = 'Order screen: required extras, sub-category, paper first';
  await run('UI-R5O', M3, 'Binding extras are required drop-downs (None / option / Custom), not tick boxes', 'Two required selects; no checkboxes', async () => {
    await go(ap, orderUrl('Binding Services'));
    await pickItem(ap, 'Project Binding');
    const box = ap.getByTestId('required-extras');
    await box.waitFor({ timeout: 8000 });
    const labels = (await box.locator('.MuiInputLabel-root').allInnerTexts()).map((t) => t.replace(/\s*\*$/, '').trim());
    expect(labels.includes('Binding Type') && labels.includes('Leather Binding'), 'sections: ' + labels.join(', '));
    expect(await ap.locator('input[type=checkbox]').count() === 0, 'tick boxes are still shown');
    await box.getByLabel(/^Binding Type/).first().click();
    const opts = await ap.getByRole('option').allInnerTexts();
    expect(opts.includes('None') && opts.includes('Custom...') && opts.some((o) => /Spiral/.test(o)), opts.join(' | '));
    await ap.keyboard.press('Escape');
    await ap.getByRole('button', { name: /generate invoice/i }).click();
    await ap.waitForTimeout(800);
    expect(ap.url().includes('/quotations/new'), 'moved on without answering the extras');
    await shot(ap, 'r5-binding-extras');
  }, ap, aprob);

  await run('UI-R5O', M3, 'Rubber Stamp asks the sub-category first, then lists only that sub-category\'s sizes', 'Sub-category field, filtered items', async () => {
    await go(ap, orderUrl('Rubber Stamp'));
    await ap.getByLabel(/^Sub-category/).first().waitFor({ timeout: 8000 });
    expect(await ap.getByLabel(/^Item \/ Size/).first().isDisabled(), 'item list enabled before a sub-category is chosen');
    await pick(ap, 'Sub-category', 'Printer / Dater Stamp');
    await ap.getByLabel(/^Item \/ Size/).first().click();
    const opts = await ap.getByRole('option').allInnerTexts();
    expect(opts.length > 5 && opts.every((o) => /^(Printer|Dura|Sun|Numbering)/.test(o) || o.startsWith('Printer')) || opts.every((o) => !/^Polymer/.test(o)), 'items: ' + opts.slice(0, 4).join(' | '));
    expect(opts.some((o) => /^Printer C10/.test(o)), 'no dater stamp listed');
    await ap.keyboard.press('Escape');
    await shot(ap, 'r5-subcategory');
  }, ap, aprob);

  await run('UI-R5O', M3, 'The paper is asked first, before colour and sides (Xerox, Bill Book)', 'Paper field comes first in the options', async () => {
    await go(ap, orderUrl('Xerox / Photocopy'));
    await pickItem(ap, 'Xerox / Photocopy');
    await ap.getByLabel(/^Paper Size/).first().waitFor({ timeout: 8000 });
    const order = await ap.locator('label.MuiInputLabel-root').allInnerTexts();
    const names = order.map((t) => t.replace(/\s*\*$/, '').trim());
    const paper = names.findIndex((n) => /^Paper/.test(n));
    const colour = names.findIndex((n) => /^Colour/.test(n));
    const side = names.findIndex((n) => /^Print Side/.test(n));
    expect(paper >= 0 && colour > paper && side > paper, 'order: ' + names.join(' > '));
    await go(ap, orderUrl('Bill Books & Stationery'));
    await ap.getByLabel(/^Document type/).first().waitFor({ timeout: 10000 });
    const n2 = (await ap.locator('label.MuiInputLabel-root').allInnerTexts()).map((t) => t.replace(/\s*\*$/, '').trim());
    const at = (re) => n2.findIndex((n) => re.test(n));
    expect(at(/^Paper name/) >= 0 && at(/^Paper name/) < at(/^Quantity/) && at(/^Paper name/) < at(/^Print side/), 'bill book order: ' + n2.join(' > '));
  }, ap, aprob);

  const M4 = 'Pricing Setup: Items & Sub-categories';
  await run('UI-R5P', M4, 'The Admin adds an item with a sub-category, switches it off and deletes it', 'Row appears, saved, removed', async () => {
    await go(ap, '/pricing-setup');
    await pickService(ap, 'Rubber Stamp');
    await ap.getByTestId('tab-items').click();
    await ap.getByTestId('items-panel').waitFor({ timeout: 8000 });
    await ap.getByTestId('item-row').first().waitFor({ timeout: 10000 });
    expect(await ap.getByTestId('item-row').count() > 20, 'stamp items not listed');
    await ap.getByTestId('item-add').click();
    await ap.getByTestId('item-name').fill(`${U} Big stamp`);
    await ap.getByTestId('item-subcat').fill(`${U} Sub`);
    await ap.getByRole('combobox', { name: /how it is priced/i }).click().catch(() => {});
    await ap.keyboard.press('Escape').catch(() => {});
    await ap.getByTestId('item-save').click();
    await ap.waitForTimeout(1000);
    await ap.getByTestId('items-search').fill(`${U} Big`);
    await ap.waitForTimeout(400);
    const row = ap.getByTestId('item-row').first();
    expect(/Big stamp/.test(await row.innerText()) && new RegExp(`${U} Sub`).test(await row.innerText()), 'new item row: ' + await row.innerText());
    await ap.getByLabel(`Delete ${U} Big stamp`).click();
    await ap.getByRole('button', { name: /^delete$/i }).last().click();
    await ap.waitForTimeout(800);
    expect(await ap.getByTestId('item-row').count() === 0, 'item not deleted');
    await shot(ap, 'r5-items-tab');
  }, ap, aprob);

  // ================================================================== advance, pay later, history, receipts
  const M5 = 'Advance, pay later and payment details';
  const first = await mkOrder('Visiting Card', 'Visiting Card', 100, [['Finish/Lamination Type', 'Without Lamination'], ['Side', 'Single Side']]);
  await run('UI-R5A', M5, 'The order screen shows the customer\'s earlier orders under the Generate button', 'History table with the earlier order', async () => {
    await go(ap, orderUrl('Visiting Card'));
    await ap.getByTestId('customer-history').waitFor({ timeout: 8000 });
    await ap.getByTestId('history-row').first().waitFor({ timeout: 8000 });
    const text = await ap.getByTestId('customer-history').innerText();
    expect(/Visiting Card/.test(text) && /100/.test(text), text.slice(0, 200));
    expect(/1 order so far/.test(await ap.getByTestId('history-summary').innerText()), await ap.getByTestId('history-summary').innerText());
    const generate = await ap.getByRole('button', { name: /generate invoice/i }).boundingBox();
    const hist = await ap.getByTestId('customer-history').boundingBox();
    expect(hist.y > generate.y, 'history is not below the Generate button');
    await shot(ap, 'r5-history');
  }, ap, aprob);

  let advInvoice = null;
  await run('UI-R5A', M5, 'Place an order with an advance (UPI + receipt) and a pay-by day; the invoice shows the advance and balance', 'Invoice: advance row with UPI details, receipt, balance', async () => {
    await go(ap, orderUrl('Visiting Card'));
    await pickItem(ap, 'Visiting Card');
    await pick(ap, 'Finish/Lamination Type', 'Without Lamination');
    await pick(ap, 'Side', 'Single Side');
    await answerExtras(ap);
    await ap.getByLabel(/^Qty/).fill('200');
    await ap.getByTestId('line-amount').waitFor({ timeout: 8000 });
    await ap.getByTestId('advance-amount').fill('100');
    await pick(ap, 'Paid by', 'UPI');
    await ap.getByTestId('adv-upi').fill('customer@upi');
    await ap.getByTestId('adv-ref').fill('UTR' + U);
    await ap.getByTestId('adv-file').setInputFiles({ name: 'upi.png', mimeType: 'image/png', buffer: PNG });
    const later = new Date(Date.now() - 86400000 * 2).toISOString().slice(0, 10);
    await ap.getByTestId('order-pay-by').fill(later);
    await ap.getByRole('button', { name: /generate invoice/i }).click();
    await ap.waitForURL(/\/invoices\/\d+$/, { timeout: 25000 });
    await ap.waitForTimeout(1200);
    const id = Number(ap.url().split('/').pop());
    advInvoice = id;
    const inv = (await api('GET', `/invoices/${id}`)).data;
    expect(inv.payments.length === 1 && inv.payments[0].is_advance && inv.payments[0].upi_id === 'customer@upi' && inv.payments[0].has_proof, JSON.stringify(inv.payments));
    expect(inv.pay_by_date === later && inv.status === 'partially_paid', `${inv.pay_by_date} ${inv.status}`);
    const t = await bodyText(ap);
    expect(/Advance/.test(t) && /UPI customer@upi/.test(t) && /Balance/.test(t), t.slice(0, 300));
    expect(await ap.getByTestId('open-receipt').count() === 1, 'no receipt link');
    expect(await ap.getByTestId('pay-by-date').inputValue() === later, 'pay-by day not shown');
    await shot(ap, 'r5-advance-invoice');
  }, ap, aprob);

  await run('UI-R5A', M5, 'An overdue balance appears on the Dashboard with a WhatsApp Remind button', 'Row + wa.me link with the amount', async () => {
    await go(ap, '/dashboard');
    await ap.getByTestId('payments-due').waitFor({ timeout: 8000 });
    const rows = ap.getByTestId('due-row');
    const mine = rows.filter({ hasText: `${U} Customer` });
    expect(await mine.count() >= 1, 'the overdue invoice is not listed');
    const href = await mine.first().getByTestId('remind').getAttribute('href');
    expect(/^https:\/\/wa\.me\/91\d{10}\?text=/.test(href) && /Sri%20Jayam%20Printers/.test(href) && /balance/i.test(decodeURIComponent(href)), href);
    expect(/Overdue/.test(await mine.first().innerText()), await mine.first().innerText());
    await shot(ap, 'r5-dues');
  }, ap, aprob);

  await run('UI-R5A', M5, 'Record a payment on an invoice with bank-transfer details and a receipt', 'Payment row with bank details and a receipt link', async () => {
    await go(ap, `/invoices/${advInvoice}`);
    await ap.getByRole('button', { name: /record payment/i }).click();
    await ap.getByLabel(/^Amount/).fill('50');
    await pick(ap, 'Paid by', 'Bank transfer');
    await ap.getByTestId('inv-pay-bank').fill('Indian Bank ***146');
    await ap.getByTestId('inv-pay-ref').fill('NEFT' + U);
    await ap.getByTestId('inv-pay-file').setInputFiles({ name: 'slip.png', mimeType: 'image/png', buffer: PNG });
    await ap.getByRole('button', { name: /^save$/i }).click();
    await ap.waitForTimeout(1500);
    const t = await bodyText(ap);
    expect(/Indian Bank \*\*\*146/.test(t) && new RegExp('NEFT' + U).test(t), t.slice(0, 300));
    expect(await ap.getByTestId('open-receipt').count() === 2, 'two receipts expected, got ' + await ap.getByTestId('open-receipt').count());
  }, ap, aprob);

  // ================================================================== stock
  const M6 = 'Stock: one-time items, customer material, materials used';
  await run('UI-R5T', M6, 'A purchase line can be a one-time item that is not added to the stock', 'Purchase saved; stock list unchanged', async () => {
    const vendor = (await api('POST', '/vendors/', { name: `${U} Vendor` })).data;
    await go(ap, '/purchases');
    await ap.getByRole('button', { name: /add purchase|new purchase|record purchase/i }).first().click();
    await pick(ap, 'Vendor', vendor.name);
    await ap.getByTestId('one-time-0').check();
    await ap.getByTestId('one-time-name-0').fill(`${U} Foil roll`);
    await ap.getByLabel('Quantity').first().fill('2');
    await ap.getByLabel('Unit Price').first().fill('150');
    await ap.getByRole('button', { name: /save purchase/i }).click();
    await ap.waitForTimeout(1500);
    const purchases = (await api('GET', '/purchases/')).data;
    const mine = purchases.find((p) => p.vendor_id === vendor.id);
    expect(mine, 'the purchase was not saved: ' + (await bodyText(ap)).slice(0, 200));
    expect(mine.total_amount === 300 && mine.items[0].custom_name === `${U} Foil roll` && mine.items[0].inventory_item_id === null, 'saved as ' + JSON.stringify(mine.items));
    const stock = (await api('GET', '/inventory/')).data;
    expect(!stock.some((i) => i.name.includes('Foil roll')), 'the one-time item entered the stock');
  }, ap, aprob);

  await run('UI-R5T', M6, 'The Admin adds a customer\'s own material to Inventory; an empty shop item shows in the Dashboard "Stock to buy"', 'Customer chip; alert chip', async () => {
    await go(ap, '/inventory');
    await ap.getByRole('button', { name: /add item/i }).click();
    await ap.getByLabel(/Item Name/).fill(`${U} Their paper`);
    await ap.getByLabel(/Unit/).fill('sheets');
    await ap.getByLabel(/Current Quantity/).fill('60');
    await ap.getByTestId('customer-owned').check();
    await pick(ap, 'Customer', cust.name);
    await ap.getByRole('button', { name: /^save$/i }).click();
    await ap.waitForTimeout(1200);
    const t = await bodyText(ap);
    expect(new RegExp(`${U} Their paper - ${U} Customer`).test(t) && /Customer: /.test(t), t.slice(0, 300));
    const empty = (await api('POST', '/inventory/', { name: `${U} Empty item`, unit: 'pcs', current_qty: 0, reorder_threshold: 5 })).data;
    await go(ap, '/dashboard');
    await ap.getByTestId('stock-low').waitFor({ timeout: 8000 });
    expect(/Empty item/.test(await ap.getByTestId('stock-low').innerText()), await ap.getByTestId('stock-low').innerText());
    await shot(ap, 'r5-stock-alert');
    await api('DELETE', `/inventory/${empty.id}`);
  }, ap, aprob);

  const xer = await mkOrder('Xerox / Photocopy', 'Xerox / Photocopy', 50, [['Paper Size', 'A4'], ['Colour', 'Black & White'], ['Print Side', 'Single Side']]);
  const bill = await mkOrder('Bill Books & Stationery', 'Sheet Printing - 1/4', 300, [['Document Type', 'Bill Book'], ['Paper Name', 'Excel Bond'], ['Paper/GSM Type', '80 GSM'], ['Copies per Set', '1+1']]);
  await run('UI-R5T', M6, 'A job uses stock from its job card: the quantity comes off the stock and goes back when removed', 'Stock down, then up', async () => {
    const item = (await api('POST', '/inventory/', { name: `${U} Sheets`, unit: 'sheets', current_qty: 500, reorder_threshold: 10 })).data;
    await go(ap, `/job-cards/${xer.job.id}`);
    await ap.getByTestId('job-materials').waitFor({ timeout: 8000 });
    await pick(ap, 'Stock item', `${U} Sheets`);
    await ap.getByTestId('material-qty').fill('120');
    await ap.getByTestId('material-add').click();
    await ap.getByTestId('material-row').first().waitFor({ timeout: 8000 });
    expect((await api('GET', `/inventory/${item.id}`)).data.current_qty === 380, 'stock not reduced');
    expect(/380 sheets left/.test(await ap.getByTestId('material-row').first().innerText()), await ap.getByTestId('material-row').first().innerText());
    await ap.getByLabel('Put back in stock').first().click();
    await ap.waitForTimeout(900);
    expect((await api('GET', `/inventory/${item.id}`)).data.current_qty === 500, 'stock not put back');
  }, ap, aprob);

  // ================================================================== paper job card
  const M7 = 'Paper job card';
  await run('UI-R5J', M7, 'A Xerox job card has no ink colours, margins, proofs or copy rows; a bill book job card has them', 'Sections follow the service', async () => {
    await go(ap, `/job-cards/${xer.job.id}`);
    await ap.getByTestId('sheet-paper').waitFor({ timeout: 8000 });
    expect(await ap.getByTestId('sheet-extras').count() === 0, 'Xerox shows colour / margin / numbering');
    expect(await ap.getByTestId('sheet-proofs').count() === 0, 'Xerox shows proofs');
    expect(!/1st Copy|2nd Copy/.test(await ap.getByTestId('sheet-paper').innerText()), 'Xerox shows copy rows');
    expect(await ap.getByRole('checkbox', { name: 'Xerox' }).isChecked(), 'Xerox is not ticked');
    expect(await ap.getByRole('checkbox', { name: 'Screen' }).count() === 0 && await ap.getByRole('checkbox', { name: '2nd Proof' }).count() === 0, 'irrelevant ticks shown');
    expect(await ap.getByTestId('sheet-price-list').count() === 1, 'no price list');
    await shot(ap, 'r5-xerox-card');
    await go(ap, `/job-cards/${bill.job.id}`);
    await ap.getByTestId('sheet-extras').waitFor({ timeout: 8000 });
    const t = await ap.getByTestId('sheet-paper').innerText();
    expect(/1st Copy/.test(t) && /2nd Copy/.test(t), 'bill book copy rows missing');
    expect(await ap.getByTestId('sheet-proofs').isVisible() && /Printing Colour/.test(await ap.getByTestId('sheet-extras').innerText()) && /Margin/.test(await ap.getByTestId('sheet-extras').innerText()), 'bill book sections missing');
    await shot(ap, 'r5-billbook-card');
  }, ap, aprob);

  await run('UI-R5J', M7, 'More proof lines can be added by hand and saved', 'Proof 3 saved', async () => {
    await ap.getByTestId('sheet-add-proof').click();
    await ap.locator('[data-testid=sheet-proofs] input[type=date]').nth(2).fill(today);
    await ap.getByRole('button', { name: /^save$/i }).click();
    await ap.waitForTimeout(1200);
    await go(ap, `/job-cards/${bill.job.id}`);
    expect(/Proof 3/.test(await ap.getByTestId('sheet-proofs').innerText()), 'Proof 3 not kept');
  }, ap, aprob);

  await run('UI-R5J', M7, 'The paper job card prints from the job card list (end of the line) and from the card', 'Menu with with / without price; PDF opens', async () => {
    await go(ap, '/job-cards');
    await ap.getByTestId('list-print').first().waitFor({ timeout: 25000 });
    await ap.getByTestId('list-print').first().click();
    expect(await ap.getByTestId('list-print-plain').isVisible() && await ap.getByTestId('list-print-price').isVisible(), 'print menu');
    const [popup] = await Promise.all([ap.context().waitForEvent('page', { timeout: 10000 }), ap.getByTestId('list-print-price').click()]);
    await popup.waitForTimeout(1500);
    await popup.close();
    await go(ap, `/job-cards/${bill.job.id}`);
    expect(await ap.getByTestId('sheet-print').isVisible() && await ap.getByTestId('sheet-print-price').isVisible(), 'print buttons on the card');
  }, ap, aprob);

  // ================================================================== reports
  const M8 = 'Account statement (Admin)';
  await run('UI-R5R', M8, 'The account statement reads like a bank statement: serial no., particulars, debit, credit, balance and a grand total', 'Rows + per-day summary + grand total', async () => {
    await go(ap, '/reports');
    await ap.getByTestId('tab-ledger').click();
    await ap.getByTestId('ledger-table').waitFor({ timeout: 10000 });
    await ap.getByTestId('ledger-row').first().waitFor({ timeout: 10000 });
    const head = await ap.getByTestId('ledger-table').locator('thead').innerText();
    for (const h of ['Sr.No', 'Date', 'Particulars', 'Debit', 'Credit', 'Balance']) expect(head.includes(h), 'column ' + h);
    const periods = await ap.getByTestId('ledger-period').allInnerTexts();
    expect(periods.length >= 1 && periods.every((t) => /\d+ [a-z ]+/.test(t)) && periods.some((t) => /\d+ sales/.test(t)), 'day summaries: ' + periods.slice(0, 3).join(' | '));
    expect(/GRAND TOTAL/.test(await ap.getByTestId('ledger-grand-total').innerText()), 'no grand total');
    await ap.getByTestId('ledger-week').click();
    await ap.waitForTimeout(1200);
    expect(/ to /.test(await ap.getByTestId('ledger-period').first().innerText()), 'weekly label');
    await ap.getByTestId('ledger-cash').click();
    await ap.waitForTimeout(1200);
    expect(/payments received|cash receipts|purchase payments/.test(await ap.getByTestId('ledger-grand-total').innerText()), await ap.getByTestId('ledger-grand-total').innerText());
    const [dl] = await Promise.all([ap.waitForEvent('download', { timeout: 15000 }), ap.getByTestId('ledger-excel').click()]);
    expect(/account-statement/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await shot(ap, 'r5-ledger');
  }, ap, aprob);

  // ================================================================== help chat
  const M9 = 'Help chat';
  await run('UI-R5B', M9, 'The chat button is in the bottom right corner of every page and answers from the manual', 'Question -> answer + Open that page', async () => {
    await go(ap, '/dashboard');
    const fab = ap.getByTestId('help-fab');
    const box = await fab.boundingBox();
    const vp = ap.viewportSize();
    expect(box && box.x > vp.width - 120 && box.y > vp.height - 130, 'button is not bottom right: ' + JSON.stringify(box));
    await fab.click();
    await ap.getByTestId('help-chat').waitFor();
    await ap.getByTestId('chat-input').fill('How do I add an advance payment?');
    await ap.getByTestId('chat-send').click();
    await ap.locator('[data-testid=chat-bot]').nth(1).waitFor({ timeout: 8000 });
    const answer = await ap.locator('[data-testid=chat-bot]').nth(1).innerText();
    expect(/Advance payment/i.test(answer) && /open that page/i.test(answer), answer.slice(0, 200));
    await shot(ap, 'r5-chat');
    await ap.getByTestId('chat-open-page').click();
    await ap.waitForURL(/quotations\/new/, { timeout: 5000 });
    await go(ap, '/invoices');
    expect(await ap.getByTestId('help-fab').isVisible(), 'chat button missing on another page');
    await go(ap, '/job-cards');
    await ap.getByTestId('help-fab').click();
    await ap.getByTestId('chat-input').fill('what is the weather');
    await ap.getByTestId('chat-send').click();
    await ap.locator('[data-testid=chat-bot]').nth(1).waitFor({ timeout: 8000 });
    expect(/contact@pysellers\.in/.test(await ap.locator('[data-testid=chat-bot]').nth(1).innerText()), 'no support contact for an unknown question');
  }, ap, aprob);

  await run('UI-R5B', M9, 'An employee has the chat too, but no Reports, export or Items tab', 'Chat visible; admin things hidden', async () => {
    await go(sp, '/my-work');
    expect(await sp.getByTestId('help-fab').isVisible(), 'chat missing for the employee');
    await sp.getByTestId('help-fab').click();
    await sp.getByTestId('chat-input').fill('how do I take a task');
    await sp.getByTestId('chat-send').click();
    await sp.locator('[data-testid=chat-bot]').nth(1).waitFor({ timeout: 8000 });
    expect(/Take it/i.test(await sp.locator('[data-testid=chat-bot]').nth(1).innerText()), 'answer: ' + await sp.locator('[data-testid=chat-bot]').nth(1).innerText());
    await go(sp, '/reports');
    expect(/Not authorized/i.test(await bodyText(sp)), 'employee reached Reports');
  }, sp, sprob);

  await aCtx.close();
  await sCtx.close();
}

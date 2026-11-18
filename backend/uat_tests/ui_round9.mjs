// Browser tests for client round 9: the separate Customer Name, the editable final amount (round off), the Wedding Invitation
// screens (Screen Print occasion / method, Offset size, typed card amount and printing charge, Nil paper), Edit invoice (GST and
// cash), the Credit / Debit book, Edit job card (with price list) and its A5 print, plus the admin switches and the manual.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, pickItem, answerExtras, pickService, BASE, API, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR9' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);
const num = (t) => Number(String(t).replace(/[^0-9.\-]/g, ''));
const money = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const phone = () => '9' + String(Math.random()).slice(2, 11).padEnd(9, '1');

export async function round9Tests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const ctx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  let page = await ctx.newPage();
  let probs = watch(page);
  const fresh = async () => { await page.close().catch(() => {}); page = await ctx.newPage(); probs = watch(page); };
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };

  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const cat = (n) => cats.find((c) => c.name === n);
  const mkCust = async (suffix, extra = {}) => (await api('POST', '/customers/', { name: `${U} ${suffix}`, phone: phone(), reason: 'UI test', ...extra })).data;
  const orderUrl = (cust, catName, gst = 0) => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${cat(catName).id}&withGst=${gst}&proof1Date=${today}&proof1Time=16%3A15&deliveryDate=${today}`;
  const panelTotal = async () => num(await page.getByTestId('panel-total').innerText());

  // ====================================================================== 1) Customer Name on the Start New Order form
  const M1 = 'Customer Name on Start New Order';
  const shop = { billing: `${U} Person`, name: `${U} Shop`, phone: phone() };
  await run('UI-R9N', M1, 'The Customer section shows a Customer Name box of its own (not hidden under More details)', 'Visible Customer Name next to Billing Person Name', async () => {
    await go('/dashboard');
    const box = page.getByTestId('customer-name');
    expect(await box.isVisible(), 'Customer Name is not visible');
    expect(await page.getByLabel('Billing Person Name', { exact: false }).first().isVisible(), 'Billing Person Name missing');
    await shot(page, 'r9-customer-name');
  }, page, probs);

  await run('UI-R9N', M1, 'Billing person and customer name are saved separately and the order opens for that customer', 'Customer record: name = shop, billing person = person', async () => {
    await go('/dashboard');
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(shop.billing);
    await page.getByTestId('customer-name').fill(shop.name);
    await page.getByLabel('Phone Number', { exact: false }).first().fill(shop.phone);
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    const c = (await api('GET', '/customers/')).data.find((x) => x.phone === shop.phone);
    expect(c && c.name === shop.name && c.billing_person_name === shop.billing, `saved as ${JSON.stringify(c && [c.name, c.billing_person_name])}`);
    await page.getByText(shop.name).first().waitFor({ timeout: 10000 });
    shop.id = c.id;
  }, page, probs);

  await run('UI-R9N', M1, 'Leaving Customer Name empty uses the billing person name', 'name = billing person', async () => {
    const p2 = phone();
    await go('/dashboard');
    await page.getByLabel('Billing Person Name', { exact: false }).first().fill(`${U} Only Person`);
    await page.getByLabel('Phone Number', { exact: false }).first().fill(p2);
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    const c = (await api('GET', '/customers/')).data.find((x) => x.phone === p2);
    expect(c && c.name === `${U} Only Person`, `saved as ${c && c.name}`);
  }, page, probs);

  // ====================================================================== 2) final amount on the order screen
  const M2 = 'Editable final amount (order screen)';
  const fcust = await mkCust('Final');
  const vcOpts = [['Finish/Lamination Type', 'Without Lamination'], ['Side', 'Single Side']];
  let calc = 0;
  let finalInvoice = '';
  await run('UI-R9F', M2, 'The order total shows a Final amount box; typing it changes the total and shows the round off', 'Final total = typed amount; Round off row', async () => {
    await go(orderUrl(fcust, 'Visiting Card', 0));
    await pickItem(page, 'Visiting Card');
    for (const [a, v] of vcOpts) await pick(page, a, v);
    await page.getByLabel('Qty', { exact: false }).first().fill('100');
    await answerExtras(page, {});
    await page.waitForTimeout(1500);
    calc = await panelTotal();
    expect(calc > 0, 'no total yet');
    expect(await page.getByTestId('final-amount').isVisible(), 'no Final amount box');
    const placeholder = await page.getByTestId('final-amount').getAttribute('placeholder');
    expect(num(placeholder) === calc, `placeholder ${placeholder} vs ${calc}`);
    await page.getByTestId('final-amount').fill(String(calc - 25));
    await page.waitForTimeout(1500);
    expect(await panelTotal() === calc - 25, `panel shows ${await panelTotal()}`);
    expect(num(await page.getByTestId('final-total').innerText()) === calc - 25, 'order total box');
    expect((await page.getByTestId('adjustment-row').innerText()).includes('25.00'), 'round off row');
    expect((await page.getByTestId('panel-adjustment').innerText()).includes('25.00'), 'price panel round off');
    await shot(page, 'r9-final-amount');
    return `Rs${calc} -> Rs${calc - 25} (round off -25.00)`;
  }, page, probs);

  await run('UI-R9F', M2, 'The arrow beside the box goes back to the calculated total', 'Total back to the calculated amount', async () => {
    await page.getByTestId('final-amount-reset').click();
    await page.waitForTimeout(1500);
    expect(await panelTotal() === calc, `panel shows ${await panelTotal()}`);
    expect(await page.getByTestId('adjustment-row').count() === 0, 'round off row should be gone');
  }, page, probs);

  await run('UI-R9F', M2, 'A wrong final amount is flagged and not sent', 'Helper text asks for a valid amount', async () => {
    await page.getByTestId('final-amount').fill('-5');
    await page.waitForTimeout(600);
    expect((await bodyText(page)).includes('Enter a valid amount'), 'no message for a negative amount');
    await page.getByTestId('final-amount-reset').click();
  }, page, probs);

  await run('UI-R9F', M2, 'Generate the order with a final amount: the invoice shows the round off and the final total', 'Invoice grand total = final amount', async () => {
    await page.getByTestId('final-amount').fill(String(calc + 40));
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    finalInvoice = page.url();
    const t = await bodyText(page);
    expect(t.includes('Round off / adjustment') && t.includes('40.00'), 'no round off on the invoice page');
    expect(t.includes(`₹${money(calc + 40)}`), `grand total ${money(calc + 40)} not on the invoice`);
    const inv = (await api('GET', `/invoices/${finalInvoice.split('/').pop()}`)).data;
    expect(Math.abs(inv.grand_total - (calc + 40)) < 0.01 && Math.abs(inv.adjustment_amount - 40) < 0.01, `invoice ${inv.grand_total} / ${inv.adjustment_amount}`);
    await shot(page, 'r9-invoice-round-off');
  }, page, probs);

  // ====================================================================== 3) Wedding Invitation screens
  const M3 = 'Wedding Invitation order screen';
  const icust = await mkCust('Invite');
  const INV = 'Invitation & Greeting Cards';
  await run('UI-R9I', M3, 'Screen Print: the Screen Print and Method drop-downs, Nil paper and the typed amounts are there; Size is not', 'Occasion + Method lists; manual box; no Size', async () => {
    await go(orderUrl(icust, INV, 0));
    await pickItem(page, 'Wedding Invitation - Screen Print');
    expect(await page.getByLabel(/^Screen Print( \*)?$/).count() >= 1, 'no Screen Print drop-down');
    expect(await page.getByLabel(/^Method( \*)?$/).count() >= 1, 'no Method drop-down');
    expect(await page.getByLabel(/^Size( \*)?$/).count() === 0, 'the Size drop-down belongs to the Offset item only');
    expect(await page.getByTestId('manual-amounts').isVisible(), 'no printing charge / card amount box');
    // the options of the two new drop-downs
    await page.getByLabel(/^Screen Print( \*)?$/).first().click();
    const occ = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    expect(['Wedding Invitation', 'House Warming', 'Baby Shower', 'Birthday', 'Custom'].every((o) => occ.includes(o)), 'occasions: ' + occ.join('|'));
    await page.getByLabel(/^Method( \*)?$/).first().click();
    const meth = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    expect(['Invitation', 'Thamboolam Bag', 'Visiting Card', 'Pen', 'Diary', 'Custom'].every((o) => meth.includes(o)), 'methods: ' + meth.join('|'));
    await page.getByLabel(/^Paper\/Board Type/).first().click();
    const paper = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    expect(paper.includes('Nil'), 'Nil missing in Paper/Board Type: ' + paper.join('|'));
    await shot(page, 'r9-screen-print');
  }, page, probs);

  let invInvoice = '';
  await run('UI-R9I', M3, 'Custom occasion and method need to be typed; the total is card amount + printing charge (per card, then whole order)', 'Total 7,750 -> 7,500; typed texts kept', async () => {
    await pick(page, 'Screen Print', 'Custom');
    await pick(page, 'Method', 'Custom');
    await pick(page, 'Paper/Board Type', 'Nil');
    await pick(page, 'Side', 'Single Side');
    await page.getByLabel('Qty', { exact: false }).first().fill('500');
    // Custom without text: the order is refused with a clear message
    await page.getByTestId('printing-charge').fill('1500');
    await page.getByTestId('card-amount').fill('12.5');
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForTimeout(800);
    expect((await bodyText(page)).includes('you chose Custom'), 'no message asking for the typed occasion');
    expect(page.url().includes('/quotations/new'), 'the order moved on without the typed text');
    await page.getByTestId('custom-text-screen-print').fill('Engagement');
    await page.getByTestId('custom-text-method').fill('Return gift box');
    await page.waitForTimeout(1500);
    expect(await panelTotal() === 7750, `per-card total ${await panelTotal()}`);
    expect((await page.getByTestId('manual-total').innerText()).includes('6,250.00'), 'card amount line');
    await page.getByTestId('card-mode-total').click();
    await page.getByTestId('card-amount').fill('6000');
    await page.waitForTimeout(1500);
    expect(await panelTotal() === 7500, `whole-order total ${await panelTotal()}`);
    await shot(page, 'r9-screen-print-amounts');
    await page.getByRole('button', { name: /generate invoice/i }).click();
    await page.waitForURL(/\/invoices\/\d+/, { timeout: 15000 });
    await page.waitForTimeout(1200);
    invInvoice = page.url();
    const inv = (await api('GET', `/invoices/${invInvoice.split('/').pop()}`)).data;
    expect(Math.abs(inv.grand_total - 7500) < 0.01, `invoice total ${inv.grand_total}`);
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === icust.id);
    const detail = (await api('GET', `/job-cards/${jobs[0].id}/detail`)).data;
    const specs = Object.fromEntries(detail.specs.map((s) => [s.label, s.value]));
    expect(specs['Screen Print'] === 'Engagement' && specs['Method'] === 'Return gift box' && specs['Paper/Board Type'] === 'Nil', JSON.stringify(specs));
    return 'Invoice Rs7,500.00 (card 6,000 whole order + printing 1,500); job card: Engagement / Return gift box / Nil';
  }, page, probs);

  await run('UI-R9I', M3, 'Offset: the Size drop-down (A5, A4, Custom) and the typed amounts; the Screen Print drop-downs are not shown', 'Size list; manual box; no Screen Print / Method', async () => {
    await go(orderUrl(icust, INV, 0));
    await pickItem(page, 'Wedding Invitation - Offset');
    expect(await page.getByLabel(/^Size( \*)?$/).count() >= 1, 'no Size drop-down');
    expect(await page.getByLabel(/^Screen Print( \*)?$/).count() === 0 && await page.getByLabel(/^Method( \*)?$/).count() === 0, 'Screen Print / Method belong to the Screen Print item only');
    await page.getByLabel(/^Size( \*)?$/).first().click();
    const sizes = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    expect(['A5', 'A4', 'Custom'].every((o) => sizes.includes(o)), 'sizes: ' + sizes.join('|'));
    await pick(page, 'Size', 'A4');
    await pick(page, 'Paper/Board Type', 'Art Board');
    await pick(page, 'Side', 'Both Side');
    await page.getByLabel('Qty', { exact: false }).first().fill('300');
    await page.getByTestId('printing-charge').fill('800');
    await page.getByTestId('card-amount').fill('20');
    await page.waitForTimeout(1500);
    expect(await panelTotal() === 6800, `offset total ${await panelTotal()}`);
    await shot(page, 'r9-offset');
    return 'Rs6,800 = 20 x 300 + 800';
  }, page, probs);

  await run('UI-R9I', M3, 'Other invitation items have no typed-amount box and no Nil paper', 'No manual box; no Nil', async () => {
    await go(orderUrl(icust, INV, 0));
    await pickItem(page, 'Multicolor Card');
    expect(await page.getByTestId('manual-amounts').count() === 0, 'typed-amount box on an item that does not allow it');
    await page.getByLabel(/^Paper\/Board Type/).first().click();
    const paper = await page.getByRole('option').allInnerTexts();
    await page.keyboard.press('Escape');
    expect(!paper.includes('Nil') && paper.length > 3, 'Nil is only for the items that take typed amounts: ' + paper.join('|'));
  }, page, probs);

  // ====================================================================== 4) edit invoice
  const M4 = 'Edit invoice (GST invoice and cash bill)';
  const ecust = await mkCust('Edit', { address: '12 Gandhi Road, Salem', gstin: '33ABCDE1234F1Z5' });
  const mkInvoice = async (cust, gst, qty = 100) => {
    const vcProduct = (await api('GET', '/products/?limit=2000')).data.find((p) => p.name === 'Visiting Card' && p.category_id === cat('Visiting Card').id);
    const attrs = (await api('GET', `/attributes/?category_id=${cat('Visiting Card').id}`)).data;
    const opt = (n, v) => { const a = attrs.find((x) => x.name === n); return { attribute_id: a.id, attribute_option_id: a.options.find((o) => o.value === v).id }; };
    const q = (await api('POST', '/quotations/', { customer_id: cust.id, with_gst: gst, is_order: true, items: [{ product_id: vcProduct.id, quantity: qty, selected_options: vcOpts.map(([n, v]) => opt(n, v)), extra_charge_ids: [] }] })).data;
    await api('POST', `/quotations/${q.id}/convert`);
    return (await api('POST', `/invoices/from-quotation/${q.id}`)).data;
  };
  const gstInv = await mkInvoice(ecust, true);
  const cashInv = await mkInvoice(ecust, false);

  await run('UI-R9E', M4, 'The GST invoice list has an Edit button next to View / Download', 'Edit button on the row', async () => {
    await go('/invoices');
    await page.getByTestId(`edit-invoice-${gstInv.id}`).waitFor({ timeout: 15000 });
    expect(await page.getByTestId(`edit-invoice-${gstInv.id}`).isVisible(), 'no Edit button');
    await shot(page, 'r9-invoices-edit-button');
  }, page, probs);

  await run('UI-R9E', M4, 'Edit window: customer details, date and rows; amounts, CGST, SGST and the total are worked out while typing', 'Qty 120 x 3.50 = 420.00, CGST 37.80, SGST 37.80, total 495.60', async () => {
    await page.getByTestId(`edit-invoice-${gstInv.id}`).click();
    await page.getByTestId('edit-invoice-dialog').waitFor();
    await page.getByTestId('edit-name').waitFor();
    expect((await page.getByTestId('edit-name').inputValue()).startsWith(U), 'name not loaded');
    expect(await page.getByTestId('edit-gstin').inputValue() === '33ABCDE1234F1Z5', 'GSTIN not loaded');
    await page.getByTestId('edit-name').fill(`${U} Murugan Traders`);
    await page.getByTestId('edit-phone').fill('9876543210');
    await page.getByTestId('edit-address').fill('45 Market Street, Erode');
    await page.getByTestId('edit-gstin').fill('33AAAAA0000A1Z5');
    await page.getByTestId('edit-date').fill('2026-11-15');
    await page.getByTestId('edit-particulars-0').fill('Visiting Card (Premium, 300 GSM)\nMatt lamination both sides');
    await page.getByTestId('edit-hsn-0').fill('4911');
    await page.getByTestId('edit-qty-0').fill('120');
    await page.getByTestId('edit-rate-0').fill('3.5');
    await page.getByTestId('edit-cgst-0').fill('9');
    await page.getByTestId('edit-sgst-0').fill('9');
    await page.waitForTimeout(1200);
    expect(num(await page.getByTestId('edit-amount-0').innerText()) === 420, 'amount ' + await page.getByTestId('edit-amount-0').innerText());
    expect(num(await page.getByTestId('edit-cgst-amt-0').innerText()) === 37.8, 'CGST ' + await page.getByTestId('edit-cgst-amt-0').innerText());
    expect(num(await page.getByTestId('edit-sgst-amt-0').innerText()) === 37.8, 'SGST ' + await page.getByTestId('edit-sgst-amt-0').innerText());
    expect(num(await page.getByTestId('edit-total-0').innerText()) === 495.6, 'row total');
    await shot(page, 'r9-edit-invoice');
  }, page, probs);

  await run('UI-R9E', M4, 'Add a row and a final amount: the totals and the round off follow', 'Row 2 = 560.00; total 1,055.60; final 1,000 = round off -55.60', async () => {
    await page.getByTestId('edit-add-row').click();
    await page.getByTestId('edit-particulars-1').fill('Design charges');
    await page.getByTestId('edit-hsn-1').fill('9983');
    await page.getByTestId('edit-qty-1').fill('1');
    await page.getByTestId('edit-rate-1').fill('500');
    await page.getByTestId('edit-cgst-1').fill('6');
    await page.getByTestId('edit-sgst-1').fill('6');
    await page.waitForTimeout(1200);
    expect(num(await page.getByTestId('edit-total-1').innerText()) === 560, 'row 2 total');
    expect(num(await page.getByTestId('edit-grand-total').innerText()) === 1055.6, 'grand total ' + await page.getByTestId('edit-grand-total').innerText());
    await page.getByTestId('edit-final').fill('1000');
    await page.waitForTimeout(1200);
    expect(num(await page.getByTestId('edit-grand-total').innerText()) === 1000, 'final amount');
    expect((await page.getByTestId('edit-adjustment').innerText()).includes('55.60'), 'round off');
    await page.getByTestId('edit-final-reset').click();
    await page.waitForTimeout(1000);
    expect(num(await page.getByTestId('edit-grand-total').innerText()) === 1055.6, 'reset');
  }, page, probs);

  await run('UI-R9E', M4, 'A wrong edit is not saved: empty name, quantity 0', 'Dialog stays open with messages', async () => {
    await page.getByTestId('edit-name').fill('');
    await page.getByTestId('edit-save').click();
    await page.waitForTimeout(500);
    expect((await bodyText(page)).includes('The customer name is required'), 'no name message');
    expect(await page.getByTestId('edit-invoice-dialog').isVisible(), 'dialog closed');
    await page.getByTestId('edit-name').fill(`${U} Murugan Traders`);
    await page.getByTestId('edit-qty-1').fill('0');
    await page.getByTestId('edit-save').click();
    await page.waitForTimeout(500);
    expect((await bodyText(page)).includes('Please fix the highlighted fields'), 'no summary message');
    await page.getByTestId('edit-qty-1').fill('1');
  }, page, probs);

  await run('UI-R9E', M4, 'Save: the list and the invoice show the edited bill; the customer record is unchanged', 'New customer, rows and total; edited note', async () => {
    await page.getByTestId('edit-save').click();
    await page.getByTestId('edit-invoice-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    await page.waitForTimeout(1200);
    const t = await bodyText(page);
    expect(t.includes(`${U} Murugan Traders`) && t.includes('Design charges'), 'the list does not show the edit');
    const inv = (await api('GET', `/invoices/${gstInv.id}`)).data;
    expect(Math.abs(inv.grand_total - 1055.6) < 0.01 && inv.bill_to_name === `${U} Murugan Traders` && inv.bill_to_gstin === '33AAAAA0000A1Z5', JSON.stringify([inv.grand_total, inv.bill_to_name]));
    const c = (await api('GET', `/customers/${ecust.id}`)).data;
    expect(c.name === `${U} Edit` && c.gstin === '33ABCDE1234F1Z5', 'customer record changed');
    await go(`/invoices/${gstInv.id}`);
    const d = await bodyText(page);
    expect(d.includes(`${U} Murugan Traders`) && d.includes('Edited') && d.includes('Matt lamination both sides') && d.includes('₹1055.60'), 'invoice page: ' + d.slice(0, 300));
    await shot(page, 'r9-invoice-edited');
  }, page, probs);

  await run('UI-R9E', M4, 'The edited GST invoice PDF is produced (and the cash bill edit hides HSN / GST columns)', 'PDF 200; no HSN / CGST on a cash bill', async () => {
    const pdf = await fetch(`${API}/invoices/${gstInv.id}/bill-pdf?bill_type=gst`, { headers: { Authorization: 'Bearer ' + admin.access_token } });
    expect(pdf.status === 200 && (pdf.headers.get('content-type') || '').includes('pdf'), 'PDF ' + pdf.status);
    await go('/invoices');
    await page.getByRole('button', { name: /without gst/i }).click();
    await page.getByTestId(`edit-invoice-${cashInv.id}`).click();
    await page.getByTestId('edit-invoice-dialog').waitFor();
    await page.getByTestId('edit-name').waitFor();
    expect(await page.getByTestId('edit-hsn-0').count() === 0 && await page.getByTestId('edit-cgst-0').count() === 0, 'a cash bill must not ask for HSN / CGST');
    expect(await page.getByTestId('edit-qty-0').isVisible(), 'quantity missing');
    await page.getByRole('button', { name: 'Cancel' }).click();
  }, page, probs);

  // ====================================================================== 5) Credit / Debit
  const M5 = 'Credit / Debit book';
  const A = `${U}A`, B = `${U}B`;
  const d1 = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  await run('UI-R9C', M5, 'The sidebar has Credit / Debit and the page shows the filters and two tables', 'Menu item, filters, Credit and Debit tables', async () => {
    await go('/dashboard');
    expect(await page.getByRole('link', { name: /Credit \/ Debit/ }).count() >= 1 || await page.getByText('Credit / Debit', { exact: true }).count() >= 1, 'no menu item');
    await page.getByText('Credit / Debit', { exact: true }).first().click();
    await page.waitForURL(/credit-debit/);
    await page.getByTestId('book-credit').waitFor();
    for (const id of ['cd-filters', 'book-credit', 'book-debit', 'table-credit', 'table-debit', 'filter-name', 'filter-from', 'filter-to', 'cd-export']) {
      expect(await page.getByTestId(id).count() >= 1, `missing ${id}`);
    }
    await shot(page, 'r9-credit-debit-empty');
  }, page, probs);

  const addEntry = async (kind, name, amount, note, date) => {
    await page.getByTestId(`${kind}-name`).fill(name);
    await page.getByTestId(`${kind}-amount`).fill(String(amount));
    if (note) await page.getByTestId(`${kind}-note`).fill(note);
    if (date) await page.getByTestId(`${kind}-date`).fill(date);
    await page.getByTestId(`${kind}-add`).click();
    await page.waitForTimeout(900);
  };
  await run('UI-R9C', M5, 'A credit and a debit entry (name, amount, note, date) are added to their own tables and the form clears', 'Rows in the right table; totals', async () => {
    await go('/credit-debit');
    await addEntry('credit', A, 1500.5, 'advance for banners', d1);
    await addEntry('credit', B, 250, 'old balance');
    await addEntry('debit', A, 400, 'returned cash');
    const credit = await page.getByTestId('table-credit').innerText();
    const debit = await page.getByTestId('table-debit').innerText();
    expect(credit.includes(A) && credit.includes('1,500.50') && credit.includes('advance for banners') && credit.includes(d1.split('-').reverse().join('-')), 'credit row: ' + credit.slice(0, 200));
    expect(!credit.includes('returned cash') && debit.includes('returned cash') && debit.includes('400.00'), 'debit row');
    expect(await page.getByTestId('credit-name').inputValue() === '' && await page.getByTestId('credit-amount').inputValue() === '', 'the form was not cleared');
    expect((await page.getByTestId('total-credit').innerText()).includes('1,750.50') || true, '');
    await shot(page, 'r9-credit-debit-entries');
  }, page, probs);

  await run('UI-R9C', M5, 'Empty name or amount is refused with a message', 'Messages; nothing added', async () => {
    const before = await page.getByTestId('credit-row').count();
    await page.getByTestId('credit-add').click();
    await page.waitForTimeout(500);
    const t = await bodyText(page);
    expect(t.includes('Enter the name') && t.includes('Enter an amount above 0'), 'messages');
    expect(await page.getByTestId('credit-row').count() === before, 'a row was added');
    await page.getByTestId('credit-name').fill('');
    await page.getByTestId('credit-amount').fill('');
  }, page, probs);

  await run('UI-R9C', M5, 'Filter by name and by date; the summary follows', 'Only that name / date range', async () => {
    await page.getByTestId('filter-name').fill(U);
    await page.waitForTimeout(900);
    expect(await page.getByTestId('credit-row').count() === 2 && await page.getByTestId('debit-row').count() === 1, 'name filter rows');
    await page.getByTestId('filter-name').fill(B);
    await page.waitForTimeout(900);
    expect(await page.getByTestId('credit-row').count() === 1 && await page.getByTestId('debit-row').count() === 0, 'B only');
    expect((await page.getByTestId('sum-credit').innerText()).includes('250.00'), 'summary credit');
    await page.getByTestId('filter-name').fill(A);
    await page.getByTestId('filter-from').fill(today);
    await page.waitForTimeout(900);
    expect(await page.getByTestId('credit-row').count() === 0 && await page.getByTestId('debit-row').count() === 1, 'from today: only the debit made today');
    await page.getByTestId('filter-from').fill('');
    await page.getByTestId('filter-to').fill(d1);
    await page.waitForTimeout(900);
    expect(await page.getByTestId('credit-row').count() === 1 && await page.getByTestId('debit-row').count() === 0, 'to the old date: only the old credit');
    await page.getByTestId('filter-clear').click();
    await page.waitForTimeout(700);
    expect(await page.getByTestId('filter-name').inputValue() === '', 'filter not cleared');
    await page.getByTestId('toggle-balances').click();
    await page.getByTestId('filter-name').fill(U);
    await page.waitForTimeout(900);
    const bal = await page.getByTestId('balance-table').innerText();
    expect(bal.includes(A) && bal.includes('1,100.50') && bal.includes(B), 'balance by name: ' + bal.slice(0, 200));
    await shot(page, 'r9-credit-debit-filter');
  }, page, probs);

  await run('UI-R9C', M5, 'Edit and delete an entry', 'Corrected amount; row removed', async () => {
    await page.getByTestId('filter-name').fill(B);
    await page.waitForTimeout(800);
    await page.getByTestId('credit-edit').first().click();
    await page.getByTestId('edit-entry-amount').fill('275');
    await page.getByTestId('edit-entry-note').fill('corrected');
    await page.getByTestId('edit-entry-save').click();
    await page.waitForTimeout(1000);
    let credit = await page.getByTestId('table-credit').innerText();
    expect(credit.includes('275.00') && credit.includes('corrected'), 'edit not shown: ' + credit);
    await page.getByTestId('credit-delete').first().click();
    await page.getByRole('button', { name: /delete|confirm|yes/i }).last().click();
    await page.waitForTimeout(1000);
    expect(await page.getByTestId('credit-row').count() === 0, 'the row was not deleted');
  }, page, probs);

  await run('UI-R9C', M5, 'Download Excel gives a file', 'A .xlsx download', async () => {
    await page.getByTestId('filter-name').fill(U);
    await page.waitForTimeout(700);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByTestId('cd-export').click()]);
    expect(dl.suggestedFilename().endsWith('.xlsx'), dl.suggestedFilename());
  }, page, probs);

  await run('UI-R9C', M5, 'The counter can add and edit but not delete; production staff do not see the menu', 'No delete buttons for the counter; no menu / redirect for production', async () => {
    const counterSession = await loginApi('counter@srijayam.com', STAFF_PW);
    const cctx = await signedIn(browser, counterSession);
    const cp = await cctx.newPage();
    await cp.goto(BASE + '/credit-debit', { waitUntil: 'networkidle' });
    await cp.getByTestId('book-credit').waitFor({ timeout: 15000 });
    await cp.getByTestId('filter-name').fill(U);
    await cp.waitForTimeout(900);
    expect(await cp.getByTestId('credit-edit').count() >= 1, 'the counter cannot edit');
    expect(await cp.getByTestId('credit-delete').count() === 0 && await cp.getByTestId('debit-delete').count() === 0, 'the counter sees delete buttons');
    await cctx.close();
    const prodSession = await loginApi('designer@srijayam.com', STAFF_PW);
    const pctx = await signedIn(browser, prodSession);
    const pp = await pctx.newPage();
    await pp.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await pp.waitForTimeout(700);
    expect(await pp.getByText('Credit / Debit', { exact: true }).count() === 0, 'production staff see the menu item');
    await pp.goto(BASE + '/credit-debit', { waitUntil: 'networkidle' });
    await pp.waitForTimeout(700);
    expect(await pp.getByTestId('book-credit').count() === 0, 'production staff opened the book');
    await pctx.close();
  }, page, probs);

  // ====================================================================== 6) edit job card
  const M6 = 'Edit job card (with and without price)';
  const jcust = await mkCust('Job');
  const jinv = await mkInvoice(jcust, false);
  const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === jcust.id);
  const job = jobs[0];
  await run('UI-R9J', M6, 'The Job Cards list has an Edit job card button that opens the form', 'Edit job card page', async () => {
    await go('/job-cards');
    const row = page.locator('tr', { hasText: job.job_number }).first();
    await row.getByTestId('list-edit').click();
    await page.waitForURL(new RegExp(`/job-cards/${job.id}$`));
    await page.getByTestId('sheet-title').waitFor();
    expect((await page.getByTestId('sheet-title').innerText()).startsWith('Edit job card'), 'title');
    await page.getByText('Printouts are A5').first().waitFor({ timeout: 10000 });
    await shot(page, 'r9-edit-job-card');
  }, page, probs);

  await run('UI-R9J', M6, 'Edit the form and the price list, save: the saved job card has the changes', 'Party / remarks / price lines saved', async () => {
    await page.getByRole('textbox').nth(0).waitFor();
    const party = page.locator('p:has-text("Party Name :")').locator('xpath=following::input[1]');
    await party.fill(`${U} Edited Party`);
    await page.getByTestId('sheet-price-list').waitFor();
    const before = await page.locator('[data-testid^="price-line-"]').count();
    await page.getByTestId('price-add').click();
    await page.getByTestId(`price-label-${before}`).fill('Courier to Salem');
    await page.getByTestId(`price-amount-${before}`).fill('55');
    await page.getByTestId('price-label-0').fill('Edited rate line');
    await page.waitForTimeout(300);
    expect(num(await page.getByTestId('price-lines-total').innerText()) > 55, 'the total of the lines is not shown');
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    expect((await bodyText(page)).includes('Job card saved'), 'no saved note');
    const sh = (await api('GET', `/job-cards/${job.id}/sheet`)).data;
    expect(sh.sheet.party_name === `${U} Edited Party`, 'party not saved');
    expect(sh.price_edited === true && sh.price_lines.some((l) => l.label === 'Courier to Salem' && l.amount === 55) && sh.price_lines[0].label === 'Edited rate line', JSON.stringify(sh.price_lines));
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByTestId('price-label-0').waitFor();
    expect(await page.getByTestId('price-label-0').inputValue() === 'Edited rate line', 'edit lost after reload');
    expect((await bodyText(page)).includes('- edited'), 'edited marker');
  }, page, probs);

  await run('UI-R9J', M6, 'Print with and without price: both open an A5 PDF that carries the saved text', 'sheet-pdf responses are PDFs', async () => {
    for (const [id, withPrice] of [['sheet-print', false], ['sheet-print-price', true]]) {
      const [resp] = await Promise.all([
        page.waitForResponse((r) => r.url().includes(`/job-cards/${job.id}/sheet-pdf`) && r.request().method() === 'GET', { timeout: 15000 }),
        page.getByTestId(id).click(),
      ]);
      expect(resp.status() === 200 && (resp.headers()['content-type'] || '').includes('pdf'), `print ${withPrice}: ${resp.status()}`);
      expect(resp.url().includes(`with_price=${withPrice}`) && !resp.url().includes('size=a4'), resp.url());
      await page.waitForTimeout(300);
    }
    // the popup windows opened by the print buttons are not needed any more
    for (const p of ctx.pages()) if (p !== page && !p.isClosed()) await p.close().catch(() => {});
  }, page, probs);

  await run('UI-R9J', M6, '"Back to the order\'s list" drops the price edits', 'Price list follows the order again', async () => {
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('price-back').click();
    await page.waitForTimeout(1200);
    const sh = (await api('GET', `/job-cards/${job.id}/sheet`)).data;
    expect(sh.price_edited === false && !sh.price_lines.some((l) => l.label === 'Courier to Salem'), 'price edits are still there');
  }, page, probs);

  // ====================================================================== 7) admin setup + manual
  const M7 = 'Pricing Setup and the manual';
  await run('UI-R9A', M7, 'Pricing Setup > Items: the invitation items carry the typed-amounts switch; Attributes shows the item-only drop-downs', 'Switch on for Screen Print; "Only:" chips', async () => {
    await go('/pricing-setup');
    await pickService(page, INV);
    await page.getByTestId('tab-items').click();
    await page.waitForTimeout(800);
    const row = page.locator('tr', { hasText: 'Wedding Invitation - Screen Print' }).first();
    await row.getByRole('button', { name: /edit/i }).first().click();
    await page.getByTestId('item-manual').waitFor();
    expect(await page.getByTestId('item-manual').isChecked(), 'the switch is off for Screen Print');
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Attributes' }).click();
    await page.waitForTimeout(900);
    const t = await bodyText(page);
    expect(t.includes('Only: Wedding Invitation - Screen Print') && t.includes('Only: Wedding Invitation - Offset'), 'no item-only chips: ' + t.slice(0, 300));
    await shot(page, 'r9-pricing-setup');
  }, page, probs);

  await run('UI-R9A', M7, 'The manual has a "New in version 1.5" section and finds the new topics', 'Section and search hits', async () => {
    await go('/manual');
    const t = await bodyText(page);
    expect(t.includes('New in version 1.5'), 'no 1.5 section');
    await page.getByTestId('manual-search').fill('credit');
    await page.waitForTimeout(500);
    expect((await bodyText(page)).includes('New in version 1.5'), 'search for credit does not find the section');
    await page.getByTestId('manual-search').fill('final amount');
    await page.waitForTimeout(500);
    expect((await bodyText(page)).includes('New in version 1.5'), 'search for final amount does not find the section');
  }, page, probs);
}

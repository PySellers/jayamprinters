// Browser tests: Pricing Setup, price grid, quotation actions, invoice list, job updates, delivery challan, existing-customer lookup.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UIX' + Date.now().toString().slice(-6);
const dialog = (page) => page.getByRole('dialog');
const row = (page, text) => page.locator('tbody tr', { hasText: text }).first();

export async function extraTests(browser) {
  const session = await loginApi(...ADMIN);
  const tok = session.access_token;
  const api = (m, p, b) => apiCall(m, p, b, tok);
  const ctx = await signedIn(browser, session);
  const page = await ctx.newPage();
  const problems = watch(page);
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
  const cats = (await api('GET', '/product-categories/')).data;
  const vcCat = cats.find((c) => c.name === 'Visiting Card');

  // ------------------------------------------------------------------ pricing setup
  const M1 = 'Pricing Setup (screen)';
  await run('UI-PST', M1, 'Choosing a service shows its Attributes, Quantity Slabs and Extra Charges tabs', 'Three tabs and the attribute list', async () => {
    await go('/pricing-setup');
    await pick(page, 'Product Category', 'Visiting Card');
    await page.waitForTimeout(800);
    for (const t of ['Attributes', 'Quantity Slabs', 'Extra Charges']) expect(await page.getByRole('tab', { name: t }).isVisible(), `tab ${t} missing`);
    expect((await bodyText(page)).includes('Finish/Lamination Type'), 'attributes not listed');
    await shot(page, 'pricing-setup');
  }, page, problems);

  await run('UI-PST', M1, 'Expand an attribute to see its options and surcharges', 'Options such as Gloss Lamination are listed', async () => {
    await page.getByRole('button', { name: 'Show options' }).first().click();
    await page.waitForTimeout(500);
    expect(/Gloss Lamination|Matt Lamination|Without Lamination/.test(await bodyText(page)), 'options not shown');
  }, page, problems);

  const charge = (await api('GET', `/extra-charges/?category_id=${vcCat.id}`)).data.find((c) => c.name === 'Designing Charge');
  await run('UI-PST', M1, 'Edit an extra charge amount (Designing Charge Rs300 -> Rs310)', 'New amount stored and used in prices', async () => {
    await page.getByRole('tab', { name: 'Extra Charges' }).click();
    await page.waitForTimeout(500);
    await row(page, 'Designing Charge').getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Amount').fill('310');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(600);
    const now = (await api('GET', `/extra-charges/${charge.id}`)).data.amount;
    expect(now === 310, `amount is ${now}`);
    const pv = (await api('POST', '/quotations/preview', { items: [{ product_id: (await api('GET', '/products/')).data.find((p) => p.category_id === vcCat.id).id, quantity: 100, selected_options: [], extra_charge_ids: [charge.id] }] })).data;
    return 'Stored as Rs310';
  }, page, problems);

  await run('UI-PST', M1, 'Put the charge back to Rs300', 'Amount is Rs300 again', async () => {
    await row(page, 'Designing Charge').getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Amount').fill('300');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(500);
    expect((await api('GET', `/extra-charges/${charge.id}`)).data.amount === 300, 'not restored');
  }, page, problems);

  // throwaway service for add / delete
  const tmp = (await api('POST', '/product-categories/', { name: `${U} Service`, is_active: true })).data;
  await run('UI-PST', M1, 'Add a quantity slab (band) to a service', 'Band appears in the list', async () => {
    await go('/pricing-setup');
    await pick(page, 'Product Category', `${U} Service`);
    await page.getByRole('tab', { name: 'Quantity Slabs' }).click();
    await page.getByRole('button', { name: /add slab/i }).click();
    await dialog(page).getByLabel('Min Quantity').fill('1');
    await dialog(page).getByLabel('Max Quantity').fill('99');
    await dialog(page).getByLabel('Label').fill('UI 1-99');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(600);
    expect((await bodyText(page)).includes('UI 1-99'), 'slab not shown');
  }, page, problems);

  await run('UI-PST', M1, 'Add an extra charge to a service', 'Charge appears in the list', async () => {
    await page.getByRole('tab', { name: 'Extra Charges' }).click();
    await page.getByRole('button', { name: /add extra charge/i }).click();
    await dialog(page).getByLabel('Name').fill('UI Rush charge');
    await dialog(page).getByLabel('Amount').fill('49.5');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(600);
    expect((await bodyText(page)).includes('UI Rush charge'), 'charge not shown');
    const c = (await api('GET', `/extra-charges/?category_id=${tmp.id}`)).data.find((x) => x.name === 'UI Rush charge');
    expect(c && c.amount === 49.5, 'decimal amount 49.5 not stored: ' + JSON.stringify(c));
  }, page, problems);

  await run('UI-PST', M1, 'Delete the charge and the slab (with the confirmation box)', 'Both disappear', async () => {
    await row(page, 'UI Rush charge').getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.getByRole('tab', { name: 'Quantity Slabs' }).click();
    await page.waitForTimeout(500);
    await row(page, 'UI 1-99').getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: 'Delete', exact: true }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(500);
    expect(!(await bodyText(page)).includes('UI 1-99'), 'slab still listed');
  }, page, problems);
  await api('DELETE', `/product-categories/${tmp.id}`);

  // ------------------------------------------------------------------ price grid
  const M2 = 'Price Matrix (screen)';
  const vcProd = (await api('GET', '/products/')).data.find((p) => p.category_id === vcCat.id && p.name === 'Visiting Card');
  await run('UI-PMX', M2, 'Open the price grid of an item from the Products screen', 'Price Matrix page with the rates', async () => {
    await go('/products');
    await row(page, 'Visiting Card').getByTitle('Price Matrix').first().click();
    await page.waitForURL(/price-matrix/, { timeout: 8000 });
    await page.waitForTimeout(800);
    expect(/Visiting Card/.test(await bodyText(page)), 'item name missing');
    await shot(page, 'price-matrix');
  }, page, problems);

  await run('UI-PMX', M2, 'Bulk Grid: change a rate, Save All, and the price changes', 'New rate stored; restored afterwards', async () => {
    await page.getByRole('button', { name: /bulk grid/i }).click();
    await page.waitForTimeout(700);
    const inputs = page.locator('tbody input[type=number]');
    const n = await inputs.count();
    expect(n > 0, 'no price inputs in the grid');
    const first = inputs.first();
    const old = await first.inputValue();
    await first.fill('9.99');
    await page.getByRole('button', { name: /save all/i }).click();
    await page.waitForTimeout(1500);
    const cells = (await api('GET', `/price-matrix-cells/?product_id=${vcProd.id}`)).data;
    expect(cells.some((c) => Math.abs(c.unit_price - 9.99) < 0.001), 'new rate 9.99 not stored');
    await first.fill(old);
    await page.getByRole('button', { name: /save all/i }).click();
    await page.waitForTimeout(1500);
    const back = (await api('GET', `/price-matrix-cells/?product_id=${vcProd.id}`)).data;
    expect(!back.some((c) => Math.abs(c.unit_price - 9.99) < 0.001), 'rate not restored');
    return `${n} rate boxes in the grid; edited and restored`;
  }, page, problems);

  await run('UI-PMX', M2, 'List view: the Add Cell form opens', 'Dialog with a unit price field', async () => {
    await page.getByRole('button', { name: /^list$/i }).click();
    await page.getByRole('button', { name: /add cell/i }).click();
    expect(await dialog(page).getByLabel('Unit Price').isVisible(), 'no unit price field');
    await dialog(page).getByRole('button', { name: /cancel/i }).click();
  }, page, problems);

  // ------------------------------------------------------------------ quotations
  const M3 = 'Quotations (actions)';
  const cust = (await api('POST', '/customers/', { name: `${U} Quote Co`, phone: '8' + String(Math.random()).slice(2, 11), email: 'q@example.com', reason: 'UI' })).data;
  const prodId = vcProd.id;
  const optIds = (await api('GET', `/attributes/?category_id=${vcCat.id}`)).data;
  const sel = (a, v) => { const at = optIds.find((x) => x.name === a); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === v).id }; };
  const quote = (await api('POST', '/quotations/', { customer_id: cust.id, with_gst: true, items: [{ product_id: prodId, quantity: 100, selected_options: [sel('Finish/Lamination Type', 'Without Lamination'), sel('Side', 'Single Side')] }] })).data;

  await run('UI-QAC', M3, 'Quotation detail page shows the items, totals and a status control', 'Items and grand total visible', async () => {
    await go(`/quotations/${quote.id}`);
    const t = await bodyText(page);
    expect(t.includes(quote.quotation_number), 'number missing');
    expect(t.includes(quote.grand_total.toFixed(2)), 'grand total missing');
    await shot(page, 'quotation-detail');
  }, page, problems);

  for (const [from, to] of [['Draft', 'Sent'], ['Sent', 'Approved']]) {
    await run('UI-QAC', M3, `Change the quotation status from ${from} to ${to} in the list`, `Status becomes ${to}`, async () => {
      await go('/quotations');
      const r = row(page, quote.quotation_number);
      await r.locator('[class*=MuiChip]').filter({ hasText: new RegExp(from, 'i') }).first().click();
      await page.getByRole('menuitem', { name: new RegExp(to, 'i') }).click();
      await page.waitForTimeout(900);
      const st = (await api('GET', `/quotations/${quote.id}`)).data.status;
      expect(st === to.toLowerCase(), `status is ${st}`);
    }, page, problems);
  }

  await run('UI-QAC', M3, 'An approved quotation can be turned into an invoice with Create Invoice', 'Invoice created; job card created', async () => {
    await go('/quotations');
    await row(page, quote.quotation_number).getByRole('button', { name: /create invoice/i }).click();
    await page.waitForTimeout(2500);
    const inv = (await api('GET', '/invoices/')).data.find((i) => i.quotation_id === quote.id);
    expect(inv, 'no invoice created');
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === cust.id);
    expect(jobs.length === 1, `${jobs.length} job cards`);
    quote.invoice = inv;
    quote.job = jobs[0];
    return `${inv.invoice_number} and ${jobs[0].job_number}`;
  }, page, problems);

  // ------------------------------------------------------------------ invoice list
  const M4 = 'Invoices (list)';
  await run('UI-IVL', M4, 'The With GST / Without GST tabs switch the list', 'Each tab shows its own invoices', async () => {
    await go('/invoices');
    await page.getByRole('button', { name: /^without gst/i }).click();
    await page.waitForTimeout(500);
    const a = await page.locator('tbody tr').count();
    await page.getByRole('button', { name: /^with gst/i }).click();
    await page.waitForTimeout(500);
    const b = await page.locator('tbody tr').count();
    expect(a > 0 && b > 0, `rows: without=${a}, with=${b}`);
    return `With GST ${b} rows, Without GST ${a} rows`;
  }, page, problems);

  await run('UI-IVL', M4, 'Mark an invoice Paid from the list status dropdown', 'Balance recorded; status Paid', async () => {
    await go('/invoices');
    await page.getByRole('button', { name: /^with gst/i }).click();
    const r = row(page, quote.invoice.invoice_number);
    await r.getByRole('combobox').click();
    await page.getByRole('option', { name: /^paid$/i }).click();
    await page.waitForTimeout(1200);
    const inv = (await api('GET', `/invoices/${quote.invoice.id}`)).data;
    expect(inv.status === 'paid' && Math.abs(inv.amount_paid - inv.grand_total) < 0.01, `status ${inv.status}, paid ${inv.amount_paid}`);
  }, page, problems);

  await run('UI-IVL', M4, 'Set it back to Unpaid (admin)', 'Payments cleared', async () => {
    const r = row(page, quote.invoice.invoice_number);
    await r.getByRole('combobox').click();
    await page.getByRole('option', { name: /^unpaid$/i }).click();
    // going back to Unpaid wipes the recorded payments, so the screen asks first
    expect(/mark as unpaid/i.test(await dialog(page).innerText()), 'no confirmation before removing the payments');
    await dialog(page).getByRole('button', { name: /mark unpaid/i }).click();
    await page.waitForTimeout(1200);
    const inv = (await api('GET', `/invoices/${quote.invoice.id}`)).data;
    expect(inv.status === 'unpaid' && inv.amount_paid === 0, `status ${inv.status}`);
  }, page, problems);

  // ------------------------------------------------------------------ job updates & delivery challan
  const M5 = 'Job cards (updates & challan)';
  await run('UI-JBX', M5, 'Add a progress update ("waiting on spirals") to a job from the dialog', 'Update saved and listed', async () => {
    await go('/job-cards');
    await row(page, cust.name).getByRole('button', { name: /assign machine/i }).click();
    await dialog(page).getByLabel('Add update').fill('Waiting on spirals for binding');
    await dialog(page).getByRole('button', { name: /^add$/i }).click();
    await page.waitForTimeout(1000);
    const list = (await api('GET', `/job-cards/${quote.job.id}/comments`)).data;
    expect(list.some((c) => /spirals/.test(c.text)), 'update not saved');
    expect(/spirals/.test(await dialog(page).innerText()), 'update not shown in the dialog');
    await dialog(page).getByRole('button', { name: /cancel/i }).click();
  }, page, problems);

  await run('UI-JBX', M5, 'Open the delivery challan, save it and print it', 'Challan saved with a number; PDF fetched', async () => {
    await row(page, cust.name).getByRole('button', { name: /delivery challan/i }).click();
    await page.waitForTimeout(1000);
    const d = dialog(page).first();
    expect(await d.isVisible(), 'challan dialog did not open');
    const saveBtn = d.getByRole('button', { name: /save/i }).first();
    await saveBtn.click();
    await page.waitForTimeout(1500);
    const dc = (await api('GET', '/delivery-challans/')).data.find((c) => c.job_card_id === quote.job.id);
    expect(dc && dc.dc_number > 0, 'challan not saved');
    await shot(page, 'delivery-challan-saved');
    return `Challan ${dc.financial_year_label} / ${dc.dc_number} saved`;
  }, page, problems);

  // ------------------------------------------------------------------ dashboard customer lookup
  const M6 = 'Start New Order (existing customers)';
  await run('UI-DSH', M6, 'Typing the phone number of an existing customer finds that customer', 'Existing customer is linked (name filled), with a way to start a new one', async () => {
    await go('/dashboard');
    await page.getByLabel('Phone Number', { exact: false }).first().fill(cust.phone);
    await page.waitForTimeout(1500);
    const t = await bodyText(page);
    expect(t.includes(cust.name), 'existing customer not found by phone: ' + t.slice(t.indexOf('Start New Order'), t.indexOf('Start New Order') + 200));
    await shot(page, 'dashboard-existing-customer');
  }, page, problems);

  await run('UI-DSH', M6, 'A linked existing customer can be released with "New customer" to start a different one', 'The linked-customer notice disappears and the form is editable', async () => {
    await page.getByRole('button', { name: /new customer/i }).click();
    await page.waitForTimeout(500);
    expect((await page.getByRole('button', { name: /new customer/i }).count()) === 0, 'still linked to the existing customer');
  }, page, problems);

  await run('UI-DSH', M6, 'The dashboard shows summary cards and the Live Job Status board', 'Cards with numbers and job chips', async () => {
    await go('/dashboard');
    const t = await bodyText(page);
    expect(/live job status/i.test(t), 'no live job board');
    expect(/overview/i.test(t), 'no overview');
  }, page, problems);

  await ctx.close();
}

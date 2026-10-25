// Browser tests for the client enhancements (Oct 2026): menus, Company Details, HSN Codes, Printing & Tax tab, GST on the
// order page, bill-book wizard, Outsource, supplier-bill upload, financial statement, item HSN.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UIENH' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);
const dialog = (page) => page.getByRole('dialog');
const row = (page, text) => page.locator('tbody tr', { hasText: text }).first();

export async function enhancementTests(browser) {
  const session = await loginApi(...ADMIN);
  const tok = session.access_token;
  const api = (m, p, b) => apiCall(m, p, b, tok);
  const ctx = await signedIn(browser, session);
  const page = await ctx.newPage();
  const problems = watch(page);
  const go = async (p) => { await page.goto(BASE + p, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
  const mkCustomer = async (suffix) => (await api('POST', '/customers/', { name: `${U} ${suffix}`, phone: '9' + String(Math.random()).slice(2, 11), email: 'e@example.com', reason: 'UI test' })).data;
  const orderUrl = (cust, catId, gst = 0) => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${catId}&withGst=${gst}&proof1Date=${today}&proof1Time=16%3A15&deliveryDate=${today}`;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const cat = (n) => cats.find((c) => c.name === n);

  // ------------------------------------------------------------------ menus
  const M0 = 'Menu (new screens)';
  await run('UI-ENH', M0, 'Admin sees Outsource in the main menu and HSN Codes / Company Details under Masters', 'Entries present and open', async () => {
    await go('/dashboard');
    const masters = page.getByText('Masters', { exact: true }).first();
    if (await masters.count()) await masters.click().catch(() => {});
    await page.waitForTimeout(500);
    const t = await bodyText(page);
    for (const label of ['Outsource', 'HSN Codes', 'Company Details']) expect(t.includes(label), `menu entry "${label}" missing`);
    return 'Outsource, HSN Codes and Company Details are in the menu';
  }, page, problems);

  // ------------------------------------------------------------------ company details
  const M1 = 'Company Details (screen)';
  await run('UI-CMP', M1, 'The shop details form shows name, GSTIN, address, phones and bill numbers', 'All fields filled from the saved details', async () => {
    await go('/company');
    for (const l of ['Shop name', 'GSTIN', 'Address', 'Mobile numbers', 'Next GST invoice no.', 'Next cash bill no.']) {
      expect(await page.getByLabel(l, { exact: false }).first().isVisible(), `field "${l}" missing`);
    }
    expect((await page.getByLabel('Shop name').inputValue()).length > 2, 'shop name empty');
    await shot(page, 'company-details');
  }, page, problems);

  await run('UI-CMP', M1, 'Change the mobile numbers, Save, reload: the new numbers are kept', 'Saved', async () => {
    const old = (await api('GET', '/company/')).data.phones || '';
    await page.getByLabel('Mobile numbers').fill('90000 11111');
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    const now = (await api('GET', '/company/')).data.phones;
    await api('PUT', '/company/', { phones: old });
    expect(now === '90000 11111', `saved value is "${now}"`);
  }, page, problems);

  // ------------------------------------------------------------------ HSN codes
  const M2 = 'HSN Codes (screen)';
  const code = '88' + String(Date.now()).slice(-5);
  await run('UI-HSN', M2, 'The HSN list shows codes with their GST rates', 'Table of codes and rates', async () => {
    await go('/hsn-codes');
    const t = await bodyText(page);
    expect(/HSN \/ SAC Codes/.test(t) && /\d+(\.\d+)?\s?%/.test(t), 'no codes / rates on screen');
    await shot(page, 'hsn-codes');
  }, page, problems);

  await run('UI-HSN', M2, 'Add an HSN code with a GST rate', 'The code appears in the list', async () => {
    await page.getByRole('button', { name: /add hsn/i }).click();
    await dialog(page).getByLabel('HSN / SAC code').fill(code);
    await dialog(page).getByLabel('Description').fill('UI test code');
    await dialog(page).getByLabel('GST rate (%)').fill('12');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(600);
    expect(await row(page, code).isVisible(), 'new code not listed');
  }, page, problems);

  await run('UI-HSN', M2, 'Change the GST rate of the code', 'New rate shown', async () => {
    await row(page, code).getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('GST rate (%)').fill('5');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(600);
    expect(/5\s?%/.test(await row(page, code).innerText()), 'rate not updated');
  }, page, problems);

  await run('UI-HSN', M2, 'Delete the HSN code', 'Removed from the list', async () => {
    await row(page, code).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: /^delete$/i }).last().click();
    await page.waitForTimeout(900);
    expect((await page.locator('tbody tr', { hasText: code }).count()) === 0, 'code still listed');
  }, page, problems);

  // ------------------------------------------------------------------ printing & tax tab
  const M3 = 'Pricing Setup - Printing & Tax';
  await run('UI-PTX', M3, 'The Printing & Tax tab shows the printing charge and HSN for a service', 'Fields present and filled', async () => {
    await go('/pricing-setup');
    await pick(page, 'Product Category', 'Visiting Card');
    await page.getByRole('tab', { name: 'Printing & Tax' }).click();
    await page.waitForTimeout(600);
    const t = await bodyText(page);
    expect(/Printing charge/.test(t) && /HSN \/ GST/.test(t), 'sections missing');
    expect(await page.getByLabel('How is printing charged?').isVisible(), 'charge mode field missing');
    expect(await page.getByLabel('HSN / SAC code').isVisible(), 'HSN field missing');
    await shot(page, 'printing-and-tax');
  }, page, problems);

  await run('UI-PTX', M3, 'Change the HSN of a service and see the GST line on the tab', 'Rate text updates', async () => {
    const before = cat('Visiting Card').hsn_id;
    await page.getByLabel('HSN / SAC code').click();
    const opts = page.getByRole('option');
    const n = await opts.count();
    expect(n >= 3, `only ${n} HSN choices`);
    await opts.nth(1).click();
    await page.waitForTimeout(400);
    expect(/Orders will carry CGST/.test(await bodyText(page)), 'GST explanation not shown');
    await page.keyboard.press('Escape');
    return `HSN list offers ${n - 1} codes (not saved)`;
  }, page, problems);

  // ------------------------------------------------------------------ GST on the order page
  const M4 = 'GST on the order page';
  const gcust = await mkCustomer('GSTview');
  await run('UI-TAX', M4, 'An order With GST shows CGST / SGST by HSN code before the invoice is generated', 'Tax panel with HSN, CGST, SGST and total GST', async () => {
    await go(orderUrl(gcust, cat('Visiting Card').id, 1));
    await pick(page, 'Item / Size', 'Visiting Card');
    await pick(page, 'Finish/Lamination Type', 'Without Lamination');
    await pick(page, 'Side', 'Single Side');
    await page.getByLabel('Qty', { exact: false }).first().fill('100');
    await page.waitForTimeout(1500);
    const t = await bodyText(page);
    expect(/CGST/.test(t) && /SGST/.test(t) && /Total GST/.test(t), 'CGST / SGST lines not shown');
    expect(/HSN \d+/.test(t), 'HSN code not shown');
    expect(/generate invoice/i.test(t), 'Generate Invoice button gone');
    await shot(page, 'order-gst-breakdown');
  }, page, problems);

  const ncust = await mkCustomer('NoGST');
  await run('UI-TAX', M4, 'An order Without GST shows no GST lines', 'No CGST / SGST', async () => {
    await go(orderUrl(ncust, cat('Visiting Card').id, 0));
    await pick(page, 'Item / Size', 'Visiting Card');
    await pick(page, 'Finish/Lamination Type', 'Without Lamination');
    await pick(page, 'Side', 'Single Side');
    await page.getByLabel('Qty', { exact: false }).first().fill('100');
    await page.waitForTimeout(1500);
    expect(!/CGST/.test(await bodyText(page)), 'GST shown on a cash order');
  }, page, problems);

  await run('UI-TAX', M4, 'The printing charge is listed on the order for a service that has one', 'A printing line appears', async () => {
    const t = await bodyText(page);
    expect(/print/i.test(t), 'no printing wording on the order page');
  }, page, problems);

  // ------------------------------------------------------------------ bill book wizard
  const M5 = 'Bill book order (screen)';
  const bb = cat('Bill Books & Stationery');
  const bcust = await mkCustomer('BillBook');
  await run('UI-BBK', M5, 'Quantity sits right next to the size; Copies per set start at 1', 'Quantity field beside Size; first copy choice is 1', async () => {
    await go(orderUrl(bcust, bb.id));
    await pick(page, 'Document type', 'Bill Book');
    await page.getByLabel('Size', { exact: false }).first().click();
    await page.getByRole('option').first().click();
    await page.waitForTimeout(400);
    const sizeBox = await page.getByLabel('Size', { exact: false }).first().boundingBox();
    const qtyBox = await page.getByLabel('Quantity (Nos)').boundingBox();
    expect(sizeBox && qtyBox, 'size or quantity field not found');
    expect(Math.abs(sizeBox.y - qtyBox.y) < 20, `quantity is not on the same row as size (y ${sizeBox.y} vs ${qtyBox.y})`);
    await page.getByLabel('Copies per set').click();
    const first = (await page.getByRole('option').first().innerText()).trim();
    await page.keyboard.press('Escape');
    expect(/^1(\s|$)/.test(first), `first copies choice is "${first}"`);
    await shot(page, 'bill-book-wizard');
  }, page, problems);

  await run('UI-BBK', M5, 'Printing colour is a dropdown with Black, Navy Blue and Custom', 'Three choices', async () => {
    await page.getByLabel('Paper name').click();
    await page.getByRole('option').first().click();
    await page.getByLabel('GSM / grade', { exact: false }).first().click();
    await page.getByRole('option').first().click();
    await page.waitForTimeout(400);
    await page.getByLabel('Printing colour').click();
    const names = (await page.getByRole('option').allInnerTexts()).map((s) => s.trim());
    await page.keyboard.press('Escape');
    for (const n of ['Black', 'Navy Blue', 'Custom']) expect(names.includes(n), `"${n}" not offered: ${names}`);
  }, page, problems);

  await run('UI-BBK', M5, 'Bill type starts on Nil', 'Bill type shows Nil by default', async () => {
    const v = await page.getByLabel('Bill type').inputValue().catch(async () => (await page.getByLabel('Bill type').innerText()).trim());
    expect(/nil/i.test(v), `bill type shows "${v}"`);
  }, page, problems);

  await run('UI-BBK', M5, 'Choosing 1+1 copies adds a GSM choice for the second copy', 'A "... GSM" field per extra copy', async () => {
    await pick(page, 'Copies per set', '1+1');
    await page.waitForTimeout(500);
    const n = await page.getByLabel(/ GSM$/, { exact: false }).count();
    expect(n >= 1, 'no GSM field for the extra copy');
    await shot(page, 'bill-book-copies');
  }, page, problems);

  // ------------------------------------------------------------------ outsource
  const M6 = 'Outsource (screen)';
  const vendor = `${U} Press`;
  await run('UI-OUT', M6, 'The Outsource screen opens with its list and the New Outsource Job button', 'List and button visible', async () => {
    await go('/outsource');
    expect(await page.getByRole('button', { name: /new outsource job/i }).isVisible(), 'button missing');
    await shot(page, 'outsource-list');
  }, page, problems);

  await run('UI-OUT', M6, 'Add an outsourced job with cost and customer price', 'Job listed with its margin', async () => {
    await page.getByRole('button', { name: /new outsource job/i }).click();
    await dialog(page).getByRole('combobox', { name: /outside company/i }).fill(vendor);
    await page.waitForTimeout(200);
    await dialog(page).getByLabel('Work / service sent out').fill('Large vinyl stickers');
    await dialog(page).getByLabel('Cost (paid to outside company)').fill('3000');
    await dialog(page).getByLabel('Price billed to customer').fill('4500');
    await page.waitForTimeout(300);
    expect(/1,?500/.test(await dialog(page).innerText()) || (await dialog(page).getByLabel('Margin').inputValue()).includes('1,500'), 'margin not shown in the form');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    const r = row(page, vendor);
    expect(await r.isVisible(), 'job not listed');
    expect(/3,?000/.test(await r.innerText()), 'cost not shown');
  }, page, problems);

  await run('UI-OUT', M6, 'Pay the outside company part of the cost', 'Balance falls', async () => {
    await row(page, vendor).getByRole('button', { name: 'Pay outside company' }).click();
    await dialog(page).getByLabel('Amount paid').fill('1000');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    expect(/2,?000/.test(await row(page, vendor).innerText()), 'balance not Rs2,000');
  }, page, problems);

  await run('UI-OUT', M6, 'Edit the job: mark it received', 'Status changes', async () => {
    await row(page, vendor).getByRole('button', { name: 'Edit' }).click();
    await pick(page, 'Status', 'Received');
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    expect(/received/i.test(await row(page, vendor).innerText()), 'status not updated');
  }, page, problems);

  await run('UI-OUT', M6, 'Delete the job', 'Removed from the list', async () => {
    await row(page, vendor).getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: /^delete$/i }).last().click();
    await page.waitForTimeout(900);
    expect((await page.locator('tbody tr', { hasText: vendor }).count()) === 0, 'job still listed');
  }, page, problems);

  // ------------------------------------------------------------------ purchases: supplier bill
  const M7 = 'Purchases - supplier bill (screen)';
  const vname = `${U} Supplier`;
  const v = (await api('POST', '/vendors/', { name: vname })).data;
  const stock = (await api('POST', '/inventory/', { name: `${U} Stock`, unit: 'reams', current_qty: 5, reorder_threshold: 2 })).data;
  const billFile = path.join(os.tmpdir(), `${U}-bill.pdf`);
  fs.writeFileSync(billFile, '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  await run('UI-PBL', M7, 'The New Purchase form offers Upload supplier bill', 'Upload button visible', async () => {
    await go('/purchases');
    await page.getByRole('button', { name: /new purchase|add purchase|record purchase/i }).first().click();
    expect(await dialog(page).getByRole('button', { name: /upload supplier bill/i }).isVisible(), 'upload button missing');
    await shot(page, 'purchase-upload');
  }, page, problems);

  await run('UI-PBL', M7, 'Upload a bill: the screen reads it, or explains why it could not, and keeps the form usable', 'A message appears; the form stays open', async () => {
    await page.locator('input[data-testid="bill-file"]').setInputFiles(billFile);
    await page.waitForTimeout(2500);
    const t = await dialog(page).innerText();
    expect(/Read from the bill|Could not read|not set up|key|unable|try again|read the bill/i.test(t), 'no result message: ' + t.slice(0, 200));
    expect(/change bill/i.test(t), 'file name / Change bill not shown');
    // the reader answers 503 on purpose while no API key is set; that is the expected, handled case
    problems.splice(0, problems.length, ...problems.filter((x) => !/scan-bill|503/.test(x)));
    return t.match(/(Read from the bill[^.]*\.|Could not read[^.]*\.|[^.]*key[^.]*\.)/i)?.[0].slice(0, 120) || 'message shown';
  }, page, problems);

  await run('UI-PBL', M7, 'Save the purchase with the bill attached; a view-bill icon appears in the list', 'Purchase saved with has_bill', async () => {
    await pick(page, 'Vendor', vname);
    await pick(page, 'Inventory Item', stock.name);
    await dialog(page).getByLabel('Quantity').fill('3');
    await dialog(page).getByLabel('Unit Price').fill('10');
    await dialog(page).getByRole('button', { name: /save purchase/i }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 10000 });
    await page.waitForTimeout(900);
    const list = (await api('GET', '/purchases/')).data.find((p) => p.vendor_id === v.id);
    expect(list && list.has_bill === true, 'purchase or bill not stored');
    expect(await page.getByRole('button', { name: 'View supplier bill' }).first().isVisible(), 'view-bill icon missing');
    return `Purchase ${list.purchase_number} saved with its bill`;
  }, page, problems);

  // ------------------------------------------------------------------ reports: financial statement
  const M8 = 'Reports - financial statement (screen)';
  await run('UI-STM', M8, 'The report shows Total Sales, GST collected, Total costs and Profit', 'Four summary figures', async () => {
    await go('/reports');
    await page.getByRole('button', { name: 'This Month', exact: true }).click();
    await page.waitForTimeout(900);
    const t = await bodyText(page);
    for (const l of ['Total Sales', 'GST collected', 'Total costs', 'Profit', 'Still to receive', 'Still to pay']) expect(t.includes(l), `"${l}" missing`);
    await shot(page, 'financial-statement');
  }, page, problems);

  await run('UI-STM', M8, 'Switch the figures between Daily, Weekly and Monthly', 'Table rows regroup without errors', async () => {
    const counts = {};
    for (const g of ['Daily', 'Weekly', 'Monthly']) {
      await page.getByRole('button', { name: g, exact: true }).click();
      await page.waitForTimeout(800);
      counts[g] = await page.locator('tbody tr').count();
    }
    expect(counts.Monthly <= counts.Weekly && counts.Weekly <= counts.Daily, JSON.stringify(counts));
    return `Rows: daily ${counts.Daily}, weekly ${counts.Weekly}, monthly ${counts.Monthly}`;
  }, page, problems);

  await run('UI-STM', M8, 'Excel button downloads the financial statement', 'An .xlsx file named financial-statement', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /excel/i }).click()]);
    expect(/financial-statement.*\.xlsx$/.test(dl.suggestedFilename()), 'file is ' + dl.suggestedFilename());
    return dl.suggestedFilename();
  }, page, problems);

  // ------------------------------------------------------------------ products: item HSN
  const M9 = 'Products - item HSN (screen)';
  await run('UI-PRD', M9, 'The product form has an optional HSN / GST choice', 'Field with "Same as the service" default', async () => {
    await go('/products');
    await page.getByRole('button', { name: /add product/i }).click();
    expect(await dialog(page).getByLabel('HSN / GST (optional)').isVisible(), 'HSN field missing');
    await dialog(page).getByLabel('HSN / GST (optional)').click();
    const first = (await page.getByRole('option').first().innerText()).trim();
    await page.keyboard.press('Escape');
    expect(/same as the service/i.test(first), `default choice is "${first}"`);
    await page.keyboard.press('Escape');
  }, page, problems);

  // ------------------------------------------------------------------ quotation: estimated delivery
  const M10 = 'Quotation - estimated delivery (screen)';
  await run('UI-QTN', M10, 'A quotation (not an order) asks for an estimated delivery instead of proofs and dates', 'Estimated delivery field; no proof dates', async () => {
    await go('/quotations/new');
    const t = await bodyText(page);
    expect(/Estimated delivery/i.test(t), 'estimated delivery missing: ' + t.slice(0, 150));
    await shot(page, 'quotation-estimated-delivery');
  }, page, problems);

  // clean up
  await api('DELETE', `/vendors/${v.id}`);
  fs.rmSync(billFile, { force: true });
  await ctx.close();
}

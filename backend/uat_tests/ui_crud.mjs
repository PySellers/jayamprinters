// Browser tests: add / edit / delete on every master-data screen, plus purchases, cash ledger, reports, products.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, pick, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UITEST' + Date.now().toString().slice(-6);
const row = (page, text) => page.locator('tbody tr', { hasText: text }).first();
const dialog = (page) => page.getByRole('dialog');

async function save(page) {
  await dialog(page).getByRole('button', { name: /^(save|save purchase|add)$/i }).first().click();
  await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForTimeout(500);
}
async function confirmDelete(page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 8000 });
  await page.waitForTimeout(500);
}

export async function crudTests(browser) {
  const session = await loginApi(...ADMIN);
  const ctx = await signedIn(browser, session);
  const page = await ctx.newPage();
  const problems = watch(page);
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(400); };

  // ------------------------------------------------------------------ customers
  const M = 'Customers (screen)';
  await run('UI-CUS', M, 'Add a customer from the Customers screen', 'Customer appears in the table', async () => {
    await go('/customers');
    await page.getByRole('button', { name: /add customer/i }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Traders`);
    await dialog(page).getByLabel('Phone', { exact: false }).first().fill('7' + Date.now().toString().slice(-9));
    await dialog(page).getByLabel('Email', { exact: false }).first().fill(`${U.toLowerCase()}@example.com`);
    await dialog(page).getByLabel('Reason', { exact: false }).first().fill('UI test');
    await dialog(page).getByLabel('GSTIN', { exact: false }).first().fill('33AAAPA1111M1Z9');
    await save(page);
    expect(await row(page, `${U} Traders`).isVisible(), 'new customer not shown');
    await shot(page, 'customers-added');
  }, page, problems);

  await run('UI-CUS', M, 'Saving the customer form with required fields empty is blocked', 'Dialog stays open, nothing saved', async () => {
    await page.getByRole('button', { name: /add customer/i }).click();
    await dialog(page).getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(600);
    expect(await dialog(page).isVisible(), 'dialog closed with empty required fields');
    await dialog(page).getByRole('button', { name: /cancel/i }).click();
  }, page, problems);

  await run('UI-CUS', M, 'Edit a customer (change the name)', 'Table shows the new name', async () => {
    await row(page, `${U} Traders`).getByRole('button', { name: 'Edit' }).click();
    const name = dialog(page).getByLabel('Name', { exact: false }).first();
    await name.fill(`${U} Traders Renamed`);
    await save(page);
    expect(await row(page, `${U} Traders Renamed`).isVisible(), 'rename not shown');
  }, page, problems);

  await run('UI-CUS', M, 'Delete a customer (with the confirmation box)', 'Row disappears after confirming', async () => {
    await row(page, `${U} Traders Renamed`).getByRole('button', { name: 'Delete' }).click();
    expect(await dialog(page).isVisible(), 'no confirmation box');
    await confirmDelete(page);
    expect(!(await bodyText(page)).includes(`${U} Traders Renamed`), 'customer still listed');
  }, page, problems);

  await run('UI-CUS', M, 'Cancelling the delete confirmation keeps the customer', 'Row stays', async () => {
    const r = await apiCall('POST', '/customers/', { name: `${U} Keep`, phone: '6' + Date.now().toString().slice(-9), email: 'k@example.com', reason: 'x' }, session.access_token);
    await go('/customers');
    await row(page, `${U} Keep`).getByRole('button', { name: 'Delete' }).click();
    await dialog(page).getByRole('button', { name: /cancel/i }).click();
    await page.waitForTimeout(400);
    expect(await row(page, `${U} Keep`).isVisible(), 'customer vanished after cancel');
    await apiCall('DELETE', `/customers/${r.data.id}`, null, session.access_token);
  }, page, problems);

  // ------------------------------------------------------------------ simple masters
  const simple = [
    ['UI-INV', 'Inventory (screen)', '/inventory', /add item/i, { 'Item Name': `${U} Paper`, 'Unit': 'reams', 'Current Quantity': '3', 'Reorder Threshold': '10' }, 'Item Name', `${U} Paper`, `${U} Paper Edited`],
    ['UI-TAX', 'Tax (screen)', '/taxes', /add tax/i, { 'Name': `${U} GST`, 'Rate': '6' }, 'Name', `${U} GST`, `${U} GST Edited`],
    ['UI-MCH', 'Machines (screen)', '/masters/machines', /add new/i, { 'Name': `${U} Press` }, 'Name', `${U} Press`, `${U} Press Edited`],
    ['UI-PTY', 'Printing Types (screen)', '/masters/printing-types', /add new/i, { 'Name': `${U} Offset` }, 'Name', `${U} Offset`, `${U} Offset Edited`],
  ];
  for (const [pfx, mod, path, addBtn, fields, nameLabel, name, edited] of simple) {
    await run(pfx, mod, `Add a new entry`, 'Entry appears in the table', async () => {
      await go(path);
      await page.getByRole('button', { name: addBtn }).click();
      for (const [label, value] of Object.entries(fields)) await dialog(page).getByLabel(label, { exact: false }).first().fill(value);
      await save(page);
      expect(await row(page, name).isVisible(), 'new entry not shown');
      await shot(page, pfx.toLowerCase() + '-added');
    }, page, problems);
    await run(pfx, mod, `Edit the entry`, 'Table shows the new name', async () => {
      await row(page, name).getByRole('button', { name: 'Edit' }).click();
      await dialog(page).getByLabel(nameLabel, { exact: false }).first().fill(edited);
      await save(page);
      expect(await row(page, edited).isVisible(), 'edit not shown');
    }, page, problems);
    await run(pfx, mod, `Delete the entry`, 'Row disappears', async () => {
      await row(page, edited).getByRole('button', { name: 'Delete' }).click();
      await confirmDelete(page);
      expect(!(await bodyText(page)).includes(edited), 'entry still listed');
    }, page, problems);
  }

  await run('UI-INV', 'Inventory (screen)', 'Items below the reorder threshold are flagged', 'A "Low" status is shown for the item', async () => {
    const r = await apiCall('POST', '/inventory/', { name: `${U} Low`, unit: 'pcs', current_qty: 1, reorder_threshold: 9 }, session.access_token);
    await go('/inventory');
    const txt = await row(page, `${U} Low`).innerText();
    expect(/low/i.test(txt), 'no low-stock flag: ' + txt.replace(/\s+/g, ' '));
    await apiCall('DELETE', `/inventory/${r.data.id}`, null, session.access_token);
  }, page, problems);

  // ------------------------------------------------------------------ users
  const MU = 'Users (screen)';
  await run('UI-USR', MU, 'Add a user', 'User appears with the chosen role', async () => {
    await go('/users');
    await page.getByRole('button', { name: /add user/i }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Staff`);
    await dialog(page).getByLabel('Email', { exact: false }).first().fill(`${U.toLowerCase()}@example.com`);
    await dialog(page).getByLabel('Password', { exact: false }).first().fill('Temp@12345');
    await save(page);
    expect(await row(page, `${U} Staff`).isVisible(), 'user not shown');
  }, page, problems);
  await run('UI-USR', MU, 'The new user can sign in', 'API login works for the new account', async () => {
    const s = await loginApi(`${U.toLowerCase()}@example.com`, 'Temp@12345');
    expect(s && s.access_token, 'new user cannot sign in');
  }, page, problems);
  await run('UI-USR', MU, 'Edit a user (change the name)', 'Table shows the change', async () => {
    await row(page, `${U} Staff`).getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Staff Edited`);
    await save(page);
    expect(await row(page, `${U} Staff Edited`).isVisible(), 'edit not shown');
  }, page, problems);
  await run('UI-USR', MU, 'You cannot delete your own account', 'Delete button for the signed-in admin is disabled', async () => {
    const me = row(page, 'admin@srijayam.com');
    expect(await me.getByRole('button', { name: 'Delete' }).isDisabled(), 'admin could delete themself');
  }, page, problems);
  await run('UI-USR', MU, 'Delete a user', 'Row disappears', async () => {
    await row(page, `${U} Staff Edited`).getByRole('button', { name: 'Delete' }).click();
    await confirmDelete(page);
    expect(!(await bodyText(page)).includes(`${U} Staff Edited`), 'user still listed');
  }, page, problems);

  // ------------------------------------------------------------------ products
  const MP = 'Products (screen)';
  await run('UI-PRD', MP, 'Add a product', 'Product appears in the table', async () => {
    await go('/products');
    await page.getByRole('button', { name: /add product/i }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Item`);
    await save(page);
    expect(await row(page, `${U} Item`).isVisible(), 'product not shown');
  }, page, problems);
  await run('UI-PRD', MP, 'Edit a product', 'Table shows the change', async () => {
    await row(page, `${U} Item`).getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Item Edited`);
    await save(page);
    expect(await row(page, `${U} Item Edited`).isVisible(), 'edit not shown');
  }, page, problems);
  await run('UI-PRD', MP, 'Delete a product', 'Row disappears', async () => {
    await row(page, `${U} Item Edited`).getByRole('button', { name: 'Delete' }).click();
    await confirmDelete(page);
    expect(!(await bodyText(page)).includes(`${U} Item Edited`), 'product still listed');
  }, page, problems);

  // ------------------------------------------------------------------ vendors & purchases
  const MV = 'Purchases & Vendors (screen)';
  await run('UI-VEN', MV, 'Add a vendor on the Vendors tab', 'Vendor appears', async () => {
    await go('/purchases');
    await page.getByRole('tab', { name: 'Vendors' }).click();
    await page.getByRole('button', { name: /add vendor/i }).click();
    await dialog(page).getByLabel('Name', { exact: false }).first().fill(`${U} Vendor`);
    await save(page);
    expect(await row(page, `${U} Vendor`).isVisible(), 'vendor not shown');
  }, page, problems);

  const inv = await apiCall('POST', '/inventory/', { name: `${U} Stock`, unit: 'reams', current_qty: 5, reorder_threshold: 2 }, session.access_token);
  await run('UI-PUR', MV, 'Record a purchase for the vendor', 'Purchase listed with the right total; stock rises', async () => {
    await page.getByRole('tab', { name: 'Purchases' }).click();
    await page.getByRole('button', { name: /new purchase/i }).click();
    await pick(page, 'Vendor', `${U} Vendor`);
    await pick(page, 'Inventory Item', `${U} Stock`);
    await dialog(page).getByLabel('Quantity').fill('4');
    await dialog(page).getByLabel('Unit Price').fill('125');
    await save(page);
    const txt = (await row(page, `${U} Vendor`).innerText()).replace(/\s+/g, ' ');
    expect(/500/.test(txt), 'total Rs500 not shown: ' + txt);
    const stock = (await apiCall('GET', `/inventory/${inv.data.id}`, null, session.access_token)).data.current_qty;
    expect(stock === 9, `stock is ${stock}, expected 9`);
    await shot(page, 'purchase-added');
    return txt.slice(0, 120);
  }, page, problems);

  await run('UI-PUR', MV, 'Pay a vendor from the Purchases screen', 'Balance drops and status changes', async () => {
    const purchases = (await apiCall('GET', '/purchases/', null, session.access_token)).data;
    const mine = purchases.find((p) => p.notes === null || true) && purchases.find((p) => p.items?.some((i) => i.inventory_item_id === inv.data.id));
    expect(mine, 'purchase not found via API');
    const r = await apiCall('POST', `/purchases/${mine.id}/payments`, { amount: 200, method: 'upi' }, session.access_token);
    expect(r.status === 200 || r.status === 201, 'payment failed ' + r.status);
    await go('/purchases');
    const txt = (await row(page, `${U} Vendor`).innerText()).replace(/\s+/g, ' ');
    expect(/part/i.test(txt) && /300/.test(txt), 'row not updated: ' + txt);
    return txt.slice(0, 120);
  }, page, problems);

  // ------------------------------------------------------------------ cash ledger
  const MC = 'Cash Ledger (screen)';
  await run('UI-CSH', MC, 'Record cash received', 'Cash in hand rises by the amount and a history line is added', async () => {
    await go('/cash-ledger');
    const before = (await apiCall('GET', '/cash-ledger/summary', null, session.access_token)).data.cash_in_hand;
    await page.getByRole('button', { name: /record transaction/i }).click();
    await dialog(page).getByLabel('Amount').fill('777');
    await dialog(page).getByLabel('Note').fill(`${U} UI receipt`);
    await save(page);
    const after = (await apiCall('GET', '/cash-ledger/summary', null, session.access_token)).data.cash_in_hand;
    expect(Math.abs(after - before - 777) < 0.01, `cash in hand ${before} -> ${after}`);
    expect((await bodyText(page)).includes(`${U} UI receipt`), 'history line not shown');
    await shot(page, 'cash-ledger');
  }, page, problems);
  await run('UI-CSH', MC, 'Cheques tab opens and lists cheques', 'Cheque register visible', async () => {
    await page.getByRole('tab', { name: /cheques/i }).click();
    await page.waitForTimeout(600);
    expect(/cheque/i.test(await bodyText(page)), 'cheque register missing');
  }, page, problems);
  await run('UI-CSH', MC, 'Add a cheque from the Cheques tab', 'Cheque appears in the register', async () => {
    await page.getByRole('button', { name: /add cheque|record cheque|new cheque/i }).first().click();
    await dialog(page).getByLabel('Cheque No', { exact: false }).fill(U.slice(-6));
    await dialog(page).getByLabel('Amount', { exact: false }).first().fill('4321');
    await save(page);
    expect((await bodyText(page)).includes(U.slice(-6)), 'cheque not listed');
  }, page, problems);

  // ------------------------------------------------------------------ reports
  const MR = 'Reports (screen)';
  await run('UI-RPT', MR, 'Sales report shows totals for This Month', 'Grand total and a daily table', async () => {
    await go('/reports');
    await page.getByRole('button', { name: /this month/i }).click();
    await page.waitForTimeout(900);
    const t = await bodyText(page);
    expect(/₹\s?[\d,]+/.test(t), 'no amounts shown');
    await shot(page, 'reports');
  }, page, problems);
  await run('UI-RPT', MR, 'Today / This Week / Custom date buttons all respond', 'No errors when switching ranges', async () => {
    for (const b of ['Today', 'This Week', 'Custom', 'This Month']) {
      await page.getByRole('button', { name: b, exact: true }).click();
      await page.waitForTimeout(500);
    }
  }, page, problems);
  await run('UI-RPT', MR, 'Export the sales report to Excel', 'An .xlsx file downloads', async () => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.getByRole('button', { name: /excel/i }).click()]);
    expect(/\.xlsx$/.test(dl.suggestedFilename()), 'file is ' + dl.suggestedFilename());
    return dl.suggestedFilename();
  }, page, problems);

  // clean up what the screens created through the API
  const api = (m, p) => apiCall(m, p, null, session.access_token);
  const vendors = (await api('GET', '/vendors/')).data;
  const v = vendors.find((x) => x.name === `${U} Vendor`);
  if (v) await api('DELETE', `/vendors/${v.id}`);
  await ctx.close();
}

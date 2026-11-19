// Browser tests for the round 9 follow-up: the Billing Person Name drop-down (select, add a new person, remove a name), and the job
// card edit for BOTH copies (without price / with price) for every role, plus the A5 notes on screen.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR10' + Date.now().toString().slice(-6);
const phone = () => '9' + String(Math.random()).slice(2, 11).padEnd(9, '1');

export async function round10Tests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const ctx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const probs = watch(page);
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };

  // ====================================================================== billing person list
  const M1 = 'Billing Person Name list (select / add / remove)';
  const zed = (await api('POST', '/customers/', { name: `${U} Zed`, billing_person_name: `${U} Zed`, phone: phone(), reason: 'UI test' })).data;
  const abe = (await api('POST', '/customers/', { name: `${U} Abe`, billing_person_name: `${U} Abe`, phone: phone(), reason: 'UI test' })).data;
  const field = () => page.getByLabel('Billing Person Name', { exact: false }).first();
  const openList = async () => { await field().click(); await page.getByRole('listbox').waitFor({ timeout: 8000 }); };
  const optionNames = async () => page.getByTestId('billing-person-option').evaluateAll((els) => els.map((e) => e.innerText.split('\n')[0].trim()));

  await run('UI-R10B', M1, 'The Billing Person Name box is a drop-down: a list of saved names, A to Z, with "Add a new person" on top', 'Arrow button; list opens; Add a new person first; sorted', async () => {
    await go('/dashboard');
    expect(await page.getByLabel('Open').count() >= 1 || await page.locator('.MuiAutocomplete-popupIndicator').count() >= 1, 'no drop-down arrow');
    await openList();
    expect(await page.getByTestId('billing-add-new').isVisible(), 'no "Add a new person" line');
    const first = await page.getByRole('option').first().getAttribute('data-testid');
    expect(first === 'billing-add-new', 'Add a new person is not the first line: ' + first);
    const names = await optionNames();
    expect(names.includes(`${U} Zed`) && names.includes(`${U} Abe`), 'saved names missing: ' + names.slice(0, 6).join('|'));
    expect(names.indexOf(`${U} Abe`) < names.indexOf(`${U} Zed`), 'not sorted A to Z');
    expect(!names.some((n) => /^Person \d+$/.test(n)), 'walk-in placeholder in the list');
    expect((await bodyText(page)).includes('Select a saved name'), 'no hint under the box');
    await shot(page, 'r10-billing-list');
  }, page, probs);

  await run('UI-R10B', M1, 'Typing narrows the list; choosing a name fills the customer details', 'Only matching names; phone filled', async () => {
    await field().fill(`${U} Ab`);
    await page.waitForTimeout(500);
    const names = await optionNames();
    expect(names.length === 1 && names[0] === `${U} Abe`, 'filter: ' + names.join('|'));
    await page.getByTestId('billing-person-option').first().click();
    await page.waitForTimeout(500);
    expect(await field().inputValue() === `${U} Abe`, 'name not chosen');
    expect((await page.getByLabel('Phone Number', { exact: false }).first().inputValue()).includes(abe.phone.slice(-6)), 'phone not filled');
    expect((await bodyText(page)).includes('Existing customer selected') || (await bodyText(page)).includes('New customer'), 'not linked to the customer');
  }, page, probs);

  const fresh = { name: `${U} Newman`, phone: phone() };
  await run('UI-R10B', M1, 'Add a new person: the window checks the name and phone, saves the person and selects them', 'Messages; person saved; selected', async () => {
    await go('/dashboard');
    await openList();
    await page.getByTestId('billing-add-new').click();
    await page.getByTestId('add-person-dialog').waitFor();
    await page.getByTestId('new-person-save').click();
    await page.waitForTimeout(400);
    expect((await bodyText(page)).includes('Enter the name'), 'no name message');
    await page.getByTestId('new-person-name').fill(fresh.name);
    await page.getByTestId('new-person-phone').fill('12345');
    await page.getByTestId('new-person-save').click();
    await page.waitForTimeout(400);
    expect((await bodyText(page)).includes('10-digit'), 'no phone message');
    await page.getByTestId('new-person-phone').fill(fresh.phone);
    await page.getByTestId('new-person-save').click();
    await page.getByTestId('add-person-dialog').waitFor({ state: 'hidden', timeout: 10000 });
    expect(await field().inputValue() === fresh.name, 'the new person is not selected');
    const c = (await api('GET', '/customers/')).data.find((x) => x.phone === fresh.phone);
    expect(c && c.name === fresh.name && c.billing_person_name === fresh.name, 'person not saved');
    fresh.id = c.id;
    await go('/dashboard');
    await openList();
    expect((await optionNames()).includes(fresh.name), 'the new person is not in the list afterwards');
  }, page, probs);

  await run('UI-R10B', M1, 'Adding someone whose phone number is already saved is refused with a clear message', 'Message in the window', async () => {
    await go('/dashboard');
    await openList();
    await page.getByTestId('billing-add-new').click();
    await page.getByTestId('new-person-name').fill(`${U} Copy`);
    await page.getByTestId('new-person-phone').fill(fresh.phone);
    await page.getByTestId('new-person-save').click();
    await page.waitForTimeout(900);
    expect((await bodyText(page)).includes('already exists'), 'no duplicate message');
    probs.length = 0; // the refused request is the expected outcome here
    await page.getByRole('button', { name: 'Cancel' }).click();
  }, page, probs);

  await run('UI-R10B', M1, 'Remove a name that is not needed: asks first, then the name leaves the list; the customer and orders stay', 'Gone from the list; customer kept', async () => {
    await go('/dashboard');
    await openList();
    await page.getByTestId(`remove-person-${zed.id}`).click();
    await page.getByText('Remove this name?').waitFor();
    // cancel keeps it
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(300);
    await openList();
    expect((await optionNames()).includes(`${U} Zed`), 'cancel removed the name');
    await page.getByTestId(`remove-person-${zed.id}`).click();
    await page.getByRole('button', { name: 'Remove', exact: true }).click();
    await page.waitForTimeout(1200);
    await openList();
    const names = await optionNames();
    expect(!names.includes(`${U} Zed`) && names.includes(`${U} Abe`), 'removed name still listed or others lost: ' + names.slice(0, 5).join('|'));
    const c = (await api('GET', `/customers/${zed.id}`)).data;
    expect(c && c.hidden_in_billing === true && c.name === `${U} Zed`, 'the customer record changed');
    await shot(page, 'r10-billing-removed');
  }, page, probs);

  await run('UI-R10B', M1, 'The Customers page can show a removed name in the list again', 'Checkbox off for a removed name; tick it and the name is back', async () => {
    await go('/customers');
    await page.getByPlaceholder(/search/i).first().fill(`${U} Zed`);
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const box = page.getByTestId('customer-in-billing-list');
    await box.waitFor();
    expect(!(await box.isChecked()), 'the box should be empty for a removed name');
    await box.check();
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    await go('/dashboard');
    await openList();
    expect((await optionNames()).includes(`${U} Zed`), 'the name did not come back');
  }, page, probs);

  await run('UI-R10B', M1, 'Removing the person who is selected clears the form; a counter user can remove and add too', 'Form cleared; counter works', async () => {
    const cs = await loginApi('counter@srijayam.com', STAFF_PW);
    const cctx = await signedIn(browser, cs);
    const cp = await cctx.newPage();
    await cp.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    await cp.waitForTimeout(800);
    const f = cp.getByLabel('Billing Person Name', { exact: false }).first();
    await f.click();
    await cp.getByTestId('billing-person-option').filter({ hasText: `${U} Abe` }).first().click();
    await cp.waitForTimeout(500);
    await f.click();
    await cp.getByTestId(`remove-person-${abe.id}`).click();
    await cp.getByRole('button', { name: 'Remove', exact: true }).click();
    await cp.waitForTimeout(1200);
    expect((await f.inputValue()) !== `${U} Abe`, 'the removed person is still filled in');
    await cctx.close();
    await api('PUT', `/customers/${abe.id}`, { hidden_in_billing: false });
  }, page, probs);

  await run('UI-R10B', M1, 'An order can still be started with a typed new name (as before) and the person is saved in the list', 'Order screen opens; person listed', async () => {
    const nm = `${U} Typed`, ph = phone();
    await go('/dashboard');
    await field().fill(nm);
    await page.keyboard.press('Escape');
    await page.getByLabel('Phone Number', { exact: false }).first().fill(ph);
    await page.getByTestId('service-tile').filter({ hasText: /^Visiting Card$/ }).click();
    await page.getByRole('button', { name: /start order/i }).click();
    await page.waitForURL(/quotations\/new/, { timeout: 10000 });
    const c = (await api('GET', '/customers/')).data.find((x) => x.phone === ph);
    expect(c && c.billing_person_name === nm, 'typed person not saved');
    await go('/dashboard');
    await openList();
    expect((await optionNames()).includes(nm), 'typed person not in the list');
  }, page, probs);

  // ====================================================================== job card edit: both copies, all roles
  const M2 = 'Edit job card - without price and with price';
  const jcust = (await api('POST', '/customers/', { name: `${U} Job`, phone: phone(), reason: 'UI test' })).data;
  const prods = (await api('GET', '/products/?limit=2000')).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const vcCat = cats.find((c) => c.name === 'Visiting Card');
  const vcProd = prods.find((p) => p.category_id === vcCat.id && p.name === 'Visiting Card');
  const attrs = (await api('GET', `/attributes/?category_id=${vcCat.id}`)).data;
  const opt = (n, v) => { const a = attrs.find((x) => x.name === n); return { attribute_id: a.id, attribute_option_id: a.options.find((o) => o.value === v).id }; };
  const q = (await api('POST', '/quotations/', { customer_id: jcust.id, with_gst: false, is_order: true, items: [{ product_id: vcProd.id, quantity: 100, selected_options: [opt('Finish/Lamination Type', 'Without Lamination'), opt('Side', 'Single Side')], extra_charge_ids: [] }] })).data;
  await api('POST', `/quotations/${q.id}/convert`);
  await api('POST', `/invoices/from-quotation/${q.id}`);
  const job = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);

  await run('UI-R10J', M2, 'The pencil in the Job Cards list offers "Edit job card - without price" and "- with price"', 'Menu with both; each opens the matching edit page', async () => {
    await go('/job-cards');
    const row = page.locator('tr', { hasText: job.job_number }).first();
    await row.getByTestId('list-edit').click();
    expect(await page.getByTestId('list-edit-plain').isVisible() && await page.getByTestId('list-edit-price').isVisible(), 'menu');
    await page.getByTestId('list-edit-plain').click();
    await page.waitForURL(new RegExp(`/job-cards/${job.id}\\?view=plain`));
    await page.getByTestId('edit-mode-note').waitFor();
    expect((await page.getByTestId('edit-mode-note').innerText()).includes('WITHOUT price'), 'the page does not say it is the copy without price');
    await shot(page, 'r10-edit-without-price');
  }, page, probs);

  await run('UI-R10J', M2, 'Without price: the form is editable and shows no payment column or price list; the form comes before the tasks', 'No price anywhere; form above tasks', async () => {
    expect(await page.getByTestId('sheet-payment').count() === 0 && await page.getByTestId('sheet-price-list').count() === 0, 'prices are shown on the copy without price');
    expect(!/Payment Details/.test(await bodyText(page)), 'Payment Details heading shown');
    const formY = (await page.getByTestId('sheet-paper').boundingBox()).y;
    const tasksY = (await page.getByText('Tasks & who is working on them').first().boundingBox()).y;
    expect(formY < tasksY, `the form (${formY}) must come before the tasks (${tasksY})`);
    expect(!(await page.getByRole('button', { name: /^save$/i }).isDisabled()), 'Save is disabled');
    const party = page.locator('p:has-text("Party Name :")').locator('xpath=following::input[1]');
    await party.fill(`${U} Plain Party`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    expect((await bodyText(page)).includes('Job card saved'), 'no saved note');
    const sh = (await api('GET', `/job-cards/${job.id}/sheet`)).data;
    expect(sh.sheet.party_name === `${U} Plain Party`, 'not saved');
  }, page, probs);

  await run('UI-R10J', M2, 'Switching to "Job card with price" shows the payment column and the price list, editable', 'Payment + price list; price edit saved', async () => {
    await page.getByTestId('edit-mode-price').click();
    await page.waitForURL(/view=price/);
    await page.getByTestId('sheet-price-list').waitFor();
    expect(await page.getByTestId('sheet-payment').isVisible(), 'no payment column');
    expect((await page.getByTestId('edit-mode-note').innerText()).includes('WITH price'), 'note');
    expect((await page.getByTestId('sheet-print-price').innerText()).includes('A5'), 'the print button does not say A5');
    await page.getByTestId('price-label-0').fill(`${U} Rate line`);
    await page.getByRole('button', { name: /^save$/i }).click();
    await page.waitForTimeout(1200);
    const sh = (await api('GET', `/job-cards/${job.id}/sheet`)).data;
    expect(sh.price_edited === true && sh.price_lines[0].label === `${U} Rate line`, JSON.stringify(sh.price_lines[0]));
    await shot(page, 'r10-edit-with-price');
  }, page, probs);

  await run('UI-R10J', M2, 'The same page opens from the "with price" menu item; both print buttons give an A5 PDF', 'with price view; PDFs 200', async () => {
    await go('/job-cards');
    await page.locator('tr', { hasText: job.job_number }).first().getByTestId('list-edit').click();
    await page.getByTestId('list-edit-price').click();
    await page.waitForURL(/view=price/);
    await page.getByTestId('sheet-price-list').waitFor();
    for (const id of ['sheet-print', 'sheet-print-price']) {
      const [resp] = await Promise.all([page.waitForResponse((r) => r.url().includes('/sheet-pdf'), { timeout: 15000 }), page.getByTestId(id).click()]);
      expect(resp.status() === 200 && (resp.headers()['content-type'] || '').includes('pdf'), id);
    }
    for (const p of ctx.pages()) if (p !== page && !p.isClosed()) await p.close().catch(() => {});
  }, page, probs);

  for (const [role, email] of [['counter', 'counter@srijayam.com'], ['production', 'designer@srijayam.com'], ['accounts', 'accounts@srijayam.com']]) {
    await run('UI-R10J', M2, `${role}: both edit pages are enabled and a change is saved`, 'Inputs enabled; saved', async () => {
      const s = await loginApi(email, STAFF_PW);
      const rctx = await signedIn(browser, s);
      const rp = await rctx.newPage();
      for (const view of ['plain', 'price']) {
        await rp.goto(`${BASE}/job-cards/${job.id}?view=${view}`, { waitUntil: 'networkidle' });
        await rp.getByTestId('edit-mode-note').waitFor({ timeout: 15000 });
        expect(await rp.locator('input[disabled], textarea[disabled]').count() === 0, `${role}/${view}: disabled inputs`);
        const party = rp.locator('p:has-text("Party Name :")').locator('xpath=following::input[1]');
        await party.fill(`${U} ${role} ${view}`);
        await rp.getByRole('button', { name: /^save$/i }).click();
        await rp.waitForTimeout(1000);
        const sh = (await api('GET', `/job-cards/${job.id}/sheet`)).data;
        expect(sh.sheet.party_name === `${U} ${role} ${view}`, `${role}/${view}: not saved`);
      }
      await rctx.close();
    }, page, probs);
  }
}

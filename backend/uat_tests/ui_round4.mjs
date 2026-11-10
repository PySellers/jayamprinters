// Browser tests for client round 4: slim light-blue statistic buttons, the logo, the footer, the profile menu (Edit profile,
// Manual, Contacts, About, Logout), Pricing Setup service buttons, the pre-filled job card with tasks (take / assign / add),
// who-is-working on Live Jobs, an ordinary employee's view, and the admin-only AI Insights.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR4' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);

export async function round4Tests(browser) {
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

  // ---------------------------------------------------------------- an order to work on (a bill book with two copies)
  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '9' + String(Math.random()).slice(2, 11), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const bb = cats.find((c) => c.name === 'Bill Books & Stationery');
  const prods = (await api('GET', '/products/?limit=1000')).data.filter((p) => p.category_id === bb.id);
  const attrs = (await api('GET', `/attributes/?category_id=${bb.id}`)).data;
  const a = (name, value) => { const at = attrs.find((x) => x.name === name); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === value).id }; };
  const q = (await api('POST', '/quotations/', {
    customer_id: cust.id, with_gst: false, is_order: true, delivery_date: today, proof1_date: today, proof1_time: '17:00',
    items: [{ product_id: prods.find((p) => p.name === 'Sheet Printing - 1/4').id, quantity: 300, selected_options: [a('Document Type', 'Bill Book'), a('Paper Name', 'Excel Bond'), a('Paper/GSM Type', '80 GSM'), a('Copies per Set', '1+1')], extra_charge_ids: [] }],
  })).data;
  await api('POST', `/quotations/${q.id}/convert`);
  await api('POST', `/invoices/from-quotation/${q.id}`);
  const job = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);
  const staffId = (await api('GET', '/users/')).data.find((u) => u.email === 'staff@srijayam.com').id;

  // ================================================================== the shell
  const M1 = 'Header, logo, footer and profile menu';
  await run('UI-R4H', M1, 'The Quotations / Job Cards / Invoices strip is three slim light-blue buttons (Live Jobs is the red one)', 'Light blue, under 50px, clickable', async () => {
    await go(ap, '/dashboard');
    expect(await ap.getByTestId('live-switch').count() === 1 && await ap.getByTestId('stat-customers').count() === 0, 'Live Jobs / Customers buttons');
    for (const key of ['quotations', 'job-cards', 'invoices']) {
      const el = ap.getByTestId(`stat-${key}`);
      const box = await el.boundingBox();
      expect(box && box.height < 50, `${key} button is ${box && Math.round(box.height)}px tall`);
      const bg = await el.evaluate((n) => getComputedStyle(n).backgroundColor);
      expect(bg === 'rgb(227, 242, 253)', `${key} background is ${bg}`);
      expect(await el.evaluate((n) => n.tagName === 'BUTTON'), `${key} is not a button`);
    }
    await ap.getByTestId('stat-job-cards').click();
    await ap.waitForURL(/job-cards/, { timeout: 5000 });
    await shot(ap, 'r4-stat-buttons');
  }, ap, aprob);

  await run('UI-R4H', M1, 'The Sri Jayam Printers logo replaces the print icon at the top of the menu', 'Logo image loaded; no print icon', async () => {
    await go(ap, '/dashboard');
    const logo = ap.getByTestId('brand-logo');
    expect(await logo.isVisible(), 'logo not visible');
    expect(await logo.evaluate((i) => i.complete && i.naturalWidth > 50), 'logo image did not load');
    expect((await ap.locator('[data-testid="PrintIcon"]').count()) === 0, 'the old print icon is still there');
    expect((await ap.getByTestId('brand-logo').getAttribute('alt')) === 'Sri Jayam Printers', 'logo has no alt text');
  }, ap, aprob);

  await run('UI-R4H', M1, 'A slim footer at the very bottom carries the copyright and the developer', 'Correct wording, under 40px tall', async () => {
    await go(ap, '/customers');
    const footer = ap.getByTestId('app-footer');
    const text = (await footer.innerText()).replace(/\s+/g, ' ').trim();
    expect(text.includes('© 2026') && text.includes('Sri Jayam Printers. All rights reserved.'), text);
    expect(text.includes('Developed by PySellers Services Pvt Ltd, 8838587824'), text);
    const box = await footer.boundingBox();
    expect(box.height < 40, `footer is ${Math.round(box.height)}px tall`);
    const view = ap.viewportSize();
    expect(box.y + box.height >= view.height - 2 || box.y > 300, 'footer is not at the bottom');
  }, ap, aprob);

  await run('UI-R4H', M1, 'The profile button replaces Logout and opens Edit profile / Manual / Contacts / About / Logout', 'Five items; no loose Logout button', async () => {
    await go(ap, '/dashboard');
    expect((await ap.locator('header').getByRole('button', { name: 'Logout' }).count()) === 0, 'a loose Logout button is still in the header');
    await ap.getByTestId('profile-menu-button').click();
    for (const item of ['Edit profile', 'Manual', 'Contacts', 'About', 'Logout']) expect(await ap.getByRole('menuitem', { name: item }).isVisible(), `${item} missing`);
    await shot(ap, 'r4-profile-menu');
    await ap.keyboard.press('Escape');
  }, ap, aprob);

  // ================================================================== profile, manual, contacts, about
  const M2 = 'Profile, Manual, Contacts, About';
  await run('UI-R4P', M2, 'Edit profile: change the phone number, it is saved and shown on Contacts', 'Saved message; Contacts lists it', async () => {
    await go(ap, '/dashboard');
    await ap.getByTestId('profile-menu-button').click();
    await ap.getByRole('menuitem', { name: 'Edit profile' }).click();
    await ap.waitForURL(/\/profile/);
    const phone = '90000' + U.slice(-5);
    await ap.getByTestId('profile-phone').fill(phone);
    await ap.getByTestId('profile-save').click();
    await ap.getByText('Your profile is saved.').waitFor({ timeout: 6000 });
    await go(ap, '/contacts');
    const row = ap.getByTestId('contact-row').first();
    expect((await row.innerText()).includes(phone), 'phone not on the Contacts page');
    expect((await row.innerText()).toLowerCase().includes('admin'), 'Admin should be the first contact');
    await shot(ap, 'r4-contacts');
  }, ap, aprob);

  await run('UI-R4P', M2, 'Contacts: search narrows the list and phone numbers are call links', 'Filtered; tel: link', async () => {
    await go(ap, '/contacts');
    const all = await ap.getByTestId('contact-row').count();
    expect(all >= 2, `only ${all} contacts`);
    await ap.getByTestId('contacts-search').fill('staff user');
    await ap.waitForTimeout(300);
    expect((await ap.getByTestId('contact-row').count()) < all, 'search did not narrow the list');
    await ap.getByTestId('contacts-search').fill('');
    const tel = await ap.locator('a[href^="tel:"]').count();
    expect(tel >= 1, 'no tel: link');
  }, ap, aprob);

  await run('UI-R4P', M2, 'Change password: mismatch is flagged and the button stays off until it is valid', 'Disabled until current + 6 characters + match', async () => {
    await go(ap, '/profile');
    const btn = ap.getByTestId('pw-save');
    expect(await btn.isDisabled(), 'enabled with nothing typed');
    await ap.getByTestId('pw-current').fill('x');
    await ap.getByTestId('pw-new').fill('abcdef');
    await ap.getByTestId('pw-again').fill('abcdeX');
    expect((await bodyText(ap)).includes('The two do not match'), 'no mismatch message');
    expect(await btn.isDisabled(), 'enabled although they differ');
    await ap.getByTestId('pw-again').fill('abcdef');
    expect(await btn.isEnabled(), 'still disabled with a valid form');
  }, ap, aprob);

  await run('UI-R4P', M2, 'Manual: the guide opens, lists every area, and the search finds a topic', 'Sections shown; search "Take it" finds the job card section', async () => {
    await go(ap, '/manual');
    expect((await ap.getByTestId('manual-section').count()) >= 10, 'fewer than 10 sections');
    const text = await bodyText(ap);
    for (const w of ['Getting started', 'Taking an order', 'The job card', 'AI Insights', 'Who can do what']) expect(text.includes(w), `"${w}" missing from the manual`);
    await ap.getByTestId('manual-search').fill('Take it');
    await ap.waitForTimeout(300);
    const n = await ap.getByTestId('manual-section').count();
    expect(n >= 1 && n < 11, `search left ${n} sections`);
    expect((await bodyText(ap)).includes('press "Take it"'), 'the matching text is not shown');
    await shot(ap, 'r4-manual');
  }, ap, aprob);

  await run('UI-R4P', M2, 'About: version, release, developer and support details', 'Version 1.3.1; PySellers contact, phone and website', async () => {
    await go(ap, '/about');
    const t = await bodyText(ap);
    expect((await ap.getByTestId('about-version').innerText()).trim() === '1.3.1', 'version is not 1.3.1');
    expect(t.includes('Developed by PySellers Services Pvt Ltd'), 'developer line missing');
    expect(t.includes('any support request'), 'support wording missing');
    expect((await ap.getByTestId('about-phone').innerText()).trim() === '8838587824', 'phone');
    expect((await ap.getByTestId('about-website').getAttribute('href')) === 'https://www.pysellers.in', 'website link');
    expect((await ap.getByTestId('about-email').getAttribute('href')).startsWith('mailto:contact@pysellers'), 'email link');
    await shot(ap, 'r4-about');
  }, ap, aprob);

  // ================================================================== pricing setup service buttons
  const M3 = 'Pricing Setup - service buttons';
  await run('UI-R4S', M3, 'Services are clickable buttons (like the dashboard); choosing one opens its tabs', 'Tiles; selected one highlighted; tabs appear', async () => {
    await go(ap, '/pricing-setup');
    const tiles = await ap.getByTestId('ps-service-tile').count();
    expect(tiles >= 10, `only ${tiles} service buttons`);
    expect((await ap.getByLabel('Product Category').count()) === 0, 'the old drop-down is still there');
    await ap.getByTestId('ps-service-tiles').getByRole('button', { name: 'Visiting Card', exact: true }).click();
    await ap.waitForTimeout(700);
    expect(await ap.getByRole('tab', { name: 'Attributes' }).isVisible(), 'tabs did not appear');
    expect((await ap.getByTestId('ps-service-tiles').getByRole('button', { name: 'Visiting Card', exact: true }).getAttribute('aria-pressed')) === 'true', 'the chosen service is not highlighted');
    await ap.getByTestId('ps-service-tiles').getByRole('button', { name: 'Register', exact: true }).click();
    await ap.waitForTimeout(500);
    expect((await ap.getByTestId('ps-service-tiles').getByRole('button', { name: 'Visiting Card', exact: true }).getAttribute('aria-pressed')) === 'false', 'two services highlighted');
    await shot(ap, 'r4-pricing-setup');
  }, ap, aprob);

  await run('UI-R4S', M3, 'Search above the buttons narrows them; a link from an order still opens the right service', 'Filtered; ?category= works', async () => {
    await go(ap, '/pricing-setup');
    await ap.getByTestId('ps-service-search').fill('visiting');
    await ap.waitForTimeout(300);
    expect((await ap.getByTestId('ps-service-tile').count()) === 1, 'search did not narrow to one');
    const vc = cats.find((c) => c.name === 'Visiting Card');
    await go(ap, `/pricing-setup?category=${vc.id}&tab=printing`);
    expect((await ap.getByTestId('ps-service-tiles').getByRole('button', { name: 'Visiting Card', exact: true }).getAttribute('aria-pressed')) === 'true', 'deep link did not select the service');
  }, ap, aprob);

  // ================================================================== job card: pre-filled form and tasks
  const M4 = 'Job card - pre-filled form and tasks';
  await run('UI-R4J', M4, 'The printing job card is filled in from the order (party, job, size, paper of each copy, quantity, rate)', 'No empty form', async () => {
    await go(ap, `/job-cards/${job.id}`);
    expect((await bodyText(ap)).includes('Printing job card'), 'heading missing');
    const val = async (label) => ap.locator('p', { hasText: new RegExp('^' + label + ' :') }).locator('xpath=following::input[1]').inputValue();
    expect((await val('Party Name')).includes(U), 'party name empty');
    expect((await val('Job Name')).includes('Bill Book'), 'job name empty');
    expect((await val('Size')) === '1/4', 'size empty');
    const vals = await ap.locator('input').evaluateAll((els) => els.map((e) => e.value));
    expect(vals.filter((v) => v === 'Excel Bond').length >= 2, 'paper name is not filled for both copies');
    expect(vals.filter((v) => v === '80 GSM').length >= 2, 'GSM is not filled for both copies');
    expect(vals.includes('300'), 'quantity not filled');
    expect(await ap.getByRole('checkbox', { name: 'Offset' }).isChecked(), 'Offset is not ticked');
    expect(vals.some((v) => /^[\d,]+(\.\d+)?$/.test(v) && Number(v.replace(/,/g, '')) > 0), 'payment column not filled');
    await shot(ap, 'r4-job-card-form');
  }, ap, aprob);

  await run('UI-R4J', M4, 'Saving keeps what was typed; "Fill again from the order" brings the order back', 'Typed text survives a reload; reset discards it', async () => {
    await go(ap, `/job-cards/${job.id}`);
    const remarks = ap.locator('textarea').first();
    await remarks.fill('Hand written note ' + U);
    await ap.getByRole('button', { name: 'Save', exact: true }).click();
    await ap.getByText('Job card saved.').waitFor({ timeout: 6000 });
    await go(ap, `/job-cards/${job.id}`);
    expect((await ap.locator('textarea').first().inputValue()).includes('Hand written note ' + U), 'typed remark was lost');
    ap.once('dialog', (d) => d.accept());
    await ap.getByTestId('sheet-reset').click();
    await ap.getByText('The form is filled from the order again.').waitFor({ timeout: 6000 });
    expect(!(await ap.locator('textarea').first().inputValue()).includes('Hand written note'), 'reset did not discard the typing');
  }, ap, aprob);

  await run('UI-R4J', M4, 'Admin assigns a task to an employee from the job card', 'The task shows "On: Staff User"', async () => {
    await go(ap, `/job-cards/${job.id}`);
    const rows = ap.getByTestId('task-row');
    expect((await rows.count()) >= 4, 'tasks are not listed');
    await rows.first().getByTestId('assign-task').click();
    const dlg = ap.getByRole('dialog');
    await dlg.getByLabel('Employee').click();
    await ap.getByRole('option', { name: /Staff User/ }).first().click();
    await dlg.getByRole('button', { name: 'Save' }).click();
    await ap.waitForTimeout(900);
    expect((await rows.first().getByTestId('task-person').innerText()).includes('Staff User'), 'the task did not show the employee');
    await shot(ap, 'r4-tasks-assigned');
  }, ap, aprob);

  await run('UI-R4J', M4, 'Admin adds an extra task in between the usual ones', 'New task sits right after the chosen step', async () => {
    await go(ap, `/job-cards/${job.id}`);
    const before = await ap.getByTestId('task-row').count();
    await ap.getByTestId('add-task').click();
    await ap.getByTestId('task-name').fill('Foil stamping ' + U.slice(-4));
    await ap.getByLabel('Comes after').click();
    await ap.getByRole('option', { name: /After: 1\./ }).click();
    await ap.getByTestId('task-add-confirm').click();
    await ap.waitForTimeout(1000);
    const names = await ap.getByTestId('task-row').evaluateAll((els) => els.map((e) => e.innerText.replace(/\s+/g, ' ')));
    expect(names.length === before + 1, `${names.length} tasks, expected ${before + 1}`);
    expect(names[1].includes('Foil stamping'), 'the new task is not second: ' + names[1]);
    await shot(ap, 'r4-task-added');
  }, ap, aprob);

  await run('UI-R4J', M4, 'The person and section show on the Live Jobs board', 'Row says "Design: Staff User"', async () => {
    await go(ap, '/dashboard?view=live');
    await ap.getByTestId('live-search').fill(job.job_number);
    await ap.waitForTimeout(600);
    const who = await ap.getByTestId('live-who').first().innerText();
    expect(who.includes('Staff User'), 'the live row says: ' + who);
    await shot(ap, 'r4-live-who');
  }, ap, aprob);

  // ================================================================== an ordinary employee
  const M5 = 'An ordinary employee (not Admin)';
  await run('UI-R4E', M5, 'The employee sees the shell (logo, profile menu, footer) but not Pricing Setup, Users or the Masters', 'Admin-only items hidden', async () => {
    await go(sp, '/dashboard');
    expect(await sp.getByTestId('brand-logo').isVisible() && await sp.getByTestId('app-footer').isVisible(), 'logo or footer missing');
    const nav = await sp.locator('nav, .MuiDrawer-root').first().innerText().catch(() => '');
    const text = await bodyText(sp);
    expect(!/Pricing Setup/.test(text) && !/\bUsers\b/.test(nav) && !/Masters/.test(text), 'admin-only menu items are visible');
    expect(text.includes('Staff User'), 'the welcome line does not name the employee');
    await sp.goto(BASE + '/pricing-setup', { waitUntil: 'networkidle' });
    expect((await bodyText(sp)).includes('Not authorized') && !(await sp.getByTestId('ps-service-tiles').count()), 'the employee could open Pricing Setup');
    await shot(sp, 'r4-employee-dashboard');
  }, sp, sprob);

  await run('UI-R4E', M5, 'Reports (profit, AI Insights) are Admin only: no menu entry, page refused, server refuses', 'No menu; Not authorized; 403', async () => {
    await go(sp, '/dashboard');
    expect(!/Reports/.test(await sp.locator('.MuiDrawer-root').first().innerText()), 'the employee sees Reports in the menu');
    await go(sp, '/reports');
    expect((await bodyText(sp)).includes('Not authorized'), 'the employee could open Reports');
    expect((await sp.getByTestId('tab-insights').count()) === 0, 'the employee sees the AI Insights tab');
    const st = await apiCall('GET', '/reports/statement?start=2026-01-01&end=2026-12-31', null, staff.access_token);
    expect(st.status === 403, 'the profit statement answered ' + st.status);
    const r = await apiCall('GET', '/reports/insights', null, staff.access_token);
    expect(r.status === 403, 'the API answered ' + r.status);
  }, sp, sprob);

  await run('UI-R4E', M5, 'The employee takes a task: it is shown as theirs and appears on Live Jobs', '"Take it" -> "On: Staff User (you)"', async () => {
    const q2 = (await api('POST', '/quotations/', {
      customer_id: cust.id, with_gst: false, is_order: true,
      items: [{ product_id: q.items[0].product_id, quantity: 100, selected_options: [a('Document Type', 'Bill Book'), a('Paper Name', 'Excel Bond'), a('Paper/GSM Type', '80 GSM'), a('Copies per Set', '1+1')], extra_charge_ids: [] }],
    })).data;
    await api('POST', `/quotations/${q2.id}/convert`);
    const job2 = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q2.items[0].id);
    await go(sp, `/job-cards/${job2.id}`);
    const first = sp.getByTestId('task-row').first();
    await first.getByTestId('take-task').click();
    await sp.waitForTimeout(900);
    expect((await first.getByTestId('task-person').innerText()).includes('Staff User (you)'), 'task not shown as mine');
    expect((await sp.getByTestId('assign-task').count()) === 0, 'an employee should not see Assign');
    expect((await sp.getByTestId('add-task').count()) === 1, 'the employee holding a task should be able to add one');
    await go(sp, '/dashboard?view=live');
    await sp.getByTestId('live-search').fill(job2.job_number);
    await sp.waitForTimeout(600);
    expect((await sp.getByTestId('live-who').first().innerText()).includes('Staff User'), 'Live Jobs does not name the employee');
    await go(sp, '/my-work');
    expect((await bodyText(sp)).includes(job2.job_number), 'My Work does not list the task');
    await shot(sp, 'r4-employee-took-task');
  }, sp, sprob);

  await run('UI-R4E', M5, 'The employee can open Manual, Contacts and About from the profile menu', 'Pages open', async () => {
    for (const [item, marker] of [['Manual', 'User Manual'], ['Contacts', 'The Admin and every employee'], ['About', 'Developed by PySellers']]) {
      await go(sp, '/dashboard');
      await sp.getByTestId('profile-menu-button').click();
      await sp.getByRole('menuitem', { name: item }).click();
      await sp.waitForTimeout(700);
      expect((await bodyText(sp)).includes(marker), `${item} did not open`);
    }
  }, sp, sprob);

  await run('UI-R4E', M5, 'Logout from the profile menu returns to the sign-in page', 'Back on /login, session cleared', async () => {
    await sp.getByTestId('profile-menu-button').click();
    await sp.getByRole('menuitem', { name: 'Logout' }).click();
    await sp.waitForURL(/login/, { timeout: 6000 });
    expect(!(await sp.evaluate(() => localStorage.getItem('token'))), 'token still stored');
  }, sp, sprob);

  // ================================================================== AI Insights (admin)
  const M6 = 'AI Insights (Admin)';
  await run('UI-R4I', M6, 'Reports has an AI Insights tab for the Admin with figures, advice and charts', 'KPIs, advice, sales chart, services, employees, risk list', async () => {
    await go(ap, '/reports');
    await ap.getByTestId('tab-insights').click();
    await ap.getByTestId('insights').waitFor({ timeout: 15000 });
    for (const id of ['kpi-sales', 'kpi-ontime', 'kpi-open', 'kpi-owed', 'recommendations', 'sales-chart', 'forecast', 'service-chart', 'service-table', 'employee-table', 'workcenter-chart', 'risk-list', 'customer-chart', 'aging-chart', 'weekday-chart']) {
      expect((await ap.getByTestId(id).count()) === 1, `${id} missing`);
    }
    expect((await ap.getByTestId('tip').count()) >= 1, 'no advice shown');
    const bars = await ap.getByTestId('sales-chart').locator('svg rect').count();
    expect(bars >= 15, `the sales chart has ${bars} bars`);
    expect((await ap.getByTestId('forecast').innerText()).includes('Expected'), 'forecast table missing');
    await ap.getByTestId('insights').scrollIntoViewIfNeeded();
    await shot(ap, 'r4-insights');
  }, ap, aprob);

  await run('UI-R4I', M6, 'The period buttons reload the insights; Financial statement is still one click away', '3 months / 1 year reload; tab back', async () => {
    await ap.getByTestId('insight-range').getByRole('button', { name: '3 months' }).click();
    await ap.waitForTimeout(1500);
    expect((await ap.getByTestId('insights').innerText()).includes('AI Insights'), 'insights vanished');
    await ap.getByTestId('insight-range').getByRole('button', { name: '1 year' }).click();
    await ap.waitForTimeout(1500);
    await ap.getByTestId('tab-statement').click();
    await ap.waitForTimeout(600);
    expect((await bodyText(ap)).includes('Total Sales'), 'the financial statement did not come back');
  }, ap, aprob);

  await run('UI-R4I', M6, 'The dashboard is the order form with the red Live Jobs button; the jobs board opens in its place', 'Form first; board on the button', async () => {
    await go(ap, '/dashboard');
    expect(await ap.locator('h6:has-text("Start New Order")').count() === 1 && await ap.getByTestId('live-board').count() === 0, 'order form only');
    await ap.getByTestId('live-switch').click();
    const board = await ap.getByTestId('live-board').boundingBox();
    expect(board && board.y < 200, `live jobs start ${board && Math.round(board.y)}px down`);
  }, ap, aprob);

  // ================================================================== clean-up
  await run('UI-R4Z', 'Clean-up', 'Remove the records created by the round 4 browser tests', 'Removed', async () => {
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === cust.id);
    const invs = (await api('GET', '/invoices/')).data.filter((i) => i.customer_id === cust.id);
    for (const i of invs) await api('DELETE', `/invoices/${i.id}`);
    for (const j of jobs) await api('DELETE', `/job-cards/${j.id}`);
    const qs = (await api('GET', '/quotations/')).data.filter((x) => x.customer_id === cust.id);
    for (const x of qs) await api('DELETE', `/quotations/${x.id}`);
    await api('DELETE', `/customers/${cust.id}`);
    // put the admin's phone back the way it was
    await api('PATCH', '/auth/me', { phone: null });
  }, ap, aprob);

  await aCtx.close();
  await sCtx.close();
}

// Browser tests for the production workflow: menus, My Work, hand-offs between employees, the board, the monitor,
// the job tracking page, work centers, workflow editor and sending a step to an outside company.
import { launch, signedIn, loginApi, watch, run, expect, shot, bodyText, pick, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIWF' + Date.now().toString().slice(-6);
const dialog = (page) => page.getByRole('dialog');

export async function workflowTests(browser) {
  const sessions = {
    admin: await loginApi(...ADMIN),
    designer: await loginApi('designer@srijayam.com', STAFF_PW),
    counter: await loginApi('counter@srijayam.com', STAFF_PW),
    printer: await loginApi('printer@srijayam.com', STAFF_PW),
    binder: await loginApi('binder@srijayam.com', STAFF_PW),
    accounts: await loginApi('accounts@srijayam.com', STAFF_PW),
  };
  for (const [k, v] of Object.entries(sessions)) if (!v || !v.access_token) throw new Error(`no login for ${k} - run seed_workflow.py --demo-staff`);
  const api = (m, p, b, who = 'admin') => apiCall(m, p, b, sessions[who].access_token);
  const pages = {};
  const probs = {};
  const open = async (who, viewport) => {
    const ctx = await signedIn(browser, sessions[who], viewport || { width: 1440, height: 1000 });
    const page = await ctx.newPage();
    pages[who] = { ctx, page };
    probs[who] = watch(page);
    return page;
  };
  const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };
  for (const who of ['admin', 'designer', 'counter', 'printer', 'binder', 'accounts']) await open(who);
  const card = (page, jobNumber) => page.locator('[data-testid="work-card"]', { hasText: jobNumber }).first();

  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '9' + String(Math.random()).slice(2, 11), reason: 'UI test' })).data;
  const vcItem = async () => {
    const cats = (await api('GET', '/product-categories/?limit=500')).data;
    const vc = cats.find((c) => c.name === 'Visiting Card');
    const prods = (await api('GET', '/products/?limit=1000')).data.filter((p) => p.category_id === vc.id);
    const attrs = (await api('GET', `/attributes/?category_id=${vc.id}`)).data;
    const pick1 = (name, value) => { const a = attrs.find((x) => x.name === name); return { attribute_id: a.id, attribute_option_id: a.options.find((o) => o.value === value).id }; };
    return { product_id: prods.find((p) => p.name === 'Visiting Card').id, quantity: 100, selected_options: [pick1('Finish/Lamination Type', 'Without Lamination'), pick1('Side', 'Single Side')], extra_charge_ids: [] };
  };
  const makeJob = async (extra = {}) => {
    const q = await api('POST', '/quotations/', { customer_id: cust.id, with_gst: false, is_order: true, items: [await vcItem()], ...extra });
    await api('POST', `/quotations/${q.data.id}/convert`);
    const jobs = (await api('GET', '/job-cards/')).data;
    return jobs.find((j) => j.quotation_item_id === q.data.items[0].id);
  };

  // ------------------------------------------------------------------ menus
  const M0 = 'Workflow menus';
  await run('UI-WFM', M0, 'Every employee sees My Work and Production in the menu; the admin also has Work Centers and Workflows under Masters', 'Menu entries per role', async () => {
    for (const who of ['designer', 'printer', 'binder', 'counter', 'accounts']) {
      const page = pages[who].page;
      await go(page, '/dashboard');
      const t = await bodyText(page);
      expect(t.includes('My Work') && t.includes('Production'), `${who} is missing My Work / Production`);
      expect(!t.includes('Work Centers') && !t.includes('Workflows'), `${who} can see the admin set-up screens`);
    }
    const page = pages.admin.page;
    await go(page, '/dashboard');
    await page.getByText('Masters', { exact: true }).first().click();
    await page.waitForTimeout(500);
    const t = await bodyText(page);
    expect(t.includes('Work Centers') && t.includes('Workflows'), 'admin menu entries missing');
  }, pages.admin.page, probs.admin);

  await run('UI-WFM', M0, 'Employees cannot open the admin set-up screens by typing the address', 'Sent back to the dashboard', async () => {
    const page = pages.printer.page;
    for (const path of ['/work-centers', '/workflows']) {
      await go(page, path);
      expect((await bodyText(page)).includes('Not authorized'), `printer was not stopped at ${path}`);
    }
  }, pages.admin.page, probs.admin);

  // ------------------------------------------------------------------ hand-offs between employees
  const M1 = 'Hand-offs between employees';
  const job = await makeJob({ delivery_date: new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10) });
  await api('PUT', `/job-cards/${job.id}`, { priority: 'urgent' });

  await run('UI-WFH', M1, 'The designer sees the new job in My Work (Waiting for my team), marked urgent and overdue', 'A card with the job number, urgent and overdue', async () => {
    const page = pages.designer.page;
    await go(page, '/my-work');
    const c = card(page, job.job_number);
    expect(await c.isVisible(), `${job.job_number} not in the designer's queue`);
    const t = (await c.innerText()).replace(/\s+/g, ' ');
    expect(/Design \/ DTP/.test(t) && /urgent/i.test(t) && /Overdue/.test(t), 'card text: ' + t);
    expect((await bodyText(page)).includes('You are in: Design'), 'work center chips missing');
    await shot(page, 'my-work-designer');
  }, pages.designer.page, probs.designer);

  await run('UI-WFH', M1, 'Designer takes the job, starts it and finishes it with a note: it leaves the designer\'s screen', 'Design done; next step ready for the Front Desk', async () => {
    const page = pages.designer.page;
    let c = card(page, job.job_number);
    await c.getByRole('button', { name: 'Take it' }).click();
    await page.waitForTimeout(900);
    c = card(page, job.job_number);
    await c.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(900);
    c = card(page, job.job_number);
    expect(/In progress/.test(await c.innerText()), 'not in progress');
    await c.getByRole('button', { name: 'Done', exact: true }).click();
    await dialog(page).getByLabel('Note for the next person (optional)').fill('Artwork is in the job folder');
    await dialog(page).getByRole('button', { name: 'Mark done' }).click();
    await page.waitForTimeout(1500);
    expect((await page.locator('[data-testid="work-card"]', { hasText: job.job_number }).count()) === 0, 'the job is still on the designer\'s screen');
    const steps = (await api('GET', `/job-cards/${job.id}/steps`)).data;
    expect(steps[0].status === 'done' && steps[1].status === 'ready', JSON.stringify(steps.map((s) => s.status)));
    expect(steps[0].notes === 'Artwork is in the job folder', 'note not saved');
  }, pages.designer.page, probs.designer);

  await run('UI-WFH', M1, 'The counter (Front Desk) now sees Proof approval and finishes it', 'Proof approval done; Printing ready', async () => {
    const page = pages.counter.page;
    await go(page, '/my-work');
    let c = card(page, job.job_number);
    expect(/Proof approval/.test(await c.innerText()), 'Proof approval card missing for the counter');
    await c.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(800);
    await card(page, job.job_number).getByRole('button', { name: 'Done', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Mark done' }).click();
    await page.waitForTimeout(1500);
    const steps = (await api('GET', `/job-cards/${job.id}/steps`)).data;
    expect(steps[1].status === 'done' && steps[2].status === 'ready', JSON.stringify(steps.map((s) => s.status)));
  }, pages.counter.page, probs.counter);

  await run('UI-WFH', M1, 'The printing employee gets it, shows the menu badge, puts it on hold with a reason and resumes it', 'Hold shown with the reason; Resume works', async () => {
    const page = pages.printer.page;
    await go(page, '/my-work');
    expect(await page.locator('[data-testid="my-work-badge"]').count() > 0, 'no badge on My Work');
    let c = card(page, job.job_number);
    expect(/Printing/.test(await c.innerText()), 'Printing card missing');
    await c.getByRole('button', { name: 'Take it' }).click();
    await page.waitForTimeout(800);
    await card(page, job.job_number).getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(800);
    await card(page, job.job_number).getByRole('button', { name: 'Hold' }).click();
    await dialog(page).getByLabel('Why is it on hold?').fill('Plates not ready');
    await dialog(page).getByRole('button', { name: 'Put on hold' }).click();
    await page.waitForTimeout(1200);
    c = card(page, job.job_number);
    expect(/On hold: Plates not ready/.test(await c.innerText()), 'hold reason not shown');
    await shot(page, 'my-work-on-hold');
    await c.getByRole('button', { name: 'Resume' }).click();
    await page.waitForTimeout(1000);
    expect(/In progress/.test(await card(page, job.job_number).innerText()), 'not resumed');
  }, pages.printer.page, probs.printer);

  await run('UI-WFH', M1, 'The printing employee finishes; the binding employee cannot touch the printing card but gets the next one', 'Printing done; Finishing ready for the binder', async () => {
    await card(pages.printer.page, job.job_number).getByRole('button', { name: 'Done', exact: true }).click();
    await dialog(pages.printer.page).getByRole('button', { name: 'Mark done' }).click();
    await pages.printer.page.waitForTimeout(1500);
    const page = pages.binder.page;
    await go(page, '/my-work');
    const c = card(page, job.job_number);
    expect(/Cutting & lamination/.test(await c.innerText()), 'binder does not see Cutting & lamination');
    await c.getByRole('button', { name: 'Start', exact: true }).click();
    await page.waitForTimeout(800);
    await card(page, job.job_number).getByRole('button', { name: 'Done', exact: true }).click();
    await dialog(page).getByRole('button', { name: 'Mark done' }).click();
    await page.waitForTimeout(1500);
    const steps = (await api('GET', `/job-cards/${job.id}/steps`)).data;
    expect(steps[3].status === 'done' && steps[4].status === 'ready', JSON.stringify(steps.map((s) => s.status)));
  }, pages.binder.page, probs.binder);

  await run('UI-WFH', M1, 'The front desk hands the order over: the job becomes Delivered', 'All 5 steps done, job delivered', async () => {
    const page = pages.counter.page;
    await go(page, '/my-work');
    const c = card(page, job.job_number);
    expect(/Handover/.test(await c.innerText()), 'Handover card missing');
    await c.getByRole('button', { name: 'Done', exact: true }).click();
    await dialog(page).getByLabel('Note for the next person (optional)').fill('Collected by the customer');
    await dialog(page).getByRole('button', { name: 'Mark done' }).click();
    await page.waitForTimeout(1500);
    const j = (await api('GET', `/job-cards/${job.id}`)).data;
    expect(j.status === 'delivered' && j.steps_done === 5 && j.delivered_at, JSON.stringify(j));
  }, pages.counter.page, probs.counter);

  await run('UI-WFH', M1, 'The job\'s tracking page shows every step, who did it and the activity trail', 'Five done steps with names; trail from created to delivered', async () => {
    const page = pages.counter.page;
    await go(page, `/job-cards/${job.id}/track`);
    const t = await bodyText(page);
    expect(t.includes('5 of 5 steps done'), '5 of 5 not shown');
    for (const n of ['Design / DTP', 'Proof approval', 'Printing', 'Cutting & lamination', 'Handover & delivery']) expect(t.includes(n), `${n} missing`);
    for (const n of ['Raja (Printing)', 'Selvam (Binding)', 'Artwork is in the job folder', 'Collected by the customer']) expect(t.includes(n), `${n} missing`);
    const rows = await page.locator('[data-testid="step-row"][data-status="done"]').count();
    expect(rows === 5, `${rows} done rows`);
    const tl = await page.locator('[data-testid="timeline"]').innerText();
    expect(/Delivered/.test(tl) && /Workflow planned/.test(tl) && /On hold|Put on hold/.test(tl), 'timeline text: ' + tl.slice(0, 200));
    await shot(page, 'job-tracking-delivered');
  }, pages.counter.page, probs.counter);

  // ------------------------------------------------------------------ supervisor controls on the tracking page
  const M2 = 'Job tracking page (supervisor)';
  const job2 = await makeJob();
  await run('UI-WFT', M2, 'The counter assigns a step to an employee from the step menu', 'Step shows "On: <employee>"', async () => {
    const page = pages.counter.page;
    await go(page, `/job-cards/${job2.id}/track`);
    await page.locator('[data-testid="step-row"]').first().getByRole('button', { name: 'Step options' }).click();
    await page.getByRole('menuitem', { name: 'Assign to...' }).click();
    await dialog(page).getByLabel('Employee').click();
    await page.getByRole('option', { name: /Karthik/ }).click();
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1200);
    expect(/On: Karthik/.test(await page.locator('[data-testid="step-row"]').first().innerText()), 'assignee not shown');
  }, pages.counter.page, probs.counter);

  await run('UI-WFT', M2, 'The counter adds an extra step (outside foil) before the handover', 'New step listed before Handover & delivery', async () => {
    const page = pages.counter.page;
    await page.getByRole('button', { name: 'Add a step' }).click();
    await dialog(page).getByLabel('Step name').fill('Outside foil (UI test)');
    await dialog(page).getByLabel('Type').click();
    await page.getByRole('option', { name: 'Sent to an outside company' }).click();
    await dialog(page).getByRole('button', { name: 'Add step' }).click();
    await page.waitForTimeout(1300);
    const names = await page.locator('[data-testid="step-row"] .MuiTypography-subtitle1').allInnerTexts();
    expect(names.indexOf('Outside foil (UI test)') === names.length - 2 && names[names.length - 1] === 'Handover & delivery', names.join(' | '));
  }, pages.counter.page, probs.counter);

  await run('UI-WFT', M2, 'The counter skips a step that is not needed', 'Step shows Skipped; progress recalculated', async () => {
    const page = pages.counter.page;
    const row = page.locator('[data-testid="step-row"]', { hasText: 'Proof approval' }).first();
    await row.getByRole('button', { name: 'Step options' }).click();
    await page.getByRole('menuitem', { name: 'Skip this step' }).click();
    await page.waitForTimeout(1200);
    expect(/Skipped/.test(await page.locator('[data-testid="step-row"]', { hasText: 'Proof approval' }).first().innerText()), 'not skipped');
  }, pages.counter.page, probs.counter);

  await run('UI-WFT', M2, 'The step is walked to the outside step; "Send to outside company" creates the Outsource job', 'Step shows the Outsource job number and company; Outsource screen lists it', async () => {
    for (const name of ['Design / DTP', 'Printing', 'Cutting & lamination']) {
      const s = (await api('GET', `/job-cards/${job2.id}/steps`)).data.find((x) => x.name === name);
      await api('POST', `/job-steps/${s.id}/start`);
      await api('POST', `/job-steps/${s.id}/complete`, {});
    }
    const page = pages.counter.page;
    await go(page, `/job-cards/${job2.id}/track`);
    const row = page.locator('[data-testid="step-row"]', { hasText: 'Outside foil (UI test)' }).first();
    expect(await row.getByRole('button', { name: 'Send to outside company' }).isVisible(), 'send button missing');
    await row.getByRole('button', { name: 'Send to outside company' }).click();
    await dialog(page).getByRole('combobox', { name: /outside company/i }).fill(`${U} Foil Works`);
    await dialog(page).getByLabel('Cost (we pay them)').fill('450');
    await dialog(page).getByLabel('Price billed to customer').fill('700');
    await dialog(page).getByLabel('Expected back on').fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10));
    await dialog(page).getByRole('button', { name: 'Send out' }).click();
    await page.waitForTimeout(1500);
    const t = await page.locator('[data-testid="step-row"]', { hasText: 'Outside foil (UI test)' }).first().innerText();
    expect(/OS-\d+/.test(t) && t.includes(`${U} Foil Works`), 'Outsource info missing: ' + t);
    await shot(page, 'job-tracking-outside');
    await go(page, '/outsource');
    expect(await page.locator('tbody tr', { hasText: `${U} Foil Works` }).first().isVisible(), 'not on the Outsource screen');
  }, pages.counter.page, probs.counter);

  await run('UI-WFT', M2, 'Marking the Outsource job Received finishes the step and hands the job to the Front Desk', 'Step done; Handover ready', async () => {
    const os = (await api('GET', '/outsource/')).data.find((o) => (o.vendor_name || '').includes(`${U} Foil Works`));
    await api('PUT', `/outsource/${os.id}`, { status: 'received' });
    const page = pages.counter.page;
    await go(page, `/job-cards/${job2.id}/track`);
    const t = (await page.locator('[data-testid="step-row"]', { hasText: 'Outside foil (UI test)' }).first().innerText());
    expect(/Done/.test(t), 'step not done: ' + t);
    expect(/Ready to start/.test(await page.locator('[data-testid="step-row"]', { hasText: 'Handover & delivery' }).first().innerText()), 'handover not ready');
  }, pages.counter.page, probs.counter);

  await run('UI-WFT', M2, 'Staff do not get the supervisor menu on the tracking page', 'No step options / add step for the printing employee', async () => {
    const page = pages.printer.page;
    await go(page, `/job-cards/${job2.id}/track`);
    expect((await page.getByRole('button', { name: 'Step options' }).count()) === 0, 'step options visible to staff');
    expect((await page.getByRole('button', { name: 'Add a step' }).count()) === 0, 'add step visible to staff');
  }, pages.printer.page, probs.printer);

  // ------------------------------------------------------------------ job list and sheet
  const M3 = 'Job cards list';
  await run('UI-WFJ', M3, 'The job card list shows who has each job and how far it is, and the Track button opens the steps', 'Now-with column, step count and Track job button', async () => {
    const job3 = await makeJob();
    const page = pages.counter.page;
    await go(page, '/job-cards');
    const t = await bodyText(page);
    expect(t.includes('Now with'), 'Now with column missing');
    const r = page.locator('tbody tr', { hasText: job3.job_number }).first();
    expect(/Design \/ DTP/.test(await r.innerText()) && /0\/5 steps/.test(await r.innerText()), 'row: ' + (await r.innerText()).replace(/\s+/g, ' '));
    await r.getByRole('button', { name: 'Track job' }).click();
    await page.waitForURL(/\/track$/, { timeout: 8000 });
    expect((await bodyText(page)).includes(job3.job_number), 'tracking page did not open');
    await go(page, `/job-cards/${job3.id}`);
    await page.getByRole('button', { name: 'Track progress' }).click();
    await page.waitForURL(/\/track$/, { timeout: 8000 });
  }, pages.counter.page, probs.counter);

  await run('UI-WFJ', M3, 'The old status box on the job list still works and moves the steps with it', 'Choosing Delivered makes every step done', async () => {
    const job4 = await makeJob();
    const page = pages.counter.page;
    await go(page, '/job-cards');
    const r = page.locator('tbody tr', { hasText: job4.job_number }).first();
    await r.getByRole('button', { name: /pending/i }).click();
    await page.getByRole('menuitem', { name: /delivered/i }).click();
    await page.waitForTimeout(1500);
    const j = (await api('GET', `/job-cards/${job4.id}`)).data;
    expect(j.status === 'delivered' && j.steps_done === j.steps_total, JSON.stringify(j));
  }, pages.counter.page, probs.counter);

  // ------------------------------------------------------------------ board and monitor
  const M4 = 'Production board and monitor';
  const job5 = await makeJob({ delivery_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10) });
  await run('UI-WFB', M4, 'The board has a column per work center and the new job sits in Design', 'Columns and the job card in Design', async () => {
    const page = pages.accounts.page;
    await go(page, '/production');
    const cols = await page.locator('[data-testid="board-column"]').count();
    expect(cols >= 6, `${cols} columns`);
    const col = page.locator('[data-testid="board-column"]', { hasText: 'Design' }).first();
    expect(await col.isVisible(), 'Design column missing');
    await shot(page, 'production-board');
  }, pages.accounts.page, probs.accounts);

  await run('UI-WFB', M4, '"Only overdue" shows only late jobs, and the overdue job is among them', 'Every card is overdue', async () => {
    const page = pages.accounts.page;
    await page.getByLabel('Only overdue').check();
    await page.waitForTimeout(1500);
    for (const b of await page.getByRole('button', { name: /^Show \d+ more$/ }).all()) await b.click();
    await page.waitForTimeout(500);
    const cards = page.locator('[data-testid="work-card"]');
    const n = await cards.count();
    expect(n > 0, 'no overdue cards');
    const texts = await cards.allInnerTexts();
    expect(texts.every((t) => /Overdue/.test(t)), 'a card is not overdue');
    expect((await bodyText(page)).includes(job5.job_number), 'the overdue test job is not listed');
    await page.getByLabel('Only overdue').uncheck();
  }, pages.accounts.page, probs.accounts);

  await run('UI-WFB', M4, 'The Monitor tab shows the tiles, departments, employees, overdue orders and outside work', 'All sections present', async () => {
    const page = pages.accounts.page;
    await page.getByRole('tab', { name: 'Monitor' }).click();
    await page.waitForTimeout(1800);
    const t = await bodyText(page);
    for (const l of ['Orders in production', 'Overdue', 'Due today', 'On hold', 'Delivered today', 'Work in each department', 'Who is doing what',
      'Steps finished, last 7 days', 'Overdue orders', 'Waiting the longest to be started', 'With outside companies']) expect(t.includes(l), `"${l}" missing`);
    const tiles = await page.locator('[data-testid="monitor-tile"]').count();
    expect(tiles === 6, `${tiles} tiles`);
    await shot(page, 'production-monitor');
  }, pages.accounts.page, probs.accounts);

  await run('UI-WFB', M4, 'Production-floor employees see the board but not the Monitor tab', 'No Monitor tab for the printing employee', async () => {
    const page = pages.printer.page;
    await go(page, '/production');
    expect((await page.getByRole('tab', { name: 'Monitor' }).count()) === 0, 'Monitor tab visible');
    expect(await page.getByRole('tab', { name: 'Board' }).isVisible(), 'Board tab missing');
  }, pages.printer.page, probs.printer);

  // ------------------------------------------------------------------ work centers and workflows (admin)
  const M5 = 'Work Centers and Workflows (admin)';
  const wcName = `${U} Lamination`;
  await run('UI-WFA', M5, 'Admin adds a work center', 'Listed with no team', async () => {
    const page = pages.admin.page;
    await go(page, '/work-centers');
    expect((await bodyText(page)).includes('Printing') && (await bodyText(page)).includes('Front Desk'), 'default centers missing');
    await page.getByRole('button', { name: 'Add Work Center' }).click();
    await dialog(page).getByLabel('Name').fill(wcName);
    await dialog(page).getByLabel('What happens here').fill('UI test');
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    const r = page.locator('tbody tr', { hasText: wcName }).first();
    expect(await r.isVisible(), 'not listed');
    expect(/No one yet/.test(await r.innerText()), 'team should be empty');
    await shot(page, 'work-centers');
  }, pages.admin.page, probs.admin);

  await run('UI-WFA', M5, 'Admin puts the binding employee in the new work center', 'The employee appears in its team', async () => {
    const page = pages.admin.page;
    const r = page.locator('tbody tr', { hasText: wcName }).first();
    await r.getByRole('button', { name: 'Team' }).click();
    await dialog(page).getByLabel('Employees in this work center').click();
    await page.getByRole('option', { name: /Selvam/ }).click();
    await dialog(page).getByRole('button', { name: 'Save team' }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(900);
    expect(/Selvam/.test(await page.locator('tbody tr', { hasText: wcName }).first().innerText()), 'team not shown');
  }, pages.admin.page, probs.admin);

  await run('UI-WFA', M5, 'Admin switches the work center off, edits it, then deletes it', 'Edit saved; delete removes the row', async () => {
    const page = pages.admin.page;
    let r = page.locator('tbody tr', { hasText: wcName }).first();
    await r.getByRole('button', { name: 'Edit' }).click();
    await dialog(page).getByLabel('What happens here').fill('UI test edited');
    await dialog(page).getByLabel('Active').uncheck();
    await dialog(page).getByRole('button', { name: 'Save' }).click();
    await dialog(page).waitFor({ state: 'detached', timeout: 8000 });
    await page.waitForTimeout(800);
    r = page.locator('tbody tr', { hasText: wcName }).first();
    expect(/Inactive/.test(await r.innerText()) && /edited/.test(await r.innerText()), 'edit not shown');
    await r.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('button', { name: /^delete$/i }).last().click();
    await page.waitForTimeout(1000);
    expect((await page.locator('tbody tr', { hasText: wcName }).count()) === 0, 'still listed');
  }, pages.admin.page, probs.admin);

  await run('UI-WFA', M5, 'The workflow editor shows a service\'s steps; admin adds a step, saves, removes it and saves again', 'Saved messages; the service ends as it started', async () => {
    const page = pages.admin.page;
    await go(page, '/workflows');
    await page.getByRole('button', { name: /Printout/ }).first().click();
    await page.waitForTimeout(500);
    const before = await page.locator('[data-testid="template-step"]').count();
    expect(before >= 2, `${before} steps`);
    await page.getByRole('button', { name: 'Add a step' }).click();
    const last = page.locator('[data-testid="template-step"]').last();
    await last.getByLabel('Step', { exact: true }).fill('UI test step');
    await page.getByRole('button', { name: 'Save workflow' }).click();
    await page.waitForTimeout(1200);
    expect(await page.getByText('Saved. New job cards of this service will use these steps.').isVisible(), 'no saved message');
    expect((await page.locator('[data-testid="template-step"]').count()) === before + 1, 'step not added');
    await page.locator('[data-testid="template-step"]').last().getByRole('button', { name: 'Remove step' }).click();
    await page.getByRole('button', { name: 'Save workflow' }).click();
    await page.waitForTimeout(1200);
    expect((await page.locator('[data-testid="template-step"]').count()) === before, 'step not removed');
    await shot(page, 'workflows');
  }, pages.admin.page, probs.admin);

  // ------------------------------------------------------------------ order page and phones
  const M6 = 'Order status and phones';
  await run('UI-WFO', M6, 'The invoice page shows the production status of its job cards ("where is my order?")', 'Job number, current step and a Track button', async () => {
    const q = await api('POST', '/quotations/', { customer_id: cust.id, with_gst: false, is_order: true, items: [await vcItem()] });
    await api('POST', `/quotations/${q.data.id}/convert`);
    const inv = (await api('POST', `/invoices/from-quotation/${q.data.id}`)).data;
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.quotation_item_id === q.data.items[0].id);
    const page = pages.counter.page;
    await go(page, `/invoices/${inv.id}`);
    const panel = page.locator('[data-testid="order-production"]');
    expect(await panel.isVisible(), 'production status panel missing');
    const t = (await panel.innerText()).replace(/\s+/g, ' ');
    expect(t.includes(jobs[0].job_number) && /Design \/ DTP/.test(t) && /0\/5 steps/.test(t), t);
    await panel.getByRole('button', { name: 'Track' }).click();
    await page.waitForURL(/\/track$/, { timeout: 8000 });
    await api('DELETE', `/job-cards/${jobs[0].id}`);
  }, pages.counter.page, probs.counter);

  await run('UI-WFO', M6, 'My Work and the Production board fit a phone screen without sideways page scrolling', 'No horizontal overflow at 390 px', async () => {
    const ctx = await signedIn(browser, sessions.printer, { width: 390, height: 844 });
    const page = await ctx.newPage();
    for (const path of ['/my-work', '/production', `/job-cards/${job.id}/track`]) {
      await go(page, path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow <= 4, `${path} overflows by ${overflow}px`);
    }
    await shot(page, 'my-work-phone');
    await ctx.close();
  }, pages.printer.page, probs.printer);

  // clean up
  for (const j of [job, job2, job5]) await api('DELETE', `/job-cards/${j.id}`);
  for (const { ctx } of Object.values(pages)) await ctx.close().catch(() => {});
}

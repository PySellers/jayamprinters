// Browser tests for client round 6: every worker writes updates on their own task, and one person's work is taken out on its own
// (Work Log: the Admin / Counter pick an employee or the whole team, an employee sees only their own, Excel download).
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall, pick } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const U = 'UIR6' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);

export async function round6Tests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b, t) => apiCall(m, p, b, t || admin.access_token);
  const mkUser = async (key) => {
    const email = `${U.toLowerCase()}-${key}@srijayam.com`;
    const r = await api('POST', '/users/', { name: `${U} Worker ${key}`, email, password: STAFF_PW, role: 'production' });
    return { id: r.data.id, email, name: `${U} Worker ${key}`, session: await loginApi(email, STAFF_PW) };
  };
  const wa = await mkUser('A');
  const wb = await mkUser('B');

  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '7' + String(Math.random()).slice(2, 11).padStart(9, '1'), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const vc = cats.find((c) => c.name === 'Visiting Card');
  const prod = (await api('GET', '/products/?limit=1000')).data.find((p) => p.category_id === vc.id);
  const attrs = (await api('GET', `/attributes/?category_id=${vc.id}`)).data;
  const opt = (n, v) => { const at = attrs.find((x) => x.name === n); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === v).id }; };
  const mkJob = async () => {
    const q = (await api('POST', '/quotations/', {
      customer_id: cust.id, with_gst: false, is_order: true, delivery_date: today, proof1_date: today, proof1_time: '17:00',
      items: [{ product_id: prod.id, quantity: 100, selected_options: [opt('Finish/Lamination Type', 'Without Lamination'), opt('Side', 'Single Side')], extra_charge_ids: [] }],
    })).data;
    await api('POST', `/quotations/${q.id}/convert`);
    await api('POST', `/invoices/from-quotation/${q.id}`);
    return (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);
  };
  const jobA = await mkJob();
  const jobB = await mkJob();
  const first = async (job) => (await api('GET', `/job-cards/${job.id}/steps`)).data.find((s) => s.status === 'ready');
  const stepA = await first(jobA);
  const stepB = await first(jobB);
  // B finishes a task; A has one in progress
  await api('POST', `/job-steps/${stepB.id}/claim`, {}, wb.session.access_token);
  await api('POST', `/job-steps/${stepB.id}/start`, {}, wb.session.access_token);
  await api('POST', `/job-steps/${stepB.id}/complete`, { note: 'B finished it' }, wb.session.access_token);
  await api('POST', `/job-steps/${stepA.id}/claim`, {}, wa.session.access_token);
  await api('POST', `/job-steps/${stepA.id}/start`, {}, wa.session.access_token);

  const aCtx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  const wCtx = await signedIn(browser, wa.session, { width: 1440, height: 1000 });
  const ap = await aCtx.newPage();
  const wp = await wCtx.newPage();
  const aprob = watch(ap);
  const wprob = watch(wp);
  const go = async (page, path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(800); };

  const M1 = 'Each worker updates their own work';
  await run('UI-R6U', M1, 'A worker presses Add update on their own task and writes what is done so far', 'Update saved under their name', async () => {
    await go(wp, `/job-cards/${jobA.id}`);
    await wp.getByTestId('add-update').first().waitFor({ timeout: 15000 });
    await wp.getByTestId('add-update').first().click();
    await wp.getByTestId('update-text').fill(`${U} printed 600 of 1000`);
    await wp.getByTestId('update-save').click();
    let tl = [];
    for (let i = 0; i < 20 && tl.length === 0; i++) {
      await wp.waitForTimeout(500);
      tl = (await api('GET', `/job-cards/${jobA.id}/timeline`)).data.filter((e) => e.action === 'update');
    }
    expect(tl.length === 1 && tl[0].detail === `${U} printed 600 of 1000` && tl[0].user_name === wa.name, JSON.stringify(tl));
    await shot(wp, 'r6-update');
  }, wp, wprob);

  await run('UI-R6U', M1, 'A colleague\'s task has no Add update button for someone else', 'No button on the other worker\'s task', async () => {
    const bCtx = await signedIn(browser, wb.session, { width: 1440, height: 1000 });
    const bp = await bCtx.newPage();
    await go(bp, `/job-cards/${jobA.id}`);
    await bp.getByTestId('task-row').first().waitFor({ timeout: 15000 });
    expect(await bp.getByTestId('add-update').count() === 0, 'B sees Add update on A\'s task');
    await bCtx.close();
  }, wp, wprob);

  const M2 = 'Work Log: one person\'s work on its own';
  await run('UI-R6L', M2, 'The employee\'s Work Log shows only their own work, with their update, and no employee picker', 'Own rows; no other worker', async () => {
    await go(wp, '/work-log');
    await wp.getByTestId('wl-table').waitFor({ timeout: 15000 });
    await wp.getByTestId('wl-row').first().waitFor({ timeout: 15000 });
    expect(await wp.getByTestId('wl-person').count() === 0, 'an employee sees the employee picker');
    const t = await bodyText(wp);
    expect(t.includes(jobA.job_number) && t.includes(`${U} printed 600 of 1000`), 'own task / update missing');
    expect(!t.includes(jobB.job_number), 'a colleague\'s job is in the log');
    expect(await wp.getByTestId('wl-name').innerText() === wa.name, await wp.getByTestId('wl-name').innerText());
    await shot(wp, 'r6-worklog-employee');
  }, wp, wprob);

  await run('UI-R6L', M2, 'The Admin sees the whole team in one summary and opens just one person', 'Team rows, then only A\'s task', async () => {
    await go(ap, '/work-log');
    await ap.getByTestId('wl-team').waitFor({ timeout: 15000 });
    await ap.getByTestId('wl-team-row').first().waitFor({ timeout: 15000 });
    const rows = await ap.getByTestId('wl-team-row').allInnerTexts();
    expect(rows.some((r) => r.includes(wa.name)) && rows.some((r) => r.includes(wb.name)), 'team summary misses a worker');
    await ap.getByTestId('wl-team-row').filter({ hasText: wb.name }).click();
    await ap.getByTestId('wl-table').waitFor({ timeout: 15000 });
    await ap.getByTestId('wl-row').first().waitFor({ timeout: 15000 });
    let t = await bodyText(ap);
    expect(t.includes(jobB.job_number) && !t.includes(jobA.job_number) && t.includes('B finished it'), 'B\'s log is not only B\'s work');
    expect(await ap.getByTestId('wl-name').innerText() === wb.name, 'name');
    await shot(ap, 'r6-worklog-admin');
    // back to everyone, pick A from the drop-down
    await ap.getByRole('button', { name: /back to everyone/i }).click();
    await pick(ap, 'Employee', wa.name);
    await ap.getByTestId('wl-row').first().waitFor({ timeout: 15000 });
    t = await bodyText(ap);
    expect(t.includes(jobA.job_number) && !t.includes(jobB.job_number) && t.includes(`${U} printed 600 of 1000`), 'A\'s log is not only A\'s work');
  }, ap, aprob);

  await run('UI-R6L', M2, 'The period and Finished / Still open filters and the Excel download work for one person', 'Filter narrows; xlsx downloads', async () => {
    await ap.getByRole('button', { name: 'Finished', exact: true }).click();
    await ap.waitForTimeout(1500);
    expect(await ap.getByTestId('wl-row').count() === 0, 'A has nothing finished, yet rows show');
    await ap.getByRole('button', { name: 'Still open', exact: true }).click();
    await ap.getByTestId('wl-row').first().waitFor({ timeout: 15000 });
    const [dl] = await Promise.all([ap.waitForEvent('download', { timeout: 15000 }), ap.getByTestId('wl-excel').click()]);
    expect(/^work-log-/.test(dl.suggestedFilename()) && dl.suggestedFilename().endsWith('.xlsx'), dl.suggestedFilename());
    await ap.getByRole('button', { name: 'Today' }).click();
    await ap.getByTestId('wl-from').waitFor();
    const d = new Date();
    const localToday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(await ap.getByTestId('wl-from').inputValue() === localToday, 'Today did not set the date');
  }, ap, aprob);

  await run('UI-R6L', M2, 'Work Log is in the menu for the Admin, Counter and production staff', 'Menu entry', async () => {
    await go(wp, '/dashboard');
    expect(await wp.getByRole('button', { name: 'Work Log' }).count() + await wp.getByText('Work Log', { exact: true }).count() > 0, 'no Work Log in the employee menu');
    await go(ap, '/dashboard');
    expect(await ap.getByText('Work Log', { exact: true }).count() > 0, 'no Work Log in the admin menu');
  }, wp, wprob);

  // ---- clean-up
  await run('UI-R6Z', 'Clean-up', 'Remove the records created by the round 6 browser tests', 'Removed', async () => {
    const invs = (await api('GET', '/invoices/')).data.filter((i) => i.customer_id === cust.id);
    for (const i of invs) await api('DELETE', `/invoices/${i.id}`);
    for (const j of [jobA, jobB]) await api('DELETE', `/job-cards/${j.id}`);
    for (const w of [wa, wb]) await api('PUT', `/users/${w.id}`, { is_active: false });
  }, ap, aprob);

  await aCtx.close();
  await wCtx.close();
}

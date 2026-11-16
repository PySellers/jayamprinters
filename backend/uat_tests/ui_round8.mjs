// Browser tests for client round 8: the Live Jobs board is grouped by SERVICE (Bill Books, Xerox, Binding ...), one titled section per
// service that has jobs, the jobs of a section in priority order as of today; a service without jobs is not shown. Everything else on
// the board (filters, stages, search, rows) stays as it was.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UIR8' + Date.now().toString().slice(-6);
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

export async function round8Tests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const ctx = await signedIn(browser, admin, { width: 1440, height: 1000 });
  const page = await ctx.newPage();
  const probs = watch(page);
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(900); };

  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '5' + String(Math.random()).slice(2, 11).padStart(9, '1'), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data;
  const products = (await api('GET', '/products/?limit=3000')).data;
  const catOf = (productId) => cats.find((c) => c.id === products.find((p) => p.id === productId)?.category_id)?.name ?? 'Other jobs';
  const attrsOf = async (catName) => (await api('GET', `/attributes/?category_id=${cats.find((c) => c.name === catName).id}`)).data;
  const made = [];

  const mk = async (catName, productName, qty, picks, extra = {}) => {
    const attrs = await attrsOf(catName);
    const opt = (n, v) => { const at = attrs.find((x) => x.name === n); return { attribute_id: at.id, attribute_option_id: at.options.find((o) => o.value === v).id }; };
    const prod = products.find((p) => p.category_id === cats.find((c) => c.name === catName).id && p.name === productName);
    const q = (await api('POST', '/quotations/', {
      customer_id: cust.id, with_gst: false, is_order: true, delivery_date: day(3), proof1_date: day(0), proof1_time: '17:00',
      items: [{ product_id: prod.id, quantity: qty, selected_options: picks.map(([n, v]) => opt(n, v)), extra_charge_ids: [] }], ...extra,
    })).data;
    await api('POST', `/quotations/${q.id}/convert`);
    await api('POST', `/invoices/from-quotation/${q.id}`);
    const job = (await api('GET', '/job-cards/')).data.find((j) => j.quotation_item_id === q.items[0].id);
    made.push({ job, quote: q });
    return job;
  };

  // jobs in four services: bill books (one urgent, one overdue), Xerox, Visiting Card, Binding
  const bbPicks = [['Document Type', 'Bill Book'], ['Paper Name', 'Excel Bond'], ['Paper/GSM Type', '80 GSM'], ['Copies per Set', '1+1']];
  const bbUrgent = await mk('Bill Books & Stationery', 'Sheet Printing - 1/4', 300, bbPicks, { priority: 'urgent' });
  const bbLate = await mk('Bill Books & Stationery', 'Sheet Printing - 1/4', 400, bbPicks);
  const bbPlain = await mk('Bill Books & Stationery', 'Sheet Printing - 1/4', 500, bbPicks);
  const xer = await mk('Xerox / Photocopy', 'Xerox / Photocopy', 50, [['Paper Size', 'A4'], ['Colour', 'Black & White'], ['Print Side', 'Single Side']]);
  const vc = await mk('Visiting Card', 'Visiting Card', 100, [['Finish/Lamination Type', 'Without Lamination'], ['Side', 'Single Side']]);
  const bind = await mk('Binding Services', 'Project Binding', 5, [['Binding Material', 'Paper Rexon']]);
  // make one bill-book job overdue (delivery date in the past)
  await api('PUT', `/job-cards/${bbLate.id}`, { delivery_date: day(-3) });

  const sectionsOnScreen = async () => page.getByTestId('live-section').evaluateAll((els) => els.map((e) => ({
    name: e.getAttribute('data-service'), rows: [...e.querySelectorAll('[data-testid=live-job]')].map((r) => r.getAttribute('data-job')),
  })));
  const openBoard = async (filter) => {
    await go('/dashboard?view=live');
    await page.getByTestId('live-job').first().waitFor({ timeout: 20000 });
    if (filter) { await page.getByTestId(`filter-${filter}`).click(); await page.waitForTimeout(500); }
  };

  const M = 'Live Jobs board grouped by service';
  await run('UI-R8G', M, 'Each service has its own titled section on the Live Jobs board', 'Sections for Bill Books, Xerox, Visiting Card, Binding with their jobs', async () => {
    await openBoard();
    const secs = await sectionsOnScreen();
    const names = secs.map((s) => s.name);
    for (const n of ['Bill Books & Stationery', 'Xerox / Photocopy', 'Visiting Card', 'Binding Services']) expect(names.includes(n), `no section "${n}" (${names.join(', ')})`);
    const bb = secs.find((s) => s.name === 'Bill Books & Stationery');
    expect([bbUrgent, bbLate, bbPlain].every((j) => bb.rows.includes(j.job_number)), 'the three bill book jobs are not in the Bill Books section');
    expect(secs.find((s) => s.name === 'Xerox / Photocopy').rows.includes(xer.job_number), 'xerox job');
    await shot(page, 'r8-grouped-board');
    return `${secs.length} sections: ${names.join(' | ')}`;
  }, page, probs);

  await run('UI-R8G', M, 'A job appears only under its own service', 'Every row sits in the section of its service', async () => {
    const all = (await api('GET', '/job-cards/')).data;
    const byNumber = Object.fromEntries(all.map((j) => [j.job_number, j]));
    const secs = await sectionsOnScreen();
    let rows = 0;
    for (const s of secs) {
      for (const n of s.rows) {
        rows += 1;
        expect(catOf(byNumber[n].product_id) === s.name, `${n} (${catOf(byNumber[n].product_id)}) is shown under "${s.name}"`);
      }
    }
    expect(rows > 0, 'no rows');
    return `${rows} jobs checked in ${secs.length} sections`;
  }, page, probs);

  await run('UI-R8G', M, 'A service with no jobs is not shown (no empty sections)', 'Section names = services of the running jobs', async () => {
    const secs = await sectionsOnScreen();
    expect(secs.every((s) => s.rows.length > 0), 'an empty section is shown');
    const running = (await api('GET', '/job-cards/')).data.filter((j) => j.status !== 'delivered');
    const wanted = new Set(running.map((j) => catOf(j.product_id)));
    expect(new Set(secs.map((s) => s.name)).size === wanted.size && secs.every((s) => wanted.has(s.name)), `sections ${secs.map((s) => s.name).join(', ')} vs services with running jobs ${[...wanted].join(', ')}`);
    expect(!secs.some((s) => s.name === 'Digital Banner') || wanted.has('Digital Banner'), 'a service without jobs appears');
    return `${secs.length} services with running jobs; services without any are hidden`;
  }, page, probs);

  await run('UI-R8G', M, 'Inside a section the jobs are in priority order: urgent first, then overdue, then the rest by due date', 'Urgent bill book first, overdue second', async () => {
    const bb = (await sectionsOnScreen()).find((s) => s.name === 'Bill Books & Stationery');
    expect(bb.rows[0] === bbUrgent.job_number, `first is ${bb.rows[0]}, expected the urgent ${bbUrgent.job_number}`);
    const iUrgent = bb.rows.indexOf(bbUrgent.job_number);
    const iLate = bb.rows.indexOf(bbLate.job_number);
    const iPlain = bb.rows.indexOf(bbPlain.job_number);
    expect(iUrgent < iLate && iLate < iPlain, `order urgent ${iUrgent}, overdue ${iLate}, normal ${iPlain}`);
    // the whole section follows urgent > overdue > rest
    const all = Object.fromEntries((await api('GET', '/job-cards/')).data.map((j) => [j.job_number, j]));
    const rank = (n) => (all[n].priority === 'urgent' ? 0 : all[n].overdue ? 1 : 2);
    for (let i = 1; i < bb.rows.length; i++) expect(rank(bb.rows[i - 1]) <= rank(bb.rows[i]), `${bb.rows[i - 1]} before ${bb.rows[i]}`);
    return `urgent ${iUrgent + 1}, overdue ${iLate + 1}, normal ${iPlain + 1} of ${bb.rows.length}`;
  }, page, probs);

  await run('UI-R8G', M, 'Each section header shows the service, how many jobs and how many are urgent / overdue', 'Title, count, urgent and overdue chips', async () => {
    const bbSec = page.getByTestId('live-section').filter({ has: page.getByText('Bill Books & Stationery', { exact: true }) }).first();
    const title = await bbSec.getByTestId('section-title').innerText();
    expect(title === 'Bill Books & Stationery', title);
    const count = Number((await bbSec.getByTestId('section-count').innerText()).match(/\d+/)[0]);
    const rows = await bbSec.getByTestId('live-job').count();
    if (count > 25) {
      // a long section shows its first 25 jobs and a button for the rest
      expect(rows === 25, `a long section should show 25 jobs first, shows ${rows}`);
      await bbSec.getByTestId('section-more').click();
      await page.waitForTimeout(300);
      expect(await bbSec.getByTestId('live-job').count() === count, 'Show all did not open every job');
    } else {
      expect(count === rows, `header says ${count}, ${rows} rows`);
    }
    expect(/\d+ urgent/.test(await bbSec.getByTestId('section-urgent').innerText()), 'urgent chip');
    expect(/\d+ overdue/.test(await bbSec.getByTestId('section-overdue').innerText()), 'overdue chip');
    const xerSec = page.getByTestId('live-section').filter({ has: page.getByText('Xerox / Photocopy', { exact: true }) }).first();
    return `Bill Books: ${count} jobs; ${await bbSec.getByTestId('section-urgent').innerText()}, ${await bbSec.getByTestId('section-overdue').innerText()}`;
  }, page, probs);

  await run('UI-R8G', M, 'The sections with urgent or overdue work come first', 'First section holds an urgent job', async () => {
    const secs = await sectionsOnScreen();
    const all = Object.fromEntries((await api('GET', '/job-cards/')).data.map((j) => [j.job_number, j]));
    const urgentIn = (s) => s.rows.some((n) => all[n].priority === 'urgent');
    expect(urgentIn(secs[0]), `first section "${secs[0].name}" has no urgent job`);
    const firstNoUrgent = secs.findIndex((s) => !urgentIn(s));
    expect(firstNoUrgent === -1 || secs.slice(firstNoUrgent).every((s) => !urgentIn(s)), 'a section with urgent jobs comes after one without');
    const first = await page.getByTestId('live-job').first().getAttribute('data-urgent');
    expect(first === 'true', 'the very first job on the board is not urgent');
    return `order: ${secs.map((s) => s.name).join(' > ')}`;
  }, page, probs);

  await run('UI-R8G', M, 'A section can be folded and opened again by clicking its title', 'Rows hide and return', async () => {
    const sec = page.getByTestId('live-section').filter({ has: page.getByText('Visiting Card', { exact: true }) }).first();
    expect(await sec.getByTestId('live-job').count() >= 1, 'no rows to fold');
    await sec.getByTestId('section-toggle').click();
    await page.waitForTimeout(300);
    expect(await sec.getByTestId('live-job').count() === 0, 'rows still shown after folding');
    expect(await sec.getByTestId('section-toggle').getAttribute('aria-expanded') === 'false', 'aria-expanded');
    await sec.getByTestId('section-toggle').click();
    await page.waitForTimeout(300);
    expect(await sec.getByTestId('live-job').count() >= 1, 'rows did not come back');
  }, page, probs);

  await run('UI-R8G', M, 'The service buttons above the list jump to that section', 'Chip per service; unfolds and scrolls', async () => {
    const chips = await page.getByTestId('jump-chip').allInnerTexts();
    const secs = await sectionsOnScreen();
    expect(chips.length === secs.length, `${chips.length} chips for ${secs.length} sections`);
    expect(secs.every((s) => chips.some((c) => c.startsWith(s.name))), 'a chip is missing');
    const sec = page.getByTestId('live-section').filter({ has: page.getByText('Binding Services', { exact: true }) }).first();
    await sec.getByTestId('section-toggle').click();
    await page.waitForTimeout(250);
    await page.getByTestId('jump-chip').filter({ hasText: /^Binding Services/ }).click();
    await page.waitForTimeout(900);
    expect(await sec.getByTestId('live-job').count() >= 1, 'jumping did not open the folded section');
    expect(await sec.getByTestId('live-job').first().isVisible(), 'the section is not in view');
  }, page, probs);

  await run('UI-R8G', M, 'Fold all / Open all folds every section to its title and opens them again', 'Only titles, then all rows', async () => {
    const before = await page.getByTestId('live-job').count();
    await page.getByTestId('fold-all').click();
    await page.waitForTimeout(300);
    expect(await page.getByTestId('live-job').count() === 0 && await page.getByTestId('section-title').count() >= 2, 'not folded');
    expect(/open all/i.test(await page.getByTestId('fold-all').innerText()), 'label');
    await page.getByTestId('fold-all').click();
    await page.waitForTimeout(300);
    expect(await page.getByTestId('live-job').count() === before, 'rows did not all come back');
  }, page, probs);

  await run('UI-R8G', M, 'The Urgent filter keeps only the sections that have urgent jobs', 'Only urgent rows; other sections vanish', async () => {
    await openBoard('urgent');
    const secs = await sectionsOnScreen();
    expect(secs.length >= 1 && secs.every((s) => s.rows.length > 0), 'sections');
    const flags = await page.getByTestId('live-job').evaluateAll((els) => els.map((e) => e.getAttribute('data-urgent')));
    expect(flags.length > 0 && flags.every((f) => f === 'true'), 'a non-urgent job is shown');
    const urgentServices = new Set((await api('GET', '/job-cards/')).data.filter((j) => j.status !== 'delivered' && j.priority === 'urgent').map((j) => catOf(j.product_id)));
    expect(secs.length === urgentServices.size && secs.every((s) => urgentServices.has(s.name)), `sections ${secs.map((s) => s.name).join(', ')} vs services with urgent jobs ${[...urgentServices].join(', ')}`);
    expect(secs.some((s) => s.name === 'Bill Books & Stationery'), 'Bill Books should be there');
  }, page, probs);

  await run('UI-R8G', M, 'Search and the stage chips still work and the sections follow them', 'Search for a job -> one section, one row', async () => {
    await openBoard();
    await page.getByTestId('live-search').fill(xer.job_number);
    await page.waitForTimeout(500);
    const secs = await sectionsOnScreen();
    expect(secs.length === 1 && secs[0].name === 'Xerox / Photocopy' && secs[0].rows.length === 1 && secs[0].rows[0] === xer.job_number, JSON.stringify(secs));
    await page.getByTestId('live-search').fill('');
    await page.getByTestId('stage-delivered').click();
    await page.waitForTimeout(500);
    const none = await page.getByTestId('live-job').count();
    // delivered filter: only delivered jobs (maybe none) - never the running ones
    const stat = await page.getByTestId('live-job').evaluateAll((els) => els.map((e) => e.querySelector('[data-testid=status-chip]')?.textContent));
    expect(stat.every((t) => /Delivered/.test(t ?? '')), `status chips: ${stat.join(',')}`);
    return `search narrows to one section; delivered filter shows ${none} delivered job(s)`;
  }, page, probs);

  await run('UI-R8G', M, 'The board is readable on a phone: no sideways scroll, titles and counts visible', 'Page fits 390px wide', async () => {
    const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await small.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', u); }, [admin.access_token, JSON.stringify(admin.user)]);
    const p = await small.newPage();
    await p.goto(BASE + '/dashboard?view=live', { waitUntil: 'networkidle' });
    await p.getByTestId('live-section').first().waitFor({ timeout: 20000 });
    const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(over <= 2, `sideways scroll ${over}px`);
    expect(await p.getByTestId('section-title').first().isVisible() && await p.getByTestId('section-count').first().isVisible(), 'title / count not visible');
    await p.screenshot({ path: `${process.env.UAT_SHOTS || './shots'}/r8-grouped-board-phone.png` });
    await small.close();
  }, page, probs);

  await run('UI-R8G', M, 'The rest of the board is unchanged: filters, stage chips, search box, All job cards button', 'Controls present', async () => {
    await openBoard();
    for (const id of ['filter-active', 'filter-urgent', 'filter-overdue', 'filter-delivered', 'filter-all', 'stage-design', 'stage-printing', 'stage-delivered', 'live-search']) {
      expect(await page.getByTestId(id).count() === 1, `${id} missing`);
    }
    expect(await page.getByRole('button', { name: /all job cards/i }).count() === 1, 'All job cards button');
    const row = page.getByTestId('live-job').first();
    expect(await row.getByTestId('status-chip').count() === 1, 'status chip');
    await row.click();
    await page.waitForURL(/\/track/, { timeout: 8000 });
  }, page, probs);

  await run('UI-R8Z', 'Clean-up', 'Remove the records created by the round 8 browser tests', 'Removed', async () => {
    for (const m of made) {
      const inv = (await api('GET', '/invoices/')).data.find((i) => i.quotation_id === m.quote.id);
      if (inv) await api('DELETE', `/invoices/${inv.id}`);
      await api('DELETE', `/job-cards/${m.job.id}`);
      await api('DELETE', `/quotations/${m.quote.id}`);
    }
    await api('DELETE', `/customers/${cust.id}`);
  }, page, probs);

  await ctx.close();
}

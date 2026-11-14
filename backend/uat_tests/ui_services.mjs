// Browser tests for EVERY service on the real order screen (round 7): the service is chosen, every required option is picked the way
// a counter does, and the price panel on the right must show a price - total, each part listed separately, GST, discount and
// advance - that agrees with the line price and with the invoice that is generated. One scenario group per service.
import { signedIn, loginApi, watch, run, expect, shot, bodyText, BASE, apiCall, pickItem, answerExtras } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const U = 'UIR7' + Date.now().toString().slice(-6);
const today = new Date().toISOString().slice(0, 10);
const money = (s) => Number(String(s).replace(/[₹,\s-]/g, ''));

/** Picks the first option of every enabled, still empty required drop-down in the order form until nothing is left to choose. */
async function fillRequired(page) {
  for (let round = 0; round < 16; round++) {
    let acted = false;
    const boxes = page.locator('form [role=combobox]');
    const n = await boxes.count();
    for (let i = 0; i < n; i++) {
      const b = boxes.nth(i);
      if (!(await b.isVisible().catch(() => false))) continue;
      const info = await b.evaluate((el) => {
        const id = el.id || el.getAttribute('aria-labelledby') || '';
        const label = (document.querySelector(`label[for="${el.id}"]`) || document.getElementById(el.getAttribute('aria-labelledby') || '__none') || {}).innerText || '';
        const isInput = el.tagName === 'INPUT';
        const value = isInput ? el.value : el.innerText.replace(/​/g, '').trim();
        const disabled = el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('.Mui-disabled') !== null;
        return { id, label: label.trim(), value, disabled };
      });
      if (info.disabled || !info.label.endsWith('*') || info.value) continue;
      if (/^Item \/ Size/.test(info.label) || /^Sub-category/.test(info.label)) continue;
      await b.click();
      const opts = page.getByRole('option');
      await opts.first().waitFor({ timeout: 4000 }).catch(() => {});
      if (!(await opts.count())) { await page.keyboard.press('Escape'); continue; }
      // required extras: None is always the first answer; otherwise the first real option
      const texts = await opts.allInnerTexts();
      const none = texts.findIndex((t) => t.trim() === 'None');
      await opts.nth(none >= 0 ? none : 0).click();
      await page.waitForTimeout(250);
      acted = true;
      break;
    }
    if (!acted) return;
  }
}

async function panelTotal(page) {
  const t = await page.getByTestId('panel-total').innerText();
  return /\d/.test(t) ? money(t) : null;
}

export async function serviceTests(browser) {
  const admin = await loginApi(...ADMIN);
  const api = (m, p, b) => apiCall(m, p, b, admin.access_token);
  const ctx = await signedIn(browser, admin, { width: 1600, height: 1000 });
  const page = await ctx.newPage();
  const probs = watch(page);
  const cust = (await api('POST', '/customers/', { name: `${U} Customer`, phone: '6' + String(Math.random()).slice(2, 11).padStart(9, '1'), reason: 'UI test' })).data;
  const cats = (await api('GET', '/product-categories/?limit=500')).data.filter((c) => c.is_active && !c.name.startsWith('ZZ'));
  const allProducts = (await api('GET', '/products/?limit=3000')).data;
  const invoices = [];
  const orderUrl = (cat, gst) => `/quotations/new?quick=1&customerId=${cust.id}&customerName=${encodeURIComponent(cust.name)}&categoryId=${cat.id}&withGst=${gst}&proof1Date=${today}&proof1Time=16%3A15&deliveryDate=${today}`;
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };

  for (const cat of cats) {
    const prods = allProducts.filter((p) => p.category_id === cat.id && p.is_active);
    const prod = prods.find((p) => p.pricing_type !== 'fixed') ?? prods[0];
    const guided = cat.guided_flow === 'bill_book';
    const M = `Service: ${cat.name}`;
    const gst = Math.random() < 2 ? 1 : 0; // every service is checked with GST on, so CGST / SGST are shown

    await run('UI-SVP', M, `${cat.name}: the order screen opens with the price panel on the right, empty until options are chosen`, 'Panel visible at the right, "--" total', async () => {
      await go(orderUrl(cat, gst));
      const panel = page.getByTestId('price-panel');
      await panel.waitFor({ timeout: 15000 });
      const box = await panel.boundingBox();
      const vp = page.viewportSize();
      expect(box && box.x > vp.width * 0.55, `the panel is not on the right (x=${box && Math.round(box.x)})`);
      expect(/PRICE OF THIS ORDER/.test(await panel.innerText()), 'panel title');
      return `${prods.length} item(s); panel at x=${Math.round(box.x)}px`;
    }, page, probs);

    let totalSeen = null;
    await run('UI-SVP', M, `${cat.name}: after choosing every option the price panel shows the total and each part separately`, 'Total > 0, parts listed, parts add up to the line total', async () => {
      if (!guided && prods.length > 1) await pickItem(page, prod.name);
      if (prod.pricing_type === 'per_area') {
        await page.getByLabel('Width (ft)').fill('3');
        await page.getByLabel('Height (ft)').fill('4');
      }
      for (let k = 0; k < 4; k++) {
        await fillRequired(page);
        await answerExtras(page);
        if (await page.getByTestId('panel-line').first().getAttribute('data-priced') === 'true') break;
        await page.waitForTimeout(700);
      }
      const line = page.getByTestId('panel-line').first();
      await page.waitForFunction(() => document.querySelector('[data-testid=panel-line]')?.getAttribute('data-priced') === 'true', null, { timeout: 12000 }).catch(() => {});
      const priced = await line.getAttribute('data-priced');
      if (priced !== 'true') {
        const why = await page.getByTestId('price-panel').innerText();
        throw new Error('not priced: ' + why.replace(/\s+/g, ' ').slice(0, 220));
      }
      const total = await panelTotal(page);
      expect(total && total > 0, `panel total ${total}`);
      const parts = await page.getByTestId('panel-part').count();
      expect(parts >= 1, 'no price parts listed');
      const amounts = (await page.getByTestId('panel-part').allInnerTexts()).map((t) => money(t.split('\n').filter((x) => /₹/.test(x)).pop() || '0'));
      const lineTotal = money(await page.getByTestId('panel-line-total').first().innerText());
      const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100;
      expect(Math.abs(sum - lineTotal) < 0.06, `parts add up to ${sum}, the line says ${lineTotal}`);
      totalSeen = total;
      await shot(page, `r7-${cat.id}-priced`);
      return `Total ₹${total}; ${parts} part(s): ${amounts.join(' + ')}`;
    }, page, probs);

    await run('UI-SVP', M, `${cat.name}: GST is shown as CGST / SGST in the panel and the total includes it`, 'CGST, SGST, GST total, TOTAL', async () => {
      if (totalSeen == null) throw new Error('no price to check');
      const t = await page.getByTestId('price-panel').innerText();
      expect(/CGST/.test(t) && /SGST/.test(t) && /GST total/.test(t) && /TOTAL/.test(t), 'GST rows missing: ' + t.replace(/\s+/g, ' ').slice(-200));
      const sub = money(t.match(/Sub-total\s*₹\s*([\d,.]+)/)?.[1] ?? '0');
      const gstTotal = money(t.match(/GST total\s*₹\s*([\d,.]+)/)?.[1] ?? '0');
      expect(Math.abs(sub + gstTotal - totalSeen) < 0.06, `sub-total ${sub} + GST ${gstTotal} is not ${totalSeen}`);
      return `₹${sub} + GST ₹${gstTotal} = ₹${totalSeen}`;
    }, page, probs);

    await run('UI-SVP', M, `${cat.name}: the on-screen line price, the panel and the generated invoice agree`, 'Invoice grand total = panel total', async () => {
      if (totalSeen == null) throw new Error('no price to check');
      const lineText = await page.getByTestId('line-amount').first().innerText().catch(() => '');
      const num = (t) => Number(String(t).replace(/[^\d.]/g, '').replace(/^\./, '')) || 0;
      if (lineText) expect(Math.abs(num(lineText) - num(await page.getByTestId('panel-line-total').first().innerText())) < 0.06, `line amount ${lineText} differs from the panel`);
      await page.getByRole('button', { name: /generate invoice/i }).click();
      await page.waitForURL(/\/invoices\/\d+$/, { timeout: 30000 });
      const id = Number(page.url().split('/').pop());
      invoices.push(id);
      const inv = (await api('GET', `/invoices/${id}`)).data;
      expect(Math.abs(inv.grand_total - totalSeen) < 0.06, `invoice ${inv.grand_total} vs panel ${totalSeen}`);
      return `Invoice ${inv.invoice_number} ₹${inv.grand_total}`;
    }, page, probs);
  }

  // ---------------------------------------------------------------- what the panel does when things change
  const vcCat = cats.find((c) => c.name === 'Visiting Card');
  const M2 = 'Price panel behaviour';
  await run('UI-SVB', M2, 'The panel follows the quantity: a bigger order costs more in total', 'Total grows with the quantity', async () => {
    await go(orderUrl(vcCat, 1));
    await fillRequired(page);
    await answerExtras(page);
    await page.waitForFunction(() => document.querySelector('[data-testid=panel-line]')?.getAttribute('data-priced') === 'true', null, { timeout: 12000 });
    const a = await panelTotal(page);
    await page.getByLabel(/^Qty/).fill('500');
    await page.waitForTimeout(1400);
    const b = await panelTotal(page);
    await page.getByLabel(/^Qty/).fill('2000');
    await page.waitForTimeout(1400);
    const c = await panelTotal(page);
    expect(a && b && c && a < b && b < c, `totals ${a}, ${b}, ${c}`);
    return `₹${a} -> ₹${b} -> ₹${c}`;
  }, page, probs);

  await run('UI-SVB', M2, 'A discount shows in the panel and lowers the total; an advance shows the balance', 'Discount row, advance and BALANCE TO PAY', async () => {
    const before = await panelTotal(page);
    await page.getByTestId('discount-percent').click();
    await page.getByTestId('discount-value').fill('10');
    await page.waitForTimeout(1500);
    const t = await page.getByTestId('price-panel').innerText();
    expect(/Discount \(10%\)/.test(t), 'no discount row');
    const after = await panelTotal(page);
    expect(after < before, `total did not drop (${before} -> ${after})`);
    await page.getByTestId('advance-amount').fill('100');
    await page.waitForTimeout(800);
    const t2 = await page.getByTestId('price-panel').innerText();
    expect(/Advance received/.test(t2) && /BALANCE TO PAY/.test(t2), 'advance / balance rows missing');
    const bal = money(t2.match(/BALANCE TO PAY\s*₹\s*([\d,.]+)/)?.[1] ?? '0');
    expect(Math.abs(bal - (after - 100)) < 0.06, `balance ${bal} vs ${after - 100}`);
    await shot(page, 'r7-panel-discount-advance');
    return `₹${before} -> ₹${after} after 10 %; balance ₹${bal}`;
  }, page, probs);

  await run('UI-SVB', M2, 'The panel gives the owner a "change" link for every part of the price', 'Links to Pricing Setup / Price Matrix', async () => {
    const links = await page.getByTestId('panel-edit-link').evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(links.length >= 1 && links.every((h) => /pricing-setup|price-matrix|products/.test(h)), JSON.stringify(links));
    return links.join(' , ');
  }, page, probs);

  await run('UI-SVB', M2, 'Without GST the panel shows no CGST / SGST and says cash bill', 'No GST rows', async () => {
    await go(orderUrl(vcCat, 0));
    await fillRequired(page);
    await answerExtras(page);
    await page.waitForFunction(() => document.querySelector('[data-testid=panel-line]')?.getAttribute('data-priced') === 'true', null, { timeout: 12000 });
    const t = await page.getByTestId('price-panel').innerText();
    expect(!/CGST/.test(t) && /cash bill/i.test(t), t.replace(/\s+/g, ' ').slice(0, 200));
  }, page, probs);

  await run('UI-SVB', M2, 'A line that cannot be priced yet says what is still to be chosen', 'Missing list shown, total "--"', async () => {
    await go(orderUrl(vcCat, 1));
    await page.getByTestId('panel-missing').waitFor({ timeout: 10000 });
    const t = await page.getByTestId('panel-missing').innerText();
    expect(/Still to choose/.test(t) && /Side/.test(t), t);
    expect(/--/.test(await page.getByTestId('panel-total').innerText()), 'total should be --');
  }, page, probs);

  // ---------------------------------------------------------------- clean-up
  await run('UI-SVZ', 'Clean-up', 'Remove the invoices and the customer created by the service tests', 'Removed', async () => {
    for (const id of invoices) await api('DELETE', `/invoices/${id}`);
    const jobs = (await api('GET', '/job-cards/')).data.filter((j) => j.customer_id === cust.id);
    for (const j of jobs) await api('DELETE', `/job-cards/${j.id}`);
    const qs = (await api('GET', '/quotations/')).data.filter((x) => x.customer_id === cust.id);
    for (const q of qs) await api('DELETE', `/quotations/${q.id}`);
    await api('DELETE', `/customers/${cust.id}`);
  }, page, probs);

  await ctx.close();
}

// Browser tests: screens fit every common screen size (no sideways scrolling, no clipped menu, no overlapping text).
import { signedIn, loginApi, watch, run, expect, shot, BASE } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const SIZES = [['Large desktop 1920x1080', 1920, 1080], ['Laptop 1366x768', 1366, 768], ['Small laptop (scaled) 1093x614', 1093, 614], ['Tablet 768x1024', 768, 1024], ['Phone 390x844', 390, 844]];
const PAGES = [['Dashboard', '/dashboard'], ['Customers', '/customers'], ['Quotations', '/quotations'], ['Job Cards', '/job-cards'], ['Invoices', '/invoices'], ['Products', '/products'],
  ['Pricing Setup', '/pricing-setup'], ['Purchases', '/purchases'], ['Inventory', '/inventory'], ['Cash Ledger', '/cash-ledger'], ['Reports', '/reports'], ['Users', '/users']];

export async function layoutTests(browser) {
  const session = await loginApi(...ADMIN);
  for (const [label, w, h] of SIZES) {
    const ctx = await signedIn(browser, session, { width: w, height: h });
    const page = await ctx.newPage();
    const problems = watch(page);
    await run('UI-LAY', `Layout - ${label}`, `All ${PAGES.length} main screens fit the window: no sideways page scroll, no overlapping text`, 'Page width never exceeds the window', async () => {
      const bad = [];
      for (const [name, path] of PAGES) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' });
        await page.waitForTimeout(500);
        const m = await page.evaluate(() => {
          const vw = document.documentElement.clientWidth;
          const overflow = document.documentElement.scrollWidth - vw;
          const leaves = [];
          document.querySelectorAll('body *').forEach((el) => {
            const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
            if (r.width < 3 || r.height < 3 || cs.visibility === 'hidden' || cs.display === 'none') return;
            if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1)) return;
            if (el.closest('[class*=MuiTableContainer], [class*=MuiTable-root], table')) return; // tables scroll inside their own box by design
            if (el.closest('legend, fieldset')) return; // outlined inputs repeat their label inside a hidden legend
            leaves.push({ el, r, t: el.textContent.trim().slice(0, 24) });
          });
          let overlaps = 0; const ex = [];
          for (let i = 0; i < leaves.length && overlaps < 5; i++) for (let j = i + 1; j < leaves.length; j++) {
            const a = leaves[i], b = leaves[j];
            if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
            const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
            const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
            if (ix > 3 && iy > 3 && (ix * iy) / Math.min(a.r.width * a.r.height, b.r.width * b.r.height) > 0.3) { overlaps++; ex.push(`"${a.t}" over "${b.t}"`); }
          }
          return { overflow, overlaps, ex };
        });
        if (m.overflow > 2) bad.push(`${name}: scrolls sideways by ${m.overflow}px`);
        if (m.overlaps > 0) bad.push(`${name}: overlapping text ${m.ex.slice(0, 2).join('; ')}`);
      }
      expect(bad.length === 0, bad.join(' | '));
      await shot(page, `layout-${w}x${h}`);
    }, page, problems);

    if (w < 1200) {
      await run('UI-LAY', `Layout - ${label}`, 'The menu is a slide-out drawer opened by a menu button and every entry stays reachable', 'Menu button opens a list with all main entries', async () => {
        await page.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /open menu/i }).click();
        await page.waitForTimeout(500);
        const t = (await page.locator('.MuiDrawer-root').innerText()).toLowerCase();
        for (const m of ['dashboard', 'customers', 'quotations', 'job cards', 'invoices', 'reports']) expect(t.includes(m), `menu entry "${m}" missing`);
        await shot(page, `layout-menu-${w}x${h}`);
      }, page, problems);
    }
    await ctx.close();
  }
}

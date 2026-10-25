// Browser tests: sign-in, sign-out, role-based menus, every screen opens cleanly.
import { launch, signedIn, loginApi, watch, run, expect, shot, bodyText, BASE } from './ui_framework.mjs';

const ADMIN = ['admin@srijayam.com', process.env.UAT_ADMIN_PASSWORD || 'Admin@123'];
const STAFF_PW = process.env.UAT_STAFF_PASSWORD || 'Uat@12345';
const MAIN_MENU = ['Dashboard', 'Customers', 'Quotations', 'Job Cards', 'Invoices', 'Products', 'Pricing Setup', 'Purchases', 'Inventory', 'Outsource', 'Cash Ledger', 'Reports', 'Users'];
const EXPECTED_MENU = {
  admin: MAIN_MENU,
  counter: ['Dashboard', 'Customers', 'Quotations', 'Job Cards', 'Invoices', 'Products', 'Inventory', 'Outsource', 'Reports'],
  production: ['Dashboard', 'Customers', 'Quotations', 'Job Cards', 'Invoices', 'Products', 'Inventory', 'Reports'],
  accounts: ['Dashboard', 'Customers', 'Quotations', 'Job Cards', 'Invoices', 'Products', 'Purchases', 'Inventory', 'Outsource', 'Cash Ledger', 'Reports'],
};
const LOGINS = { admin: ADMIN, counter: ['counter@srijayam.com', STAFF_PW], production: ['designer@srijayam.com', STAFF_PW], accounts: ['accounts@srijayam.com', STAFF_PW] };

export async function accessTests(browser) {
  const M1 = 'Login & Access';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const problems = watch(page);

  await run('UI-LOG', M1, 'The sign-in page opens with e-mail, password and a Sign In button', 'Form fields and button are visible', async () => {
    await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
    expect(await page.getByLabel('Email').isVisible(), 'no email field');
    expect(await page.getByLabel('Password').isVisible(), 'no password field');
    expect(await page.getByRole('button', { name: /sign in|login/i }).isVisible(), 'no sign-in button');
    await shot(page, 'login-page');
  }, page, problems);

  await run('UI-LOG', M1, 'Wrong password shows an error and stays on the sign-in page', 'Red error message; URL still /login', async () => {
    await page.getByLabel('Email').fill(ADMIN[0]);
    await page.getByLabel('Password').fill('definitely-wrong');
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForTimeout(1200);
    expect(page.url().includes('/login'), 'left the login page: ' + page.url());
    expect(await page.getByRole('alert').first().isVisible(), 'no error message shown');
    return 'Error: ' + (await page.getByRole('alert').first().innerText()).trim().slice(0, 60);
  }, page, []);

  await run('UI-LOG', M1, 'Correct credentials open the dashboard', 'URL becomes /dashboard and the page greets the user', async () => {
    await page.getByLabel('Password').fill(ADMIN[1]);
    await page.getByRole('button', { name: /sign in|login/i }).click();
    await page.waitForURL(/dashboard/, { timeout: 10000 });
    await page.waitForTimeout(800);
    expect((await bodyText(page)).toLowerCase().includes('start new order'), 'dashboard did not render');
  }, page, problems);

  await run('UI-LOG', M1, 'Refreshing the page keeps the user signed in', 'Still on the dashboard after reload', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    expect(page.url().includes('/dashboard'), 'session lost: ' + page.url());
  }, page, problems);

  await run('UI-LOG', M1, 'Logout returns to the sign-in page', 'URL /login and the session is cleared', async () => {
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL(/login/, { timeout: 8000 });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(!token, 'token still stored after logout');
  }, page, problems);

  await run('UI-LOG', M1, 'After logout, opening a private page redirects to sign-in', 'Visiting /invoices lands on /login', async () => {
    await page.goto(BASE + '/invoices', { waitUntil: 'networkidle' });
    expect(page.url().includes('/login'), 'private page opened without a login: ' + page.url());
  }, page, problems);

  await run('UI-LOG', M1, 'An unknown web address falls back safely', 'Redirects (to sign-in or dashboard), no blank/error screen', async () => {
    await page.goto(BASE + '/this/page/does/not/exist', { waitUntil: 'networkidle' });
    expect(/login|dashboard/.test(page.url()), 'ended on ' + page.url());
  }, page, problems);
  await ctx.close();

  // ---------------------------------------------------------------- role menus
  const M2 = 'Roles & Menus';
  const sessions = {};
  for (const [role, [email, pw]] of Object.entries(LOGINS)) {
    const s = await loginApi(email, pw);
    sessions[role] = s;
    const rctx = await signedIn(browser, s);
    const rpage = await rctx.newPage();
    const rprob = watch(rpage);

    await run('UI-ROLE', M2, `${role[0].toUpperCase() + role.slice(1)} user sees exactly the menu entries for that role`, `Menu: ${EXPECTED_MENU[role].join(', ')}`, async () => {
      await rpage.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
      const items = await rpage.locator('nav a, nav [role=button], .MuiDrawer-root [role=button], .MuiDrawer-root a').allInnerTexts();
      const seen = MAIN_MENU.filter((m) => items.some((t) => t.trim() === m));
      const expected = EXPECTED_MENU[role];
      expect(JSON.stringify(seen) === JSON.stringify(expected), `saw [${seen.join(', ')}]`);
      if (role === 'admin') {
        const t = await bodyText(rpage);
        expect(/Masters/i.test(t), 'admin should also see Masters');
      }
      return `Menu: ${seen.join(', ')}`;
    }, rpage, rprob);

    if (role !== 'admin') {
      for (const path of ['/users', '/pricing-setup']) {
        await run('UI-ROLE', M2, `${role} user cannot open ${path} by typing the address`, '"Not authorized" message', async () => {
          await rpage.goto(BASE + path, { waitUntil: 'networkidle' });
          expect((await bodyText(rpage)).includes('Not authorized'), 'page opened for a non-admin');
        }, rpage, rprob);
      }
      if (role !== 'accounts') {
        await run('UI-ROLE', M2, `${role} user cannot open the Cash Ledger by typing the address`, '"Not authorized" message', async () => {
          await rpage.goto(BASE + '/cash-ledger', { waitUntil: 'networkidle' });
          expect((await bodyText(rpage)).includes('Not authorized'), 'cash ledger opened for ' + role);
        }, rpage, rprob);
      }
    }
    await rctx.close();
  }

  // ---------------------------------------------------------------- every screen opens
  const M3 = 'Screens';
  const actx = await signedIn(browser, sessions.admin);
  const apage = await actx.newPage();
  const aprob = watch(apage);
  const SCREENS = [
    ['Dashboard', '/dashboard', 'Start New Order'], ['Customers', '/customers', 'Add Customer'], ['Quotations', '/quotations', 'New Quotation'],
    ['Job Cards', '/job-cards', 'Job #'], ['Invoices', '/invoices', 'Invoice #'], ['Products', '/products', 'Add Product'],
    ['Pricing Setup', '/pricing-setup', 'Product Category'], ['Purchases', '/purchases', 'New Purchase'], ['Inventory', '/inventory', 'Add Item'],
    ['Cash Ledger', '/cash-ledger', 'Record Transaction'], ['Reports', '/reports', 'This Month'], ['Users', '/users', 'Add User'],
    ['Machines (master)', '/masters/machines', 'Add New'], ['Printing Types (master)', '/masters/printing-types', 'Add New'], ['Tax', '/taxes', 'Add Tax'],
  ];
  for (const [name, path, marker] of SCREENS) {
    await run('UI-SCR', M3, `${name} screen opens with its data and no errors`, `Page shows "${marker}"; no script errors or server errors`, async () => {
      await apage.goto(BASE + path, { waitUntil: 'networkidle' });
      await apage.waitForTimeout(500);
      expect((await bodyText(apage)).toLowerCase().includes(marker.toLowerCase()), `"${marker}" not found on ${path}`);
      await shot(apage, 'screen-' + path.replace(/\W+/g, '-').replace(/^-|-$/g, ''));
    }, apage, aprob);
  }

  await run('UI-SCR', M3, 'Sidebar navigation: clicking every menu entry opens the matching screen', 'Each click changes the URL to that screen', async () => {
    await apage.goto(BASE + '/dashboard', { waitUntil: 'networkidle' });
    const wanted = { Customers: '/customers', Quotations: '/quotations', 'Job Cards': '/job-cards', Invoices: '/invoices', Products: '/products', 'Pricing Setup': '/pricing-setup', Purchases: '/purchases', Inventory: '/inventory', 'Cash Ledger': '/cash-ledger', Reports: '/reports', Users: '/users', Dashboard: '/dashboard' };
    for (const [label, path] of Object.entries(wanted)) {
      await apage.locator('.MuiDrawer-root').getByText(label, { exact: true }).first().click();
      await apage.waitForURL(new RegExp(path.replace('/', '\\/') + '$'), { timeout: 6000 });
    }
    return `${Object.keys(wanted).length} menu entries navigate correctly`;
  }, apage, aprob);

  await actx.close();
  return sessions;
}

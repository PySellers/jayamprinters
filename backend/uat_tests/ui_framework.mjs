// Browser-test helpers for the Sri Jayam ERP UAT suite (Playwright + real Chrome).
// Needs `npm i playwright-core` somewhere Node can resolve it, and Chrome installed.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

export const BASE = process.env.UAT_UI || 'http://127.0.0.1:5173';
export const API = process.env.UAT_API || 'http://127.0.0.1:8000/api/v1';
export const SHOTS = process.env.UAT_SHOTS || './shots';
export const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
export const RESULTS = [];
const counters = {};
fs.mkdirSync(SHOTS, { recursive: true });

export async function apiCall(method, path, body, token) {
  const r = await fetch(API + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: r.status, data };
}

export async function loginApi(email, password) {
  const r = await apiCall('POST', '/auth/login', { email, password });
  return r.data;
}

export async function launch() {
  return chromium.launch({ executablePath: CHROME, headless: true });
}

/** A browser context that is already signed in as `session` (the /auth/login response). */
export async function signedIn(browser, session, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport, acceptDownloads: true });
  await ctx.addInitScript(([t, u]) => { localStorage.setItem('token', t); localStorage.setItem('user', u); }, [session.access_token, JSON.stringify(session.user)]);
  return ctx;
}

/** Collects console errors and failed (5xx) requests while a test runs. */
export function watch(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|404)/.test(m.text())) problems.push('console: ' + m.text().slice(0, 160)); });
  page.on('pageerror', (e) => problems.push('script error: ' + String(e).slice(0, 160)));
  page.on('response', (r) => { if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url().replace(BASE, '').slice(0, 80)}`); });
  return problems;
}

export async function run(prefix, module, scenario, expected, fn, page, problems) {
  counters[prefix] = (counters[prefix] || 0) + 1;
  const id = `${prefix}-${String(counters[prefix]).padStart(3, '0')}`;
  const t0 = Date.now();
  if (problems) problems.length = 0;
  let status = 'PASS', actual = 'As expected';
  try {
    const out = await fn();
    if (typeof out === 'string' && out) actual = out;
    if (problems && problems.length) { status = 'FAIL'; actual = 'Browser reported problems: ' + problems.slice(0, 3).join(' | '); }
  } catch (e) {
    status = 'FAIL'; actual = String(e.message || e).split('\n')[0].slice(0, 400);
    if (page) { try { await page.screenshot({ path: `${SHOTS}/FAIL-${id}.png` }); } catch { /* ignore */ } }
  }
  RESULTS.push({ id, module, scenario, expected, actual, status, ms: Date.now() - t0 });
  console.log(`[${status}] ${id} ${module} :: ${scenario}` + (status === 'PASS' ? '' : `\n       -> ${actual}`));
  return status === 'PASS';
}

export const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

export async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

export function save(file) {
  fs.writeFileSync(file, JSON.stringify(RESULTS, null, 1));
  const p = RESULTS.filter((r) => r.status === 'PASS').length;
  console.log(`\n${p}/${RESULTS.length} passed, ${RESULTS.length - p} failed -> ${file}`);
}

/** Opens a MUI select / autocomplete by its label and picks an option by (partial) text. */
export async function pick(page, label, option) {
  // Prefer the field whose label IS `label` ("Size" must not match "Item / Size"); fall back to a partial match.
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exact = page.getByLabel(new RegExp('^' + esc + '(\\s*\\*)?$'));
  const box = (await exact.count()) > 0 ? exact.first() : page.getByLabel(label, { exact: false }).first();
  await box.click();
  // an option called exactly `option` wins over one that merely contains it ("A4" vs "A4 Long")
  const exactOpt = page.getByRole('option', { name: option, exact: true });
  await ((await exactOpt.count()) > 0 ? exactOpt.first() : page.getByRole('option', { name: option, exact: false }).first()).click();
  await page.waitForTimeout(250);
}

export async function bodyText(page) {
  return (await page.locator('body').innerText()).replace(/\s+/g, ' ');
}

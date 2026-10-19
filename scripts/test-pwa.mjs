/**
 * 真实浏览器回归测试：PWA（可安装 + 离线可用 + 更新提示）
 *
 * 需求约定：「PWA 适配」——从浏览器访问时装得上、断网后还能打开继续写、
 * 发新版本时由用户决定何时刷新。
 *
 * 这里不做「检查文件里有没有某行代码」式的断言，而是真的起一个静态服务器，
 * 用 Chromium 加载构建产物（dist/），然后：
 *   1. manifest 能被浏览器取到，且满足安装条件（name / start_url / display /
 *      192 与 512 图标 / maskable）；
 *   2. Service Worker 真的注册并接管页面，构建产物进入预缓存；
 *   3. 断网后强制刷新，应用仍能启动（证明外壳被缓存，而不是靠网络）；
 *   4. 样式全部来自本地构建产物 —— 不再有 CDN（tailwindcss / esm.sh）请求，
 *      这是离线不掉版式的关键；
 *   5. 收到 beforeinstallprompt 时活动栏出现安装入口，点击会调用浏览器弹窗；
 *   6. SW 有新版本时出现「更新」条，点击后新 SW 接管并刷新。
 *
 * 依赖：必须先 `npm run build`（或本脚本自行检查 dist 是否存在）。
 */
import { createServer } from 'node:http';
import { readFile, readdir, appendFile, mkdir, copyFile, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve('.');
const DIST = path.join(ROOT, 'dist');
const SERVED = path.join(ROOT, 'scripts/.tmp-pwa/dist');
const BASE_PATH = '/epub-simple-editor/';

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

if (!existsSync(path.join(DIST, 'index.html'))) {
  console.error('缺少 dist/：请先运行 npm run build。');
  process.exit(1);
}

// ─── 把 dist 复制到临时目录：测试会改写 sw.js 来模拟「发布了新版本」 ───
await rm(SERVED, { recursive: true, force: true });
await mkdir(SERVED, { recursive: true });
await copyFile(path.join(DIST, 'index.html'), path.join(SERVED, 'index.html'));
for (const entry of await readdir(DIST, { withFileTypes: true })) {
  if (entry.name === 'index.html') continue;
  if (entry.isDirectory()) {
    await mkdir(path.join(SERVED, entry.name), { recursive: true });
    for (const sub of await readdir(path.join(DIST, entry.name))) {
      await copyFile(path.join(DIST, entry.name, sub), path.join(SERVED, entry.name, sub));
    }
  } else {
    await copyFile(path.join(DIST, entry.name), path.join(SERVED, entry.name));
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/** 极简静态服务器：只服务 BASE_PATH 前缀，其余 404（与 GitHub Pages 子路径部署一致） */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith(BASE_PATH)) {
    res.writeHead(404).end('not found');
    return;
  }
  let rel = decodeURIComponent(url.pathname.slice(BASE_PATH.length));
  // SPA 回退：无扩展名的路径都返回 index.html
  if (rel === '' || !path.extname(rel)) rel = 'index.html';
  const file = path.join(SERVED, rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      // SW 与 manifest 不允许被中间缓存拿旧版
      'Cache-Control': rel === 'sw.js' || rel.endsWith('.webmanifest') ? 'no-cache' : 'public, max-age=0',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const PORT = server.address().port;
const ORIGIN = `http://127.0.0.1:${PORT}`;
const APP_URL = `${ORIGIN}${BASE_PATH}`;

const findBrowser = () => {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'AppData/Local/ms-playwright'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ].filter(Boolean);
  for (const root of roots) {
    if (!existsSync(root)) continue;
    let dirs = [];
    try {
      dirs = execFileSync('node', ['-e', `console.log(require('fs').readdirSync(${JSON.stringify(root)}).join('\\n'))`])
        .toString().split('\n').filter((d) => d.startsWith('chromium-'));
    } catch { continue; }
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p));
};

const exe = findBrowser();
if (!exe) {
  console.log('跳过：本机没有找到 Chromium/Chrome。');
  server.close();
  process.exit(0);
}

const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
const externalRequests = [];
page.on('request', (req) => {
  const host = new URL(req.url()).host;
  if (host !== `127.0.0.1:${PORT}`) externalRequests.push(req.url());
});

const bootApp = async () => {
  await page.waitForSelector('text=书籍管理', { timeout: 30000 });
  await page.waitForTimeout(500);
};

// ─── 0. 首屏 ─────────────────────────────────────────────────────────────
await page.goto(APP_URL);
await bootApp();

// ─── 1. manifest ─────────────────────────────────────────────────────────
const manifestHref = await page.evaluate(() => {
  const link = document.querySelector('link[rel="manifest"]');
  return link ? link.href : null;
});
record('页面声明了 manifest 链接', !!manifestHref, manifestHref ?? '未找到');

if (manifestHref) {
  const manifestRes = await page.evaluate(async (href) => {
    const res = await fetch(href);
    return { ok: res.ok, type: res.headers.get('content-type'), body: await res.json().catch(() => null) };
  }, manifestHref);

  const m = manifestRes.body ?? {};
  const iconSizes = (m.icons ?? []).map((i) => i.sizes);
  const has192 = iconSizes.includes('192x192');
  const has512 = iconSizes.includes('512x512');
  const hasMaskable = (m.icons ?? []).some((i) => String(i.purpose ?? '').includes('maskable'));

  record(
    'manifest 可访问且内容满足可安装条件',
    manifestRes.ok &&
      !!m.name &&
      !!m.short_name &&
      m.display === 'standalone' &&
      !!m.start_url &&
      has192 &&
      has512 &&
      hasMaskable,
    JSON.stringify(
      { ok: manifestRes.ok, display: m.display, start_url: m.start_url, icons: iconSizes, maskable: hasMaskable },
      null,
      2,
    ),
  );

  // 图标必须真的能取到，且尺寸与声明一致（否则安装时图标会空白）
  const iconChecks = await page.evaluate(async (href) => {
    const base = new URL(href);
    const res = await fetch(base);
    const manifest = await res.json();
    const out = [];
    for (const icon of manifest.icons ?? []) {
      const url = new URL(icon.src, base).href;
      const r = await fetch(url);
      const buf = new Uint8Array(await r.arrayBuffer());
      // PNG 头：89 50 4E 47，宽高在 IHDR 的偏移 16..24
      const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
      const width = isPng ? (buf[16] << 24) | (buf[17] << 16) | (buf[18] << 8) | buf[19] : 0;
      const height = isPng ? (buf[20] << 24) | (buf[21] << 16) | (buf[22] << 8) | buf[23] : 0;
      out.push({ src: icon.src, status: r.status, isPng, actual: `${width}x${height}`, declared: icon.sizes });
    }
    return out;
  }, manifestHref);

  record(
    'manifest 里的图标都能取到且尺寸与声明一致',
    iconChecks.length > 0 &&
      iconChecks.every((i) => i.status === 200 && i.isPng && i.actual === i.declared),
    JSON.stringify(iconChecks, null, 2),
  );
}

// ─── 2. Service Worker 注册 + 预缓存 ─────────────────────────────────────
const swState = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { supported: false };
  const reg = await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  let entries = 0;
  for (const key of keys) {
    const cache = await caches.open(key);
    entries += (await cache.keys()).length;
  }
  return {
    supported: true,
    scope: reg.scope,
    active: !!reg.active,
    cacheNames: keys,
    cachedEntries: entries,
  };
});

record(
  'Service Worker 已注册并预缓存构建产物',
  swState.supported && swState.active && swState.cachedEntries >= 4,
  JSON.stringify(swState, null, 2),
);

// 首次访问时 SW 刚激活，还没接管当前页；重新加载一次后导航请求就由 SW 处理。
// 这一步也是后面「离线刷新」能成立的前提。
await page.reload({ waitUntil: 'domcontentloaded' });
await bootApp();
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
record('重新加载后页面由 Service Worker 接管', controlled);

// ─── 3. 离线提示 ─────────────────────────────────────────────────────────
// 真实场景：正在编辑时网络断了。此时页面不该被打断，只多一条说明性的提示。
await context.setOffline(true);

const offlineBanner = await page
  .waitForSelector('[data-pwa-offline="true"]', { timeout: 5000 })
  .then(() =>
    page.evaluate(() => {
      const el = document.querySelector('[data-pwa-offline="true"]');
      const rect = el.getBoundingClientRect();
      return { text: el.textContent?.trim(), width: Math.round(rect.width), height: Math.round(rect.height) };
    }),
  )
  .catch(() => null);

record(
  '断网时显示离线提示（说明仍可编辑）',
  !!offlineBanner && /离线/.test(offlineBanner.text ?? '') && offlineBanner.height > 0,
  JSON.stringify(offlineBanner),
);

// 恢复联网后提示条应自行消失
await context.setOffline(false);
const bannerGone = await page
  .waitForSelector('[data-pwa-offline="true"]', { state: 'detached', timeout: 5000 })
  .then(() => true)
  .catch(() => false);
record('恢复联网后离线提示自动消失', bannerGone);

// ─── 4. 离线可用 ─────────────────────────────────────────────────────────
// 真正要证明的是「断网后重新打开仍能用」：强制重新加载页面，不读缓存里的旧文档。
// 注意不要把 navigator.onLine 当作断言依据 —— Chromium 的网络模拟在重载后
// 偶尔会把它报成 true，但这不影响导航请求走 Service Worker 缓存这条主线。
await context.setOffline(true);
const offlineBoot = await page
  .reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
  .then(() => page.waitForSelector('text=书籍管理', { timeout: 30000 }))
  .then(() => true)
  .catch((e) => e.message);

record('断网后强制刷新仍能启动应用', offlineBoot === true, offlineBoot === true ? '' : String(offlineBoot));

await context.setOffline(false);
await page.waitForTimeout(300);

// ─── 5. 样式与依赖全部来自本地（不再依赖 CDN） ───────────────────────────
const styleChecks = await page.evaluate(() => {
  // 抽查几个决定布局的类是否真的生效；Tailwind 若没编译进来，
  // 这些属性会是初始值（display: inline / width: auto）
  const nav = document.querySelector('[aria-label="一级导航"]');
  const body = document.body;
  return {
    navWidth: nav ? Math.round(nav.getBoundingClientRect().width) : 0,
    bodyHeight: Math.round(body.getBoundingClientRect().height),
    overflow: getComputedStyle(body).overflow,
    stylesheets: Array.from(document.styleSheets).map((s) => s.href ?? '(inline)'),
  };
});
record(
  'Tailwind 样式由本地构建产物提供且生效',
  styleChecks.navWidth === 44 && styleChecks.overflow === 'hidden',
  JSON.stringify(styleChecks, null, 2),
);

record(
  '运行时不请求任何外部 CDN（离线不掉样式的前提）',
  externalRequests.length === 0,
  externalRequests.length ? externalRequests.join('\n') : '',
);

// ─── 6a. 主题色 ──────────────────────────────────────────────────────────
// 地址栏 / 安装后窗口的标题栏颜色要跟随「当前主题」，而不只是系统偏好：
// 用户在系统浅色下显式选了深色，颜色也得变深。
const themeColor = await page.evaluate(async () => {
  const meta = document.querySelector('meta[name="theme-color"]');
  const read = () => meta?.getAttribute('content') ?? null;
  const initial = read();
  const toggle = document.querySelector('[data-theme-toggle="true"]');
  if (!toggle) return { initial, afterToggle: null };
  toggle.click();
  await new Promise((r) => setTimeout(r, 100));
  const afterToggle = read();
  toggle.click();
  await new Promise((r) => setTimeout(r, 100));
  return { initial, afterToggle, restored: read(), isDark: document.documentElement.classList.contains('dark') };
});

record(
  '主题色随深浅切换同步变化（地址栏 / 安装后的标题栏）',
  !!themeColor.initial &&
    !!themeColor.afterToggle &&
    themeColor.initial !== themeColor.afterToggle &&
    themeColor.restored === themeColor.initial,
  JSON.stringify(themeColor),
);

// ─── 6. 安装入口 ─────────────────────────────────────────────────────────
// headless Chromium 不一定会派发 beforeinstallprompt（取决于浏览器版本与
// 安装启发式），这里直接派发一个符合本应用约定的合成事件，
// 验证「事件 → 入口出现 → 点击调用 prompt」这条我们自己写的链路。
const installFlow = await page.evaluate(async () => {
  let prompted = false;
  const event = new Event('beforeinstallprompt');
  event.prompt = async () => { prompted = true; };
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  window.dispatchEvent(event);

  await new Promise((r) => setTimeout(r, 100));
  const button = document.querySelector('[data-pwa-install="true"]');
  if (!button) return { buttonAppeared: false, prompted };
  button.click();
  await new Promise((r) => setTimeout(r, 100));
  return {
    buttonAppeared: true,
    prompted,
    buttonGoneAfterUse: !document.querySelector('[data-pwa-install="true"]'),
  };
});
record(
  '收到安装事件后出现安装入口，点击会触发浏览器安装弹窗',
  installFlow.buttonAppeared && installFlow.prompted && installFlow.buttonGoneAfterUse,
  JSON.stringify(installFlow, null, 2),
);

// ─── 6b. 手机上安装入口必须开箱可见 ──────────────────────────────────────
// 活动栏在窄屏是左抽屉的一部分，默认推到屏幕外（x 为负）。安装入口若只放那里，
// 用户想装应用得先点汉堡菜单才找得到 —— 这与「可安装」的初衷相悖，
// 因此窄屏另有一个常驻在顶栏的入口。这里用真实手机视口断言它可见可点。
const phone = await context.newPage();
await phone.setViewportSize({ width: 390, height: 844 });
await phone.goto(APP_URL);
await phone.waitForSelector('text=书籍管理', { timeout: 30000 });
await phone.waitForTimeout(500);

await phone.evaluate(() => {
  // 合成一次安装事件：headless Chromium 不保证真的派发
  window.__prompted = false;
  const event = new Event('beforeinstallprompt');
  event.prompt = async () => { window.__prompted = true; };
  event.userChoice = Promise.resolve({ outcome: 'dismissed' });
  window.dispatchEvent(event);
});
await phone.waitForTimeout(200);

const mobileInstall = await phone.evaluate(() => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const buttons = Array.from(document.querySelectorAll('[data-pwa-install="true"]')).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
      // 完全落在视口内，才算真的能点到
      visible: r.x >= 0 && r.y >= 0 && r.x + r.width <= viewportWidth && r.y + r.height <= viewportHeight,
    };
  });
  return {
    viewportWidth,
    viewportHeight,
    buttons,
    visibleCount: buttons.filter((b) => b.visible).length,
  };
});

record(
  '手机视口下安装入口默认就在屏幕内（不必先开抽屉）',
  mobileInstall.visibleCount >= 1,
  JSON.stringify(mobileInstall, null, 2),
);

// 用视口内的那一个：Playwright 的 :visible 只判断有没有尺寸，
// 抽屉里推到屏幕外的那个也会命中，所以这里按坐标点。
const inView = mobileInstall.buttons.find((b) => b.visible);
if (inView) {
  await phone.mouse.click(inView.x + inView.width / 2, inView.y + inView.height / 2);
  await phone.waitForTimeout(200);
  const mobilePrompted = await phone.evaluate(() => window.__prompted);
  record('手机上点击该入口会触发安装弹窗', mobilePrompted === true);
}

await phone.close();

// ─── 7. 更新提示 ─────────────────────────────────────────────────────────
// 模拟「发布了新版本」：改写 sw.js 的字节（浏览器据此判定 SW 有更新）。
// 新 SW 的预缓存清单没变，会停在 waiting，正好走本应用的「提示后刷新」路径。
await appendFile(path.join(SERVED, 'sw.js'), '\n// pwa-test-bump\n');

const updateAppeared = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return false;
  await reg.update();
  for (let i = 0; i < 60; i += 1) {
    if (document.querySelector('[data-pwa-update="true"]')) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
});
record('检测到新版本时出现更新提示条', updateAppeared);

if (updateAppeared) {
  const updateCopy = await page.evaluate(() => ({
    text: document.querySelector('[data-pwa-update="true"]')?.textContent?.trim(),
    hasLaterButton: !!document.querySelector('[data-pwa-update="true"] button[aria-label="稍后更新"]'),
  }));
  record(
    '更新提示同时提供「更新」与「稍后」两条路径',
    /更新/.test(updateCopy.text ?? '') && updateCopy.hasLaterButton,
    JSON.stringify(updateCopy),
  );

  // 点「更新」→ 新 SW 接管并刷新，提示条消失
  const reloaded = page.waitForEvent('load', { timeout: 15000 }).then(() => true).catch(() => false);
  await page.click('[data-pwa-update="true"] button:not([aria-label])');
  const didReload = await reloaded;
  const afterReload = didReload
    ? await page.waitForSelector('text=书籍管理', { timeout: 30000 }).then(() => true).catch(() => false)
    : false;
  const gone = await page.evaluate(() => !document.querySelector('[data-pwa-update="true"]'));
  record('点击「更新」后新版本接管并刷新页面', didReload && afterReload && gone);
}

record('页面运行期间没有未捕获异常', pageErrors.length === 0, pageErrors.join('\n'));

await browser.close();
server.close();
// 临时目录里有被改写过的 sw.js，跑完即删（测试结束后它没有价值）
await rm(path.dirname(SERVED), { recursive: true, force: true }).catch(() => {});

const failed = results.filter((r) => !r.ok);
console.log(`\n${failed.length === 0 ? '🎉' : '⚠️'} ${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length === 0 ? 0 : 1);

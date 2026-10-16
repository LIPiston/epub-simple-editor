/**
 * 真实浏览器回归测试：VS Code 式两级可收回导航。
 *
 * 需求约定（用户需求原文）：「两级菜单结构参考 VS Code 可收回模式进行修改」。
 *
 * VS Code 的行为约定，也就是这里要验证的：
 *   1. 一级是活动栏（图标分组），二级是侧边面板（当前分组下的视图）；
 *   2. 点「当前已激活的一级分组」→ 收起二级面板；
 *   3. 面板收起后再点同一分组 → 重新展开；
 *   4. 点「另一个一级分组」→ 切换分组，二级面板换成该分组的视图；
 *   5. 从书库点「打开」跳到编辑器时，一级分组与二级选中项都要跟着走到「内容 / 目录管理」；
 *   6. 收起状态持久化（刷新后仍保持收起）。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-nav');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import localforage from 'localforage';
import App from '../../App';

window.__localforage = localforage;
window.__mount = () => {
  const host = document.getElementById('root');
  host.innerHTML = '';
  // 与真实入口 index.tsx 一致：包 StrictMode
  createRoot(host).render(<React.StrictMode><App /></React.StrictMode>);
};
`;

writeFileSync(path.join(tmp, 'harness.tsx'), HARNESS);
await build({
  entryPoints: [path.join(tmp, 'harness.tsx')],
  bundle: true, format: 'iife', platform: 'browser', target: 'chrome120',
  outfile: path.join(tmp, 'harness.js'), logLevel: 'error', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

// 手写够用的 Tailwind 子集（生产用 CDN，测试不联网）。
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; }
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; }
    .flex-col { flex-direction: column; } .hidden { display: none; }
    .h-full { height: 100%; } .h-screen { height: 100vh; }
    .w-full { width: 100%; } .min-w-0 { min-width: 0; }
    .w-12 { width: 3rem; } .w-56 { width: 14rem; }
    .h-10 { height: 2.5rem; } .h-7 { height: 1.75rem; }
    .relative { position: relative; } .absolute { position: absolute; }
    .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
    .items-center { align-items: center; } .justify-between { justify-content: space-between; }
    .justify-center { justify-content: center; }
    .border-r { border-right: 1px solid #e5e7eb; } .border-b { border-bottom: 1px solid #e5e7eb; }
    .ProseMirror { outline: none; min-height: 400px; }
  </style></head><body class="h-screen overflow-hidden">
    <div id="root" class="h-full"></div>
    <script src="./harness.js"></script>
  </body></html>`
);

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
  ].find((p) => existsSync(p));
};

const exe = findBrowser();
if (!exe) {
  console.log('跳过：本机没有找到 Chromium/Chrome/Edge。');
  process.exit(0);
}
const { chromium } = await import('playwright-core');
const browser = await chromium.launch({ executablePath: exe, headless: true });

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

/** 每个用例用独立页面，避免 IndexedDB / localStorage 互相污染 */
const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
  await page.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__localforage.clear();
  });
  return page;
};

const bootApp = async (page) => {
  await page.evaluate(() => window.__mount());
  await page.waitForSelector('text=书籍管理', { timeout: 20000 });
  await page.waitForTimeout(600);
};

/** 读导航状态：一级分组、二级项、面板是否在 DOM 里 */
const navState = (page) =>
  page.evaluate(() => ({
    groups: Array.from(document.querySelectorAll('[data-nav-level="1"]')).map((b) => ({
      id: b.getAttribute('data-nav-id'),
      views: (b.getAttribute('data-nav-views') || '').split(','),
      active: b.getAttribute('data-active') === 'true',
    })),
    views: Array.from(document.querySelectorAll('[data-nav-level="2"]')).map((b) => ({
      id: b.getAttribute('data-nav-id'),
      active: b.getAttribute('data-active') === 'true',
    })),
    hasPanel: !!document.querySelector('[data-nav-level="2"]'),
  }));

/** 点某个一级分组 */
const clickGroup = async (page, groupId) => {
  await page.evaluate((id) => {
    const btn = document.querySelector(`[data-nav-level="1"][data-nav-id="${id}"]`);
    if (!btn) throw new Error('找不到一级分组: ' + id);
    btn.click();
  }, groupId);
  await page.waitForTimeout(350);
};

/** 点某个二级视图项 */
const clickView = async (page, viewId) => {
  await page.evaluate((id) => {
    const btn = document.querySelector(`[data-nav-level="2"][data-nav-id="${id}"]`);
    if (!btn) throw new Error('找不到二级视图: ' + id);
    btn.click();
  }, viewId);
  await page.waitForTimeout(350);
};

/** 种子：直接写一本书进书库（绕开 UI） */
const seedBook = (page, { title, chapterTitles }) =>
  page.evaluate(async ({ title, chapterTitles }) => {
    const lf = window.__localforage;
    const index = (await lf.getItem('epub_simple_editor_library_index_v1')) || { books: [], activeBookId: null };
    const id = 'seed_' + Math.random().toString(36).slice(2, 9);
    const now = Date.now();
    await lf.setItem('epub_simple_editor_book_' + id, {
      metadata: { title, creator: '作者', language: 'zh', description: '', publisher: '', date: '2026-01-01' },
      chapters: chapterTitles.map((t, i) => ({
        id: id + '_ch' + i, title: t, content: `<h1>${t}</h1><p>正文。</p>`, level: 1, subItems: [],
      })),
      images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
      activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    index.books = [
      { id, title, author: '作者', chapterCount: chapterTitles.length, imageCount: 0, sizeBytes: 1024, createdAt: now, updatedAt: now },
      ...index.books,
    ];
    if (!index.activeBookId) index.activeBookId = id;
    await lf.setItem('epub_simple_editor_library_index_v1', index);
    return id;
  }, { title, chapterTitles });

// ─── 1. 两级结构：一级是分组，二级是具体视图 ───
console.log('1. 两级菜单的基本结构');
{
  const page = await newPage();
  await bootApp(page);
  const state = await navState(page);

  record(
    '一级活动栏有多个分组（非平铺的一长条）',
    state.groups.length >= 2,
    `  一级分组: ${JSON.stringify(state.groups.map((g) => g.id))}`,
  );
  record(
    '二级面板只列出当前分组下的视图',
    state.views.length > 0 && state.views.length < state.groups.flatMap((g) => g.views).length,
    `  当前二级项: ${JSON.stringify(state.views.map((v) => v.id))}`,
  );
  record(
    '默认进入「书库 / 书籍管理」，两级都高亮',
    state.groups.find((g) => g.id === 'library')?.active === true &&
      state.views.find((v) => v.id === 'library')?.active === true,
    `  一级高亮=${state.groups.find((g) => g.active)?.id}；二级高亮=${state.views.find((v) => v.active)?.id}`,
  );
  await page.close();
}

// ─── 2. 点当前分组 = 收起面板；再点 = 展开 ───
console.log('\n2. 点当前一级分组可收起/展开二级面板');
{
  const page = await newPage();
  await bootApp(page);

  const before = await navState(page);
  await clickGroup(page, 'library');
  const collapsed = await navState(page);
  await clickGroup(page, 'library');
  const expanded = await navState(page);

  record(
    '点当前分组后二级面板被收起（DOM 中不再有二级项）',
    before.hasPanel && !collapsed.hasPanel,
    `  收起前有面板=${before.hasPanel}；收起后有面板=${collapsed.hasPanel}`,
  );
  record(
    '再点同一分组后二级面板重新展开',
    expanded.hasPanel && expanded.views.some((v) => v.id === 'library'),
    `  展开后有面板=${expanded.hasPanel}；二级项=${JSON.stringify(expanded.views.map((v) => v.id))}`,
  );
  await page.close();
}

// ─── 3. 切换分组：二级面板换成该分组的视图 ───
console.log('\n3. 切换一级分组会换掉二级内容');
{
  const page = await newPage();
  await bootApp(page);

  await clickGroup(page, 'design');
  const design = await navState(page);
  record(
    '切到「设计」分组后，二级显示该分组的视图（样式主题/图片素材/封面设计）',
    design.groups.find((g) => g.id === 'design')?.active === true &&
      design.views.some((v) => v.id === 'styles') &&
      design.views.some((v) => v.id === 'cover'),
    `  一级高亮=${design.groups.find((g) => g.active)?.id}；二级项=${JSON.stringify(design.views.map((v) => v.id))}`,
  );

  await clickView(page, 'cover');
  const onCover = await navState(page);
  record(
    '点二级项切到对应界面，且保持选中态',
    onCover.views.find((v) => v.id === 'cover')?.active === true,
    `  二级高亮=${onCover.views.find((v) => v.active)?.id}`,
  );

  // 换到另一个分组，再换回来：面板内容应随分组变
  await clickGroup(page, 'content');
  const content = await navState(page);
  record(
    '分组内容互不串台（内容分组不含封面设计）',
    content.views.some((v) => v.id === 'chapters') && !content.views.some((v) => v.id === 'cover'),
    `  内容分组二级项=${JSON.stringify(content.views.map((v) => v.id))}`,
  );
  await page.close();
}

// ─── 4. 从书库「打开」跳转时，两级选中态同步跟随 ───
console.log('\n4. 跨视图跳转时两级选中态同步');
{
  const page = await newPage();
  await seedBook(page, { title: '跳转书', chapterTitles: ['第一章'] });
  await bootApp(page);

  // 先在书库里「打开」这本书 → 应跳到 内容/目录管理
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('[data-book-card] h3')).find(
      (h) => (h.textContent || '').trim() === '跳转书',
    );
    if (!heading) throw new Error('书库里找不到书籍卡片');
    const card = heading.closest('[data-book-card]');
    const btn = Array.from(card.querySelectorAll('button')).find((b) => (b.textContent || '').includes('打开'));
    btn.click();
  });
  await page.waitForTimeout(1200);

  const after = await navState(page);
  record(
    '跳到编辑器后，一级分组切到「内容」、二级选中「目录管理」',
    after.groups.find((g) => g.id === 'content')?.active === true &&
      after.views.find((v) => v.id === 'chapters')?.active === true,
    `  一级高亮=${after.groups.find((g) => g.active)?.id}；二级高亮=${after.views.find((v) => v.active)?.id}`,
  );
  await page.close();
}

// ─── 5. 收起状态持久化 ───
console.log('\n5. 收起状态在刷新后保持');
{
  const page = await newPage();
  await bootApp(page);
  await clickGroup(page, 'library'); // 收起
  const collapsed = await navState(page);
  record('操作后处于收起状态', !collapsed.hasPanel, `  hasPanel=${collapsed.hasPanel}`);

  // 重新挂载（相当于刷新）
  await bootApp(page);
  const afterReload = await navState(page);
  record(
    '重新挂载后仍保持收起（读 localStorage）',
    !afterReload.hasPanel,
    `  重载后 hasPanel=${afterReload.hasPanel}`,
  );
  await page.close();
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length === 0) {
  console.log(`✅ 全部通过：${results.length}/${results.length}`);
  process.exit(0);
}
console.log(`❌ 失败 ${failed.length}/${results.length}：`);
for (const f of failed) console.log(`   - ${f.name}`);
process.exit(1);

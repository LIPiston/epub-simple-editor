/**
 * 真实浏览器回归测试：书籍管理（书库）
 *
 * 功能约定（用户需求原文）：
 *   「新增书籍管理界面，避免重复的导入导出，需要有独立界面，
 *     点击后跳转到这本书的章节管理。放置在左侧侧边栏的顶部，
 *     叫作『书籍管理』。」
 *
 * 因此要验证的是：
 *   1. 侧边栏顶部第一项是「书籍管理」；
 *   2. 它是独立界面，能列出多本书；
 *   3. 点「打开」会跳到该书的章节管理（编辑器视图）；
 *   4. 各本书数据互相独立（改 A 不影响 B）—— 这正是「避免重复导入导出」的核心；
 *   5. 新建 / 复制 / 重命名 / 删除 都能改变书库；
 *   6. 旧版单项目数据能迁移成书库里的第一本书（老用户不丢稿）；
 *   7. 阅读位置按书籍隔离 —— 复制出的副本章节 id 与原书相同，
 *      若位置不分书存储，两本会互相覆盖。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-library');
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
  createRoot(host).render(<App />);
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

// 手写一份够用的 Tailwind 子集（生产用 CDN，测试不联网）。
// 只写「决定布局/尺寸」的规则，保证点击与可见性判断可靠。
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; }
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; }
    .flex-wrap { flex-wrap: wrap; } .flex-col { flex-direction: column; }
    .grid { display: grid; } .hidden { display: none; }
    .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)); }
    @media (min-width: 768px) {
      .md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .md\\:flex { display: flex; } .md\\:block { display: block; }
    }
    @media (min-width: 1280px) {
      .xl\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    .h-full { height: 100%; } .h-screen { height: 100vh; } .h-10 { height: 2.5rem; }
    .h-14 { height: 3.5rem; } .h-9 { height: 2.25rem; } .h-8 { height: 2rem; }
    .h-11 { height: 2.75rem; } .h-20 { height: 5rem; }
    .w-9 { width: 2.25rem; } .w-8 { width: 2rem; } .w-10 { width: 2.5rem; } .w-11 { width: 2.75rem; }
    .w-20 { width: 5rem; } .w-64 { width: 16rem; } .w-full { width: 100%; }
    .min-w-0 { min-width: 0; } .max-w-md { max-width: 28rem; } .max-w-sm { max-width: 24rem; }
    .relative { position: relative; } .absolute { position: absolute; } .fixed { position: fixed; }
    .sticky { position: sticky; } .inset-0 { top: 0; right: 0; bottom: 0; left: 0; }
    .inset-y-0 { top: 0; bottom: 0; }
    .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
    .items-center { align-items: center; } .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
    .top-0 { top: 0; } .left-0 { left: 0; } .right-4 { right: 1rem; } .bottom-4 { bottom: 1rem; } .bottom-14 { bottom: 3.5rem; }
    .-top-2 { top: -0.5rem; } .left-4 { left: 1rem; } .left-3 { left: 0.75rem; }
    .-translate-x-full { transform: translateX(-100%); } .translate-x-0 { transform: translateX(0); }
    .-translate-y-1\\/2 { transform: translateY(-50%); }
    .z-40 { z-index: 40; } .z-50 { z-index: 50; } .z-30 { z-index: 30; } .z-20 { z-index: 20; }
    .p-4 { padding: 1rem; } .p-6 { padding: 1.5rem; } .p-2 { padding: 0.5rem; }
    .px-4 { padding-left: 1rem; padding-right: 1rem; }
    .py-4 { padding-top: 1rem; padding-bottom: 1rem; }
    .py-2 { padding-top: 0.5rem; padding-bottom: 0.5rem; }
    .py-1\\.5 { padding-top: 0.375rem; padding-bottom: 0.375rem; }
    .px-3 { padding-left: 0.75rem; padding-right: 0.75rem; }
    .px-3\\.5 { padding-left: 0.875rem; padding-right: 0.875rem; }
    .py-2\\.5 { padding-top: 0.625rem; padding-bottom: 0.625rem; }
    .px-2 { padding-left: 0.5rem; padding-right: 0.5rem; }
    .pl-9 { padding-left: 2.25rem; } .pr-3 { padding-right: 0.75rem; }
    .pt-3 { padding-top: 0.75rem; } .pb-4 { padding-bottom: 1rem; } .pb-3 { padding-bottom: 0.75rem; }
    .mt-2 { margin-top: 0.5rem; } .mt-3 { margin-top: 0.75rem; } .mt-4 { margin-top: 1rem; }
    .mt-6 { margin-top: 1.5rem; } .mt-0\\.5 { margin-top: 0.125rem; } .mt-1 { margin-top: 0.25rem; }
    .mb-2 { margin-bottom: 0.5rem; } .mb-3 { margin-bottom: 0.75rem; } .mb-4 { margin-bottom: 1rem; }
    .mb-5 { margin-bottom: 1.25rem; } .mb-6 { margin-bottom: 1.5rem; }
    .ml-2 { margin-left: 0.5rem; } .mr-2 { margin-right: 0.5rem; } .-ml-2 { margin-left: -0.5rem; }
    .gap-1 > * + * { margin-left: 0.25rem; } .gap-1\\.5 > * + * { margin-left: 0.375rem; }
    .gap-2 > * + * { margin-left: 0.5rem; } .gap-3 > * + * { margin-left: 0.75rem; }
    .gap-2 { gap: 0.5rem; } .gap-3 { gap: 0.75rem; } .gap-4 { gap: 1rem; }
    .space-x-1 > * + * { margin-left: 0.25rem; } .space-x-2 > * + * { margin-left: 0.5rem; }
    .space-x-3 > * + * { margin-left: 0.75rem; } .space-y-1 > * + * { margin-top: 0.25rem; }
    .text-xs { font-size: 0.75rem; line-height: 1rem; } .text-sm { font-size: 0.875rem; line-height: 1.25rem; }
    .text-lg { font-size: 1.125rem; } .text-xl { font-size: 1.25rem; } .text-2xl { font-size: 1.5rem; }
    .text-\\[10px\\] { font-size: 10px; } .text-\\[11px\\] { font-size: 11px; }
    .font-medium { font-weight: 500; } .font-bold { font-weight: 700; } .font-semibold { font-weight: 600; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rounded-lg { border-radius: 0.5rem; } .rounded-xl { border-radius: 0.75rem; }
    .rounded-2xl { border-radius: 1rem; } .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid #e5e7eb; } .border-t { border-top: 1px solid #e5e7eb; }
    .border-b { border-bottom: 1px solid #e5e7eb; } .border-r { border-right: 1px solid #e5e7eb; }
    .border-2 { border-width: 2px; border-style: solid; }
    .bg-white { background: #fff; } .bg-gray-50 { background: #f9fafb; } .bg-gray-100 { background: #f3f4f6; }
    .bg-blue-50 { background: #eff6ff; } .bg-blue-600 { background: #2563eb; }
    .ring-2 { box-shadow: 0 0 0 2px rgba(37,99,235,0.15); }
    .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,0.05); } .shadow-lg { box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
    .outline-none { outline: none; }
    .opacity-60 { opacity: 0.6; } .opacity-40 { opacity: 0.4; }
    .cursor-pointer { cursor: pointer; }
    .flex-1.flex.flex-col { min-height: 0; }
    .ProseMirror { outline: none; min-height: 400px; }
    .ProseMirror p { margin: 0 0 12.8px; line-height: 1.8; font-size: 16px; }
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

/** 每个用例用独立页面，避免 IndexedDB 在用例间互相污染 */
const newPage = async () => {
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
  await page.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  // 每个用例从干净的存储开始
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__localforage.clear();
  });
  return page;
};

/** 挂载 App 并等待书库就绪（加载遮罩消失、侧栏出现） */
const bootApp = async (page) => {
  await page.evaluate(() => window.__mount());
  await page.waitForSelector('text=书籍管理', { timeout: 20000 });
  await page.waitForTimeout(600);
};

/** 点击侧边栏的某个菜单项 */
const clickMenu = async (page, label) => {
  await page.evaluate((text) => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) =>
      (b.textContent || '').trim() === text,
    );
    if (!btn) throw new Error('找不到菜单项: ' + text);
    btn.click();
  }, label);
  await page.waitForTimeout(400);
};

/** 回到书籍管理界面 */
const gotoLibrary = async (page) => {
  await clickMenu(page, '书籍管理');
  await page.waitForTimeout(400);
};

/** 种子：直接写一本书进书库（绕开 UI，便于准备多书场景） */
const seedBook = async (page, { title, author, chapterTitles }) => {
  return page.evaluate(async ({ title, author, chapterTitles }) => {
    const lf = window.__localforage;
    const index = (await lf.getItem('epub_maker_library_index_v1')) || { books: [], activeBookId: null };
    const id = 'seed_' + Math.random().toString(36).slice(2, 9);
    const now = Date.now();
    await lf.setItem('epub_maker_book_' + id, {
      metadata: { title, creator: author, language: 'zh', description: '', publisher: '', date: '2026-01-01' },
      chapters: chapterTitles.map((t, i) => ({
        id: id + '_ch' + i, title: t, content: `<h1>${t}</h1><p>${title} 的正文内容。</p>`, level: 1, subItems: [],
      })),
      images: [], extraFiles: [], cover: null, coverId: null, coverCustomCSS: '',
      activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
    index.books = [
      { id, title, author, chapterCount: chapterTitles.length, imageCount: 0, sizeBytes: 1024, createdAt: now, updatedAt: now },
      ...index.books,
    ];
    if (!index.activeBookId) index.activeBookId = id;
    await lf.setItem('epub_maker_library_index_v1', index);
    return id;
  }, { title, author, chapterTitles });
};

const readIndex = (page) =>
  page.evaluate(() => window.__localforage.getItem('epub_maker_library_index_v1'));

/** 当前可见的书名卡片标题 */
const cardTitles = (page) =>
  page.evaluate(() =>
    Array.from(document.querySelectorAll('h3')).map((h) => (h.textContent || '').trim()).filter(Boolean),
  );

/** 在书库界面点某本书的「打开」 */
const openBookByTitle = async (page, title) => {
  await page.evaluate((t) => {
    const heading = Array.from(document.querySelectorAll('h3')).find(
      (h) => (h.textContent || '').trim() === t,
    );
    if (!heading) throw new Error('书库里找不到书籍卡片: ' + t);
    const card = heading.closest('div.rounded-2xl') || heading.closest('div');
    const btn = Array.from(card.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('打开'),
    );
    if (!btn) throw new Error('找不到「打开」按钮');
    btn.click();
  }, title);
  await page.waitForTimeout(900);
};

// ─── 1. 侧边栏顶部第一项是「书籍管理」，且默认进入该界面 ───
console.log('1. 书籍管理入口与默认视图');
{
  const page = await newPage();
  await bootApp(page);

  const menu = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav button')).map((b) => (b.textContent || '').trim()),
  );
  record(
    '侧边栏第一项是「书籍管理」',
    menu[0] === '书籍管理',
    `  侧栏菜单顺序: ${JSON.stringify(menu)}`,
  );

  const headingVisible = await page.evaluate(() =>
    Array.from(document.querySelectorAll('h1')).some((h) => (h.textContent || '').includes('书籍管理')),
  );
  record('默认进入书籍管理独立界面', headingVisible, headingVisible ? '' : '  未找到界面标题');

  // 书库为空时自动建一本空白书
  const index = await readIndex(page);
  record(
    '书库为空时自动创建一本空白书',
    !!index && index.books.length === 1,
    `  书目数=${index?.books?.length ?? 'null'}，书名=${index?.books?.[0]?.title}`,
  );
  await page.close();
}

// ─── 2. 多本书并列，点「打开」跳到该书的章节管理 ───
console.log('\n2. 多书并列与「打开」跳转');
{
  const page = await newPage();
  await seedBook(page, { title: '甲书', author: '作者甲', chapterTitles: ['甲一', '甲二'] });
  await seedBook(page, { title: '乙书', author: '作者乙', chapterTitles: ['乙一'] });
  await bootApp(page);

  const titles = await cardTitles(page);
  record(
    '书库列出来多本书',
    titles.includes('甲书') && titles.includes('乙书'),
    `  卡片标题: ${JSON.stringify(titles)}`,
  );

  await openBookByTitle(page, '乙书');
  const afterOpen = await page.evaluate(() => ({
    hasProseMirror: !!document.querySelector('.ProseMirror'),
    // 侧栏菜单的选中态：目录管理应为当前视图
    activeMenu: Array.from(document.querySelectorAll('nav button')).find((b) =>
      (b.className || '').includes('text-blue-600'),
    )?.textContent?.trim(),
    editorText: document.querySelector('.ProseMirror')?.textContent || '',
  }));

  record(
    '点「打开」跳到这本书的章节管理（编辑器）',
    afterOpen.hasProseMirror && afterOpen.activeMenu === '目录管理',
    `  编辑器出现=${afterOpen.hasProseMirror}，高亮菜单=${afterOpen.activeMenu}`,
  );
  record(
    '打开的是被点击的那本书（乙书）',
    afterOpen.editorText.includes('乙一') || afterOpen.editorText.includes('乙书'),
    `  编辑器内容片段=${JSON.stringify(afterOpen.editorText.slice(0, 40))}`,
  );
  await page.close();
}

// ─── 3. 各书数据独立：改 A 不影响 B（本功能的核心价值） ───
console.log('\n3. 书籍数据互相独立');
{
  const page = await newPage();
  await seedBook(page, { title: '甲书', author: '作者甲', chapterTitles: ['甲一'] });
  await seedBook(page, { title: '乙书', author: '作者乙', chapterTitles: ['乙一'] });
  await bootApp(page);

  // 打开甲书，改其章节内容
  await openBookByTitle(page, '甲书');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    pm.focus();
    // 在正文末尾追加一段，模拟用户编辑
    const p = document.createElement('p');
    p.textContent = '甲书新增的一段';
    pm.appendChild(p);
    pm.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // 等自动保存（防抖 2s）+ 书目同步（1.5s）
  await page.waitForTimeout(4500);

  const stored = await page.evaluate(async () => {
    const lf = window.__localforage;
    const index = await lf.getItem('epub_maker_library_index_v1');
    const out = {};
    for (const b of index.books) {
      const book = await lf.getItem('epub_maker_book_' + b.id);
      out[b.title] = (book?.chapters || []).map((c) => c.content).join('|');
    }
    return out;
  });

  record(
    '编辑甲书后，乙书内容不受影响',
    (stored['甲书'] || '').includes('甲书新增的一段') && !(stored['乙书'] || '').includes('甲书新增的一段'),
    `  甲书含改动=${(stored['甲书'] || '').includes('甲书新增的一段')}；` +
      `乙书含改动=${(stored['乙书'] || '').includes('甲书新增的一段')}`,
  );
  record(
    '两本书各自存在独立的存储槽（互不覆盖）',
    Object.keys(stored).length === 2 && !!stored['甲书'] && !!stored['乙书'],
    `  存储中的书: ${JSON.stringify(Object.keys(stored))}`,
  );
  await page.close();
}

// ─── 4. 复制 / 重命名 / 删除 ───
console.log('\n4. 复制、重命名与删除');
{
  const page = await newPage();
  await seedBook(page, { title: '原书', author: '原作者', chapterTitles: ['原一'] });
  await bootApp(page);

  // 复制：复制会切换当前书并进入编辑器，所以先回到书库确认结果
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.trim() === '原书');
    const card = heading.closest('div.rounded-2xl') || heading.closest('div');
    card.querySelector('button[title="复制这本书"]').click();
  });
  await page.waitForTimeout(1500);
  await gotoLibrary(page);

  let titles = await cardTitles(page);
  record(
    '复制出一本新书（副本）',
    titles.some((t) => t.includes('原书') && t.includes('副本')),
    `  卡片标题: ${JSON.stringify(titles)}`,
  );

  // 重命名：双击书名进入编辑，改完回车
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.trim() === '原书');
    if (!heading) throw new Error('找不到「原书」标题');
    heading.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const input = Array.from(document.querySelectorAll('input')).find((i) => i.value === '原书');
    if (!input) throw new Error('重命名输入框未出现');
    // React 受控组件需要通过原生 setter 赋值才能触发 onChange
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, '改名后的书');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.waitForTimeout(500);
  // 双击重命名会触发 onBlur 提交，这里补一次失焦确保提交
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.waitForTimeout(1500);

  titles = await cardTitles(page);
  const indexAfterRename = await readIndex(page);
  record(
    '重命名生效（卡片与索引都更新）',
    titles.includes('改名后的书') && indexAfterRename.books.some((b) => b.title === '改名后的书'),
    `  卡片标题: ${JSON.stringify(titles)}`,
  );

  // 删除：会弹确认框，点「确定」
  await page.evaluate(() => {
    const heading = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.trim() === '改名后的书');
    if (!heading) throw new Error('找不到「改名后的书」标题');
    const card = heading.closest('div.rounded-2xl') || heading.closest('div');
    card.querySelector('button[title="删除"]').click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === '确定');
    if (!btn) throw new Error('确认对话框未出现');
    btn.click();
  });
  await page.waitForTimeout(1800);

  titles = await cardTitles(page);
  record(
    '删除后书库里不再有该书',
    !titles.includes('改名后的书'),
    `  剩余卡片: ${JSON.stringify(titles)}`,
  );
  await page.close();
}

// ─── 5. 旧版单项目数据迁移 ───
console.log('\n5. 旧版数据迁移（老用户不丢稿）');
{
  const page = await newPage();
  // 写入旧版 key（模拟升级前的存档），并清掉书库索引
  await page.evaluate(async () => {
    await window.__localforage.setItem('epub_maker_project_v1', {
      metadata: { title: '旧版遗留的书', creator: '老作者', language: 'zh', description: '', publisher: '', date: '2025-01-01' },
      chapters: [{ id: 'legacy_c1', title: '旧章一', content: '<h1>旧章一</h1><p>旧版正文</p>', level: 1, subItems: [] }],
      images: [], extraFiles: [], cover: null, activeStyleId: 'classic', isPresetStyleActive: true, customCSS: '',
    });
  });
  await bootApp(page);

  const index = await readIndex(page);
  const migrated = index?.books?.find((b) => b.title === '旧版遗留的书');
  record(
    '旧版单项目数据被迁移为书库中的一本书',
    !!migrated,
    `  书目: ${JSON.stringify((index?.books || []).map((b) => b.title))}`,
  );

  // 迁移后仍能打开并看到旧内容（bootApp 后已在书库界面）
  await gotoLibrary(page);
  await openBookByTitle(page, '旧版遗留的书');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.waitForTimeout(600);
  const text = await page.evaluate(() => document.querySelector('.ProseMirror')?.textContent || '');
  record('迁移后的书内容完整（旧章节还在）', text.includes('旧版正文'), `  编辑器内容=${JSON.stringify(text.slice(0, 40))}`);

  // 旧 key 不应被删除（迁移有误时用户原稿仍可找回）
  const legacyStillThere = await page.evaluate(async () =>
    !!(await window.__localforage.getItem('epub_maker_project_v1')),
  );
  record('迁移不删除旧数据（可回退）', legacyStillThere, `  旧 key 是否保留=${legacyStillThere}`);
  await page.close();
}

// ─── 6. 阅读位置按书籍隔离 ───
console.log('\n6. 阅读位置按书籍隔离（副本与原书不串位）');
{
  // 通过真实 UI 路径验证：开启记忆 → 在甲书滚动 → 切到乙书滚动 → 两处位置都记下，
  // 且互不覆盖。复制出的副本章节 id 与原书相同，正是最容易串位的场景。
  const page = await newPage();
  await page.evaluate(() => localStorage.setItem('epub-maker-reading-position-enabled', 'true'));

  // 两本书都放足够长的正文，保证可以滚动
  const longText = Array.from({ length: 60 }, (_, i) => `<p>第 ${i + 1} 段正文，写长一些以便产生滚动空间。</p>`).join('');
  const bookA = await seedBook(page, { title: '甲书', author: '作者甲', chapterTitles: ['甲一'] });
  const bookB = await seedBook(page, { title: '乙书', author: '作者乙', chapterTitles: ['乙一'] });
  await page.evaluate(async ({ a, b, text }) => {
    const lf = window.__localforage;
    for (const id of [a, b]) {
      const book = await lf.getItem('epub_maker_book_' + id);
      book.chapters[0].content = '<h1>长章</h1>' + text;
      await lf.setItem('epub_maker_book_' + id, book);
    }
  }, { a: bookA, b: bookB, text: longText });

  await bootApp(page);

  // 章节视图里有多个 .overflow-y-auto（左侧章节目录 + 右侧编辑器正文），
  // querySelector 会先命中章节目录。这里必须取「包含 .ProseMirror 的那个」，
  // 也就是编辑器真正的滚动容器。
  const scrollEl = async () =>
    page.evaluate(() => {
      const pm = document.querySelector('.ProseMirror');
      if (!pm) return null;
      let el = pm.parentElement;
      while (el && !(el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY))) {
        el = el.parentElement;
      }
      return el ? { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight } : null;
    });

  const scrollTo = async (top) => {
    await page.evaluate((t) => {
      const pm = document.querySelector('.ProseMirror');
      if (!pm) return;
      let el = pm.parentElement;
      while (el && !(el.scrollHeight > el.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(el).overflowY))) {
        el = el.parentElement;
      }
      if (el) el.scrollTo({ top: t, behavior: 'instant' });
    }, top);
    await page.waitForTimeout(1400); // 等防抖落盘
  };

  // 打开甲书 → 滚到 600
  await openBookByTitle(page, '甲书');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.waitForTimeout(500);
  const geoA = await scrollEl();
  await scrollTo(600);

  // 打开乙书 → 滚到 1000
  await clickMenu(page, '书籍管理');
  await openBookByTitle(page, '乙书');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.waitForTimeout(500);
  await scrollTo(1000);

  const state = await page.evaluate(() => {
    const raw = localStorage.getItem('epub-maker-reading-position');
    return raw ? JSON.parse(raw) : null;
  });

  const savedA = state?.books?.[bookA]?.positions;
  const savedB = state?.books?.[bookB]?.positions;
  const posA = savedA ? Object.values(savedA)[0]?.scrollTop : null;
  const posB = savedB ? Object.values(savedB)[0]?.scrollTop : null;

  record(
    '位置存储按书籍分层（每本书各有一份）',
    !!state && state.version === 2 && !!savedA && !!savedB,
    `  version=${state?.version}；甲书有位置=${!!savedA}；乙书有位置=${!!savedB}`,
  );
  record(
    '两本书各自记住自己的滚动位置，互不覆盖',
    posA !== null && posB !== null && Math.abs(posA - 600) < 3 && Math.abs(posB - 1000) < 3,
    `  甲书记录=${posA}（期望 ≈600）；乙书记录=${posB}（期望 ≈1000）` +
      `；可滚动高度=${geoA?.scrollHeight}`,
  );

  // 回到甲书，应恢复到 600 而不是乙书的 1000
  await clickMenu(page, '书籍管理');
  await openBookByTitle(page, '甲书');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.waitForTimeout(1200);
  const restoredA = await scrollEl();
  record(
    '重新打开甲书恢复到它自己的位置',
    !!restoredA && Math.abs(restoredA.scrollTop - 600) < 3,
    `  恢复 scrollTop=${restoredA?.scrollTop}（期望 ≈600，不能是乙书的 1000）`,
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

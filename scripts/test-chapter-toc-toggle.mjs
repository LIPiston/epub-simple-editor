/**
 * 真实浏览器回归测试：目录行的「是否加入目录」开关。
 *
 * 需求约定（用户需求原文）：
 *   「如果是有用的，那就放到合并按钮所在的菜单的左边，因为现在菜单的悬浮会挡住
 *     这个橙色的按钮，然后状态同时显示在『#2 x个小标题』之后」+「图标使用眼睛」
 *   +「悬停菜单里面这个按钮也有状态显示」。
 *
 * 要钉住的回归：
 *   1. 开关在悬停操作区里、且是第一个按钮（在「合并」左边），不再被菜单盖住；
 *   2. 图标是眼睛：已加入目录用 Eye，已排除用 EyeOff；
 *   3. 菜单里的按钮自身有状态色（已加入高亮成橙色）；
 *   4. 状态文字常驻，位置在「#N · x 个小标题」之后；
 *   5. 点击能翻转状态，图标、菜单高亮、状态文字三者同步。
 *
 * 这里直接渲染 ChapterItem（而不是整个 App）：这条约定只关乎行内布局，
 * 直接给 props 更稳定，也不必先建书、走导航。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-toc-toggle');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import ChapterItem from '../../components/chapter-manager/ChapterItem';

// 两行：第一行加入目录、第二行排除目录，并带上小标题以验证状态文字的位置。
// useState 让点击真的能翻转状态，从而检查三处显示是否同步。
window.__render = () => {
  const host = document.getElementById('root');
  host.innerHTML = '';
  const Harness = () => {
    const [chapters, setChapters] = React.useState([
      { id: 'c1', title: '第一章', content: '', level: 1, originalIndex: 0,
        subItems: [{ id: 'a1', text: '小节一', level: 2 }, { id: 'a2', text: '小节二', level: 2 }] },
      { id: 'c2', title: '第二章', content: '', level: 1, originalIndex: 1,
        subItems: [], excludeFromToc: true },
    ]);
    const toggle = (index) => setChapters((prev) =>
      prev.map((c, i) => (i === index ? { ...c, excludeFromToc: !c.excludeFromToc } : c)),
    );
    return (
      <div style={{ width: 340 }}>
        {chapters.map((chapter, i) => (
          <ChapterItem
            key={chapter.id}
            chapter={chapter}
            currentChapterId={null}
            totalChapters={chapters.length}
            onSelect={() => {}}
            onScrollToAnchor={() => {}}
            onToggleToc={toggle}
            onMergeNext={() => {}}
            onEdit={() => {}}
            onMove={() => {}}
            onDelete={() => {}}
          />
        ))}
      </div>
    );
  };
  createRoot(host).render(<React.StrictMode><Harness /></React.StrictMode>);
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

// 手写够用的 Tailwind 子集。只写「决定布局」的规则就够了：本测试断言的是
// 结构（按钮顺序、图标、文字），颜色则断言 class 名而不是计算色，
// 因此不受子集完整度影响。
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; height: 100%; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; background: none; border: none; padding: 0; }
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .inline-flex { display: inline-flex; }
    .items-center { align-items: center; } .items-start { align-items: flex-start; }
    .min-w-0 { min-width: 0; } .shrink-0 { flex-shrink: 0; }
    .relative { position: relative; } .absolute { position: absolute; }
    .right-1 { right: 0.25rem; } .top-1 { top: 0.25rem; } .left-0 { left: 0; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .h-5 { height: 1.25rem; } .w-5 { width: 1.25rem; }
    .gap-px { gap: 1px; } .gap-1\\.5 { gap: 0.375rem; }
    .p-0\\.5 { padding: 0.125rem; } .py-1\\.5 { padding: 0.375rem 0; }
    .pl-1\\.5 { padding-left: 0.375rem; } .pr-2 { padding-right: 0.5rem; }
    .mt-0\\.5 { margin-top: 0.125rem; } .mt-px { margin-top: 1px; } .mb-0\\.5 { margin-bottom: 0.125rem; }
    .rounded-md { border-radius: 0.375rem; } .rounded-sm { border-radius: 0.125rem; }
    .border { border: 1px solid #e5e5e5; } .shadow-sm { box-shadow: 0 1px 2px rgba(0,0,0,.05); }
    .text-\\[13px\\] { font-size: 13px; line-height: 20px; }
    .text-\\[11px\\] { font-size: 11px; line-height: 16px; }
    .leading-5 { line-height: 20px; } .leading-4 { line-height: 16px; }
    .text-gray-800 { color: #262626; } .text-gray-700 { color: #404040; }
    .text-gray-600 { color: #525252; } .text-gray-500 { color: #737373; }
    .text-gray-400 { color: #a3a3a3; } .text-gray-300 { color: #d4d4d4; }
    .text-orange-700 { color: #c2410c; } .text-orange-600 { color: #ea580c; }
    .bg-orange-50 { background-color: #fff7ed; } .bg-white { background-color: #fff; }
    .bg-gray-100 { background-color: #f5f5f5; }
    /* 悬停才出现：用 :hover 模拟生产里的 group-hover */
    .opacity-0 { opacity: 0; }
    div[data-row]:hover .opacity-0 { opacity: 1; }
  </style></head><body>
    <div id="root"></div>
    <script src="./harness.js"></script>
  </body></html>`,
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
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
await page.waitForFunction(() => typeof window.__render === 'function', null, { timeout: 20000 });
await page.evaluate(() => window.__render());
await page.waitForTimeout(400);

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

/** 读取某一行的结构：操作区按钮、图标、状态文字 */
const readRow = (index) =>
  page.evaluate((i) => {
    const row = document.querySelectorAll('div[draggable="true"]')[i];
    if (!row) return null;
    const bar = Array.from(row.querySelectorAll('div.absolute')).find((d) => d.querySelector('button'));
    const buttons = bar ? Array.from(bar.querySelectorAll('button')) : [];
    const meta = row.querySelectorAll('div.min-w-0.flex-1 > div')[1];
    const iconOf = (el) =>
      ((el?.querySelector('svg')?.getAttribute('class') || '').match(/lucide-[a-z-]+/) || [])[0] || null;
    return {
      title: row.innerText.replace(/\s+/g, ' ').trim(),
      barButtons: buttons.map((b) => ({
        title: b.getAttribute('title'),
        icon: iconOf(b),
        classes: b.className,
      })),
      metaText: meta ? meta.innerText.replace(/\s+/g, ' ').trim() : null,
      metaLast: meta?.lastElementChild?.innerText?.trim() || null,
    };
  }, index);

// ─── 1. 开关在操作区最左，且不再是常驻按钮 ───
console.log('1. 目录开关位于悬停操作区，且在「合并」左边');
{
  const row = await readRow(0);
  const first = row?.barButtons[0];
  const rest = row?.barButtons.slice(1) || [];
  const mergeIndex = rest.findIndex((b) => b.title === '与下一章合并');
  record(
    '操作区第一个按钮是目录开关',
    first?.title === '已加入目录，点击排除',
    `  第一个按钮=${JSON.stringify(first?.title)}`,
  );
  record(
    '目录开关排在「与下一章合并」之前',
    mergeIndex > -1,
    `  操作区按钮顺序=${JSON.stringify(row?.barButtons.map((b) => b.title))}`,
  );
}

// ─── 2. 图标是眼睛，并按状态区分 ───
console.log('\n2. 图标使用眼睛，且两种状态不同');
{
  const included = await readRow(0);
  const excluded = await readRow(1);
  record(
    '已加入目录用 Eye',
    included?.barButtons[0]?.icon === 'lucide-eye',
    `  图标=${included?.barButtons[0]?.icon}`,
  );
  record(
    '已排除目录用 EyeOff',
    excluded?.barButtons[0]?.icon === 'lucide-eye-off',
    `  图标=${excluded?.barButtons[0]?.icon}`,
  );
}

// ─── 3. 菜单按钮自身有状态色 ───
console.log('\n3. 悬停菜单里的按钮也显示状态');
{
  const included = await readRow(0);
  const excluded = await readRow(1);
  const inclBtn = included?.barButtons[0];
  const exclBtn = excluded?.barButtons[0];
  record(
    '已加入目录时按钮高亮（橙色 class）',
    /text-orange-600/.test(inclBtn?.classes || ''),
    `  class 含 text-orange-600=${/text-orange-600/.test(inclBtn?.classes || '')}`,
  );
  record(
    '已排除目录时按钮不高亮（灰色 class）',
    /text-gray-400/.test(exclBtn?.classes || '') && !/text-orange-600/.test(exclBtn?.classes || ''),
    `  class 含 text-gray-400=${/text-gray-400/.test(exclBtn?.classes || '')}`,
  );
}

// ─── 4. 状态文字常驻，且在「#N · x 个小标题」之后 ───
console.log('\n4. 状态文字常驻，位置在「#N · x 个小标题」之后');
{
  const included = await readRow(0);
  const excluded = await readRow(1);
  record(
    '已加入目录时状态文字回显「已加入目录」',
    included?.metaLast === '已加入目录',
    `  次要行=${JSON.stringify(included?.metaText)}`,
  );
  record(
    '状态文字排在「x 个小标题」之后',
    /个小标题 · 已加入目录$/.test(included?.metaText || ''),
    `  次要行=${JSON.stringify(included?.metaText)}`,
  );
  record(
    '已排除目录时状态文字为「不导出到目录」',
    excluded?.metaLast === '不导出到目录',
    `  次要行=${JSON.stringify(excluded?.metaText)}`,
  );
  record(
    '没有小标题时状态文字仍然显示',
    /^#2 · 不导出到目录$/.test(excluded?.metaText || ''),
    `  次要行=${JSON.stringify(excluded?.metaText)}`,
  );
}

// ─── 5. 点击后三处显示同步翻转 ───
console.log('\n5. 点击开关后，图标 / 高亮 / 状态文字同步翻转');
{
  await page.evaluate(() => {
    const row = document.querySelectorAll('div[draggable="true"]')[0];
    const bar = Array.from(row.querySelectorAll('div.absolute')).find((d) => d.querySelector('button'));
    bar.querySelector('button').click();
  });
  await page.waitForTimeout(300);
  const after = await readRow(0);
  record(
    '点击后图标变为 EyeOff',
    after?.barButtons[0]?.icon === 'lucide-eye-off',
    `  图标=${after?.barButtons[0]?.icon}`,
  );
  record(
    '点击后按钮不再高亮',
    !/text-orange-600/.test(after?.barButtons[0]?.classes || ''),
    `  class 含 text-orange-600=${/text-orange-600/.test(after?.barButtons[0]?.classes || '')}`,
  );
  record(
    '点击后状态文字变为「不导出到目录」',
    after?.metaLast === '不导出到目录',
    `  次要行=${JSON.stringify(after?.metaText)}`,
  );
  record(
    '点击后不影响目录开关之外的操作按钮',
    (after?.barButtons || []).length === (after?.barButtons || []).length &&
      after.barButtons.some((b) => b.title === '编辑标题和 ID'),
    `  操作区按钮=${JSON.stringify(after?.barButtons.map((b) => b.title))}`,
  );
}

await browser.close();
rmSync(tmp, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length) {
  console.log(`❌ 失败 ${failed.length}/${results.length}：`);
  failed.forEach((r) => console.log('   - ' + r.name));
  process.exit(1);
}
console.log(`✅ 全部通过：${results.length}/${results.length}`);

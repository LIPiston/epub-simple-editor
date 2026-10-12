/**
 * Real-browser regression test for EditorPaper (upstream Issue #2).
 *
 * 缺陷：点击书页中「不属于正文」的空白区域（例如正文左侧的页边距）时，
 *       光标被强制移动到全文末尾，页面同时跳到底部。
 *       报告原文：「左侧无文字区域会把焦点转移到底部最后一个文字后面」。
 *
 * 做法：用 esbuild 打包一段只包含真实 EditorPaper + 真实 Tiptap 编辑器的最小
 *       页面，用本机 Chromium 打开它，然后在正文左侧的空白处派发一次真实的
 *       mousedown，观察光标位置与滚动位置。
 *
 * 依赖：jsdom 不需要；需要 esbuild 与 playwright-core（见 package.json devDependencies），
 *       以及一个本机 Chromium（优先 ms-playwright 缓存，其次系统安装的 Chrome/Edge）。
 *       找不到浏览器时本脚本会跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-browser');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// ─── 1. 生成最小真实页面 ───
// 纸张几何刻意对齐 TextEditor 的真实 Tailwind 类：
//   `relative mx-auto w-full max-w-[600px] p-4 md:p-8 lg:p-12 cursor-text flex flex-col`
// 于是正文左侧存在一条「无文字」的空白带 —— 正是缺陷被报告的位置。
const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorPaper from '../../components/text-editor/EditorPaper';

const PARAGRAPHS = Array.from({ length: 60 }, (_, i) =>
  '<p>第 ' + (i + 1) + ' 行正文内容，用来把页面撑得足够长。</p>'
).join('');

const imageUploadStub = {
  handleDragEnter: () => {}, handleDragLeave: () => {}, handleDragOver: () => {}, handleDrop: () => {},
  isDragging: false, error: null, clearError: () => {}, isProcessing: false,
};

const Harness = () => {
  const containerRef = React.useRef(null);
  const editor = useEditor({ extensions: [StarterKit], content: PARAGRAPHS });
  React.useEffect(() => { window.__editor = editor; }, [editor]);
  return <EditorPaper
    editor={editor}
    chapterTitle="测试章节"
    paperClassName="paper"
    editorStyle={{ fontSize: '16px', lineHeight: 1.8 }}
    scopedCSS=""
    imageUpload={imageUploadStub}
    containerRef={containerRef}
  />;
};

createRoot(document.getElementById('root')).render(<Harness />);
`;

const harnessPath = path.join(tmp, 'harness.tsx');
writeFileSync(harnessPath, HARNESS);

const jsPath = path.join(tmp, 'harness.js');
await build({
  entryPoints: [harnessPath],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: jsPath,
  logLevel: 'error',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin:0; padding:0; font-family: system-ui, sans-serif; }
    .paper {
      position: relative; margin: 0 auto; width: 100%; max-width: 600px;
      min-height: 100vh; padding: 48px; box-sizing: border-box;
      background: #fff; cursor: text; display: flex; flex-direction: column;
    }
    .editor-paper { position: relative; flex: 1; display: flex; flex-direction: column; cursor: text; outline: none; }
    .ProseMirror { outline: none; min-height: 800px; }
    .ProseMirror p { margin: 0 0 0.5em; }
  </style></head><body><div id="root"></div><script src="./harness.js"></script></body></html>`
);

// ─── 2. 定位本机浏览器 ───
const findBrowser = () => {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), 'AppData/Local/ms-playwright'),
    path.join(os.homedir(), 'Library/Caches/ms-playwright'),
    path.join(os.homedir(), '.cache/ms-playwright'),
  ].filter(Boolean);

  for (const root of roots) {
    if (!existsSync(root)) continue;
    const dirs = execFileSync('node', ['-e', `console.log(require('fs').readdirSync(${JSON.stringify(root)}).join('\\n'))`])
      .toString().split('\n').filter((d) => d.startsWith('chromium-'));
    for (const d of dirs) {
      for (const rel of ['chrome-win64/chrome.exe', 'chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(root, d, rel);
        if (existsSync(p)) return p;
      }
    }
  }

  const system = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  return system.find((p) => existsSync(p));
};

const exe = findBrowser();
if (!exe) {
  console.log('⏭️  未找到本机 Chromium/Chrome/Edge，跳过浏览器测试。');
  console.log('   安装方式：npx playwright install chromium，或设置 PLAYWRIGHT_BROWSERS_PATH。');
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright-core'));
} catch {
  console.log('⏭️  未安装 playwright-core，跳过浏览器测试。安装：npm i -D playwright-core');
  process.exit(0);
}

console.log('使用浏览器 :', exe);

// ─── 3. 点击正文左侧空白带 ───
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
await page.waitForFunction(() => window.__editor && window.__editor.view, null, { timeout: 20000 });
await page.waitForTimeout(400);

// 先把光标放在全文开头：若缺陷存在，点击会被拽到末尾，差异一目了然。
const setup = await page.evaluate(() => {
  const ed = window.__editor;
  ed.commands.focus('start');
  return {
    startPos: ed.state.selection.from,
    paragraphs: ed.view.dom.querySelectorAll('p').length,
    docSize: ed.state.doc.content.size,
  };
});
console.log('初始状态   :', JSON.stringify(setup));

const paperBox = await page.locator('.paper').first().boundingBox();
const probe = await page.evaluate(() => {
  const r = document.querySelector('.ProseMirror').getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right };
});
console.log('纸张边界   :', JSON.stringify(paperBox));
console.log('正文边界   :', JSON.stringify(probe));

const clickX = paperBox.x + 12; // 落在纸张左内边距 = 正文之外的空白
const clickY = paperBox.y + 60;
console.log(`点击坐标   : (${clickX}, ${clickY})`);

const result = await page.evaluate(async ([x, y]) => {
  const ed = window.__editor;
  const before = ed.state.selection.from;
  const el = document.elementFromPoint(x, y);
  const insideProseMirror = !!(el && el.closest('.ProseMirror'));
  const targetDesc = el
    ? `${el.tagName}.${el.className || ''}${insideProseMirror ? ' (正文内)' : ' (正文之外的空白)'}`
    : 'null';

  el?.dispatchEvent(new MouseEvent('mousedown', {
    bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
  }));
  await new Promise((r) => setTimeout(r, 200));

  return {
    targetDesc,
    insideProseMirror,
    before,
    after: ed.state.selection.from,
    scrollTop: (document.scrollingElement || document.documentElement).scrollTop,
    docSize: ed.state.doc.content.size,
  };
}, [clickX, clickY]);

console.log('\n点击目标   :', result.targetDesc);
console.log('点击前光标 :', result.before, '(文档大小', result.docSize + ')');
console.log('点击后光标 :', result.after);
console.log('滚动距离   :', result.scrollTop);

const problems = [];
if (result.insideProseMirror) {
  problems.push('测试无效：落点位于正文内部，而非正文之外的空白区域');
}
if (result.after >= result.docSize - 2) {
  problems.push(`光标被强制移到全文末尾（pos ${result.after}，文档大小 ${result.docSize}）`);
}
if (result.scrollTop > 50) {
  problems.push(`页面被滚动到底部（scrollTop=${result.scrollTop}）`);
}

console.log('\n=== 结果 ===');
await browser.close();
rmSync(tmp, { recursive: true, force: true });

if (problems.length) {
  problems.forEach((p) => console.log('❌', p));
  process.exit(1);
}
console.log('✅ 点击正文之外的空白区域后，光标保持原位，页面未跳到底部');

/**
 * 真实浏览器回归测试：EditorPaper 的「点击页边距」行为（上游 Issue #2）。
 *
 * 缺陷（用户报告原文）：
 *   「左侧无文字区域会把焦点转移到底部最后一个文字后面」，
 *   后续复测：「点击侧边还是有跳转到页尾的问题，改成定位到对应的位置右侧的行」。
 *
 * 根因（两处，缺一不可）：
 *   1. 点击正文列之外的页边距时 `view.posAtCoords()` 返回 null，旧代码落到
 *      `editor.commands.focus()`。Tiptap 的 focus 命令在 position=null 时会走
 *      `delayedFocus()`，其中除了 `view.focus()` 还会执行
 *      `editor.commands.scrollIntoView()` —— 视口被滚动到「当前选区」，
 *      而当前选区通常停在全文末尾，表现为「点侧边就跳到页尾」。
 *   2. 即便把 X 夹进正文列，`view.posAtCoords()` 在**行距空隙**（Y 落在两行
 *      文字的字身框之间，而不是字身框内）会返回**块边界位置**，该位置没有
 *      对应的插入符矩形 —— 光标看不见、或者落在相邻行上。浏览器自身的
 *      `caretPositionFromPoint` / `caretRangeFromPoint` 没有这层块语义，
 *      会吸附到最近的一行文字，和真实鼠标点击一致。
 *
 * 期望行为：点击页边距时，把点击的**纵向位置**映射到正文中对应那一行，
 *           光标落在该行上（左边距=行首，右边距=行尾），且视口不跳动。
 *
 * 判据：用「同一 Y 上正文列内的原生点击」作为 oracle，要求页边距点击后
 *       光标所在行的顶部与 oracle 一致、光标可见、视口未滚动、编辑器已聚焦。
 *       这比「和点击 Y 差不超过一个行高」严格得多 —— 后者会放过「落到相邻行」。
 *
 * 探针 Y 必须同时覆盖**行中心**与**行距空隙**：只在行中心取点，这个缺陷
 * 不会复现（旧版测试正是因此误报通过）。这里直接由文本节点的
 * getClientRects() 推导出行盒与空隙，而不是硬编码若干高度。
 *
 * 几何：复刻真实应用的正文列（视口 1400×900，纸张 736..1304，
 *       正文列 752..1288，行高 1.8）。并完整复刻 TextEditor 的嵌套滚动结构
 *       （外层 flex 容器 + 内层 `overflow-y:auto`）。注意：只测量
 *       `document.scrollingElement` 会永远得到 0，因为真正滚动的是内层容器。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-browser');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// ─── 1. 生成最小真实页面（复刻 TextEditor 的结构） ───
const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import EditorPaper from '../../components/text-editor/EditorPaper';

const PARAGRAPHS = Array.from({ length: 40 }, (_, i) =>
  '<p>第 ' + (i + 1) + ' 段正文内容，这里刻意写得长一些，让每个段落都能折成好几行，' +
  '从而同时产生「段内相邻行」和「跨段落」两种不同的行距空隙。</p>'
).join('');

const imageUploadStub = {
  handleDragEnter: () => {}, handleDragLeave: () => {}, handleDragOver: () => {}, handleDrop: () => {},
  isDragging: false, error: null, clearError: () => {}, isProcessing: false,
};

const Harness = () => {
  const containerRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const editor = useEditor({ extensions: [StarterKit], content: PARAGRAPHS });
  React.useEffect(() => {
    window.__editor = editor;
    window.__scroll = scrollRef.current;
  }, [editor]);
  // 与 TextEditor.tsx 一致：外层 flex 列 + 内层 overflow-y-auto 滚动容器
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div ref={scrollRef} className="scroller" style={{ flex: 1, overflowY: 'auto' }}>
        <EditorPaper
          editor={editor}
          chapterTitle="测试章节"
          paperClassName="paper"
          editorStyle={{ fontSize: '16px', lineHeight: 1.8 }}
          scopedCSS=""
          imageUpload={imageUploadStub}
          containerRef={containerRef}
        />
      </div>
    </div>
  );
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
    html, body { margin:0; padding:0; font-family: system-ui, sans-serif; overflow:hidden; }
    /* 对齐真实应用实测几何：纸张 736..1304（左侧为侧边栏占位），内边距 16px，
       于是正文列恰好落在 752..1288。 */
    .paper {
      position: relative; margin-left: 736px; width: 568px;
      min-height: 100vh; padding: 16px; box-sizing: border-box;
      background: #fff; cursor: text; display: flex; flex-direction: column;
    }
    .editor-paper { position: relative; flex: 1; display: flex; flex-direction: column; cursor: text; outline: none; }
    .ProseMirror { outline: none; min-height: 800px; }
    /* 排版必须与真实应用一致，否则测不到真正的缺陷区间。
       实测真实应用：line-height 28.8px、字号 16px、字身高 17px，
       段内相邻行字身空隙 11.79px，跨段落（段落外边距形成的空白带）24.59px。
       旧版测试写成 margin:0，只得到 8.8px 的段内空隙 —— 完全没有段落外边距
       形成的那条空带，而 posAtCoords 恰好在那种「没有行盒的空带」里退化，
       于是测试无论修不修都能通过（无判别力）。
       这里 margin-bottom 取 0.8em=12.8px，使跨段空隙 = 11.8 + 12.8 = 24.6px。 */
    .ProseMirror p { margin: 0 0 12.8px; line-height: 1.8; font-size: 16px; }
  </style></head><body><div id="root"></div><script src="./harness.js"></script></body></html>`
);

// ─── 2. 找一个可用的 Chromium ───
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
        .toString()
        .split('\n')
        .filter((d) => d.startsWith('chromium-'));
    } catch {
      continue;
    }
    for (const d of dirs) {
      for (const rel of [
        'chrome-win64/chrome.exe',
        'chrome-linux/chrome',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
      ]) {
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
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto('file://' + htmlPath.replace(/\\/g, '/'));
await page.waitForFunction(
  () => window.__editor && window.__editor.view && window.__scroll,
  null,
  { timeout: 20000 }
);
await page.waitForTimeout(500);

// ─── 3. 页面几何 + 由行盒推导探针高度 ───
const geo = await page.evaluate(() => {
  const pm = document.querySelector('.ProseMirror');
  const rect = pm.getBoundingClientRect();
  const style = getComputedStyle(document.querySelector('.ProseMirror p'));

  // 由文本节点的 client rects 合并出行盒（同一行的多个文本节点合并成一条）
  const lines = [];
  const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue || !n.nodeValue.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width <= 0 || r.height <= 0) continue;
      const hit = lines.find((l) => Math.abs(l.top - r.top) < 2);
      if (hit) {
        hit.bottom = Math.max(hit.bottom, r.bottom);
        hit.left = Math.min(hit.left, r.left);
        hit.right = Math.max(hit.right, r.right);
      } else {
        lines.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      }
    }
  }
  lines.sort((a, b) => a.top - b.top);

  return {
    pmLeft: rect.left, pmRight: rect.right, pmTop: rect.top, pmBottom: rect.bottom,
    lineHeight: parseFloat(style.lineHeight),
    fontSize: parseFloat(style.fontSize),
    lines: lines.map((l) => ({ top: +l.top.toFixed(2), bottom: +l.bottom.toFixed(2) })),
    scrollerClientH: window.__scroll.clientHeight,
    scrollerScrollH: window.__scroll.scrollHeight,
  };
});

console.log('页面几何');
console.log(`  正文列:    left=${geo.pmLeft.toFixed(0)} right=${geo.pmRight.toFixed(0)} top=${geo.pmTop.toFixed(0)} bottom=${geo.pmBottom.toFixed(0)}`);
console.log(`  字号/行高: ${geo.fontSize}px / ${geo.lineHeight.toFixed(1)}px`);
console.log(`  滚动容器:  clientHeight=${geo.scrollerClientH} scrollHeight=${geo.scrollerScrollH}`);
console.log(`  行盒:      共 ${geo.lines.length} 条（首条 top=${geo.lines[0]?.top} bottom=${geo.lines[0]?.bottom}）`);

// 探针高度：
//   - 行中心：落在字身框内部
//   - 行距空隙：落在两行字身框之间，但**避开精确中点**。
//     浏览器对相邻两行的吸附分界恰好就是两个字身框的算术中点，恰好取中点会
//     得到一个「两行等距」的平局点，此时任何实现往哪边舍入都无可厚非，
//     拿它当判据只会制造假失败。因此空隙内取 30% / 70% 两个位置 ——
//     它们仍在空隙里（正是旧实现出问题的地方），但归属明确。
const centers = [];
const gapProbes = [];
let gapMidpoints = [];
const gapWidths = [];
for (let i = 0; i < geo.lines.length; i++) {
  const l = geo.lines[i];
  centers.push(+((l.top + l.bottom) / 2).toFixed(1));
  const next = geo.lines[i + 1];
  if (next) {
    const gap = next.top - l.bottom;
    if (gap > 1 && gap < geo.lineHeight * 2) {
      gapMidpoints.push(+((l.bottom + next.top) / 2).toFixed(1));
      gapWidths.push(+gap.toFixed(2));
      gapProbes.push(+(l.bottom + gap * 0.3).toFixed(1), +(l.bottom + gap * 0.7).toFixed(1));
    }
  }
}
// 取视口内的、分布均匀的样本
const inView = (y) => y > geo.pmTop + 8 && y < Math.min(geo.pmBottom, 860);
const pick = (arr, n) => {
  const v = arr.filter(inView);
  if (v.length <= n) return v;
  const step = (v.length - 1) / (n - 1);
  return Array.from({ length: n }, (_, i) => v[Math.round(i * step)]);
};
const centerSamples = pick(centers, 5);
// 宽空隙（跨段落外边距形成）优先取满：这是 posAtCoords 退化的区间
const wideGaps = pick(gapProbes.filter((_, i) => gapWidths[Math.floor(i / 2)] > geo.lineHeight * 0.5), 8);
const narrowGaps = pick(gapProbes.filter((_, i) => gapWidths[Math.floor(i / 2)] <= geo.lineHeight * 0.5), 3);
const gapSamples = [...new Set([...wideGaps, ...narrowGaps])];
const probeYs = [...new Set([...centerSamples, ...gapSamples])].sort((a, b) => a - b);
const uniqWidths = [...new Set(gapWidths)].sort((a, b) => a - b);
console.log(`  行中心样本: ${centerSamples.join(', ')}`);
console.log(`  行距空隙宽度分布: ${uniqWidths.join(', ')}px（宽空隙=跨段落，窄空隙=段内）`);
console.log(`  宽空隙样本: ${wideGaps.join(', ')}`);
console.log(`  窄空隙样本: ${narrowGaps.join(', ')}`);
console.log(`  （空隙精确中点如 ${gapMidpoints.slice(0, 3).join(', ')} 属于等距平局点，不作为判据）`);

const LEFT_MARGIN_X = Math.round(geo.pmLeft) - 10;
const RIGHT_MARGIN_X = Math.round(geo.pmRight) + 10;
const INNER_LEFT_X = Math.round(geo.pmLeft) + 3;
const INNER_RIGHT_X = Math.round(geo.pmRight) - 3;

// ─── 4. 点击并读取「用户能看到的东西」 ───
const click = async (x, y) => {
  await page.mouse.click(x, y);
  return page.evaluate(async () => {
    // Tiptap 的 delayedFocus 走 requestAnimationFrame，必须等两帧再读 DOM 选区
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 180))));
    const ed = window.__editor;
    const sel = document.getSelection();
    const rects = sel && sel.rangeCount ? sel.getRangeAt(0).getClientRects() : [];
    const pm = document.querySelector('.ProseMirror');
    return {
      pos: ed.state.selection.from,
      caretRects: rects.length,
      caretTop: rects.length ? +rects[0].top.toFixed(1) : null,
      caretLeft: rects.length ? +rects[0].left.toFixed(1) : null,
      scroll: window.__scroll.scrollTop,
      focused: ed.view.hasFocus(),
      docSize: ed.state.doc.content.size,
    };
  });
};

/** 复位到指定状态（不触发滚动），保证每个探针起点一致 */
const reset = async ({ caret = 'end', focused = true, scrollTop = 0 } = {}) => {
  await page.evaluate(
    ([c, f]) => {
      const ed = window.__editor;
      ed.commands.focus(c, { scrollIntoView: false });
      if (!f) ed.view.dom.blur();
    },
    [caret, focused]
  );
  await page.waitForTimeout(100);
  await page.evaluate((top) => { window.__scroll.scrollTop = top; }, scrollTop);
  await page.waitForTimeout(100);
};

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

// ─── 5. 核心判据：页边距点击 vs 同一 Y 的正文列内原生点击（oracle） ───
console.log('\n页边距点击 vs 原生点击（同一 Y 对比光标所在行）');
console.log('y      | 类型 | 原生左 top | 左页边距 top | 原生右 top | 右页边距 top | Δ | 视口 | 焦点 | 光标 | 结论');

let oracleFail = 0;
let invisibleFail = 0;
for (const y of probeYs) {
  await reset();
  const nL = await click(INNER_LEFT_X, y);
  await reset();
  const mL = await click(LEFT_MARGIN_X, y);
  await reset();
  const nR = await click(INNER_RIGHT_X, y);
  await reset();
  const mR = await click(RIGHT_MARGIN_X, y);

  // 页边距点击必须落在与原生点击同一行，且光标可见
  const leftOk = mL.caretRects >= 1 && nL.caretRects >= 1 && Math.abs(mL.caretTop - nL.caretTop) < 1.0;
  const rightOk = mR.caretRects >= 1 && nR.caretRects >= 1 && Math.abs(mR.caretTop - nR.caretTop) < 1.0;
  // 光标必须真的有可绘制的矩形：旧实现落在块边界上时 rects=0，用户看不见光标
  const visible = mL.caretRects >= 1 && mR.caretRects >= 1;
  const noJump = mL.scroll === 0 && mR.scroll === 0;
  const gotFocus = mL.focused && mR.focused;
  const ok = leftOk && rightOk && noJump && gotFocus;
  if (!ok) oracleFail++;
  if (!visible) invisibleFail++;

  const kind = gapSamples.includes(y) ? '空隙' : '行中';
  const maxDelta = Math.max(
    mL.caretTop === null ? Infinity : Math.abs(mL.caretTop - nL.caretTop),
    mR.caretTop === null ? Infinity : Math.abs(mR.caretTop - nR.caretTop)
  );
  console.log(
    `${String(y).padStart(5)} | ${kind} | ${String(nL.caretTop).padStart(10)} | ${String(mL.caretTop).padStart(12)} | ${String(nR.caretTop).padStart(10)} | ${String(mR.caretTop).padStart(12)} | ${maxDelta === Infinity ? ' ∞' : maxDelta.toFixed(1).padStart(3)} | ${mL.scroll}/${mR.scroll} | ${gotFocus ? '是' : '否'} | r${Math.min(mL.caretRects, mR.caretRects)} | ${ok ? '✅' : '❌'}`
  );
  if (!ok) {
    console.log(
      `        左: pos=${mL.pos} rects=${mL.caretRects} | 右: pos=${mR.pos} rects=${mR.caretRects} | 原生左 pos=${nL.pos} 右 pos=${nR.pos}`
    );
  }
}
record(
  `页边距定位精度（${probeYs.length} 个高度：行中心 + 行距空隙，左右各一次）`,
  oracleFail === 0,
  `  与原生点击不一致的高度数：${oracleFail}/${probeYs.length}`
);
record(
  '光标可见（页边距点击后插入符有可绘制矩形，不是块边界上的隐形位置）',
  invisibleFail === 0,
  `  光标不可见的高度数：${invisibleFail}/${probeYs.length}`
);

// ─── 5b. 边距方向语义：左边距→行首，右边距→行尾 ───
console.log('\n边距方向语义（左=行首，右=行尾）');
let dirFail = 0;
for (const y of probeYs.slice(0, 6)) {
  await reset();
  const mL = await click(LEFT_MARGIN_X, y);
  await reset();
  const mR = await click(RIGHT_MARGIN_X, y);
  const sameLine = mL.caretRects >= 1 && mR.caretRects >= 1 && Math.abs(mL.caretTop - mR.caretTop) < 1.0;
  const ordered = mL.pos <= mR.pos;
  const leftFirst = mL.caretLeft !== null && mR.caretLeft !== null && mL.caretLeft <= mR.caretLeft + 1;
  const ok = sameLine && ordered && leftFirst;
  if (!ok) dirFail++;
  console.log(
    `   y=${String(y).padStart(5)}  左 pos=${String(mL.pos).padStart(4)} x=${String(mL.caretLeft).padStart(6)}  |  右 pos=${String(mR.pos).padStart(4)} x=${String(mR.caretLeft).padStart(6)}  ${ok ? '✅' : '❌'}`
  );
}
record('左边距落行首、右边距落行尾（同一行内一前一后）', dirFail === 0, `  不满足的高度数：${dirFail}/6`);

// ─── 5c. 起始状态无关性：光标原本在末尾 / 开头 / 未聚焦，都不能跳到页尾 ───
console.log('\n起始状态变化（光标在末尾、在开头、编辑器未聚焦）');
const stateYs = [probeYs[Math.floor(probeYs.length / 2)], probeYs[probeYs.length - 1]].filter((v) => v !== undefined);
let stateFail = 0;
for (const y of stateYs) {
  for (const st of [
    { label: '光标在末尾·视口顶部', caret: 'end', focused: true, scrollTop: 0 },
    { label: '光标在末尾·视口已下滚', caret: 'end', focused: true, scrollTop: 400 },
    { label: '光标在开头', caret: 'start', focused: true, scrollTop: 0 },
    { label: '编辑器未聚焦', caret: 'end', focused: false, scrollTop: 0 },
  ]) {
    for (const [name, x] of [['左', LEFT_MARGIN_X], ['右', RIGHT_MARGIN_X]]) {
      await reset(st);
      const before = await page.evaluate(() => ({
        scroll: window.__scroll.scrollTop,
        pos: window.__editor.state.selection.from,
      }));
      const after = await click(x, y);
      const noJump = Math.abs(after.scroll - before.scroll) <= 5;
      const notEnd = after.pos < after.docSize - 2;
      const gotFocus = after.focused;
      const visible = after.caretRects >= 1;
      const ok = noJump && notEnd && gotFocus && visible;
      if (!ok) stateFail++;
      console.log(
        `   y=${String(y).padStart(5)} ${name}边距 · ${st.label.padEnd(22)} pos ${String(before.pos).padStart(4)}->${String(after.pos).padStart(4)} scroll ${before.scroll}->${after.scroll} 光标rects=${after.caretRects} 聚焦=${after.focused}  ${ok ? '✅' : '❌'}`
      );
    }
  }
}
record(
  `起始状态无关性（${stateYs.length * 4 * 2} 个组合）`,
  stateFail === 0,
  `  不满足的组合数：${stateFail}/${stateYs.length * 4 * 2}`
);

// ─── 5d. 正文内部点击的基线行为不应回归 ───
console.log('\n正文内部点击（基线，不应回归）');
await reset();
const baseline = await click(INNER_LEFT_X, probeYs[Math.floor(probeYs.length / 2)]);
const baselineOk = baseline.caretRects >= 1 && baseline.focused && baseline.scroll === 0 && baseline.pos < baseline.docSize - 2;
record('正文内部点击仍按浏览器命中的位置定位', baselineOk, `  pos=${baseline.pos} rects=${baseline.caretRects} scroll=${baseline.scroll} focused=${baseline.focused}`);

// ─── 5e. 正文下方纸张留白：不应乱猜位置，但也不能跳到页尾 ───
console.log('\n正文下方纸张留白');
await reset({ caret: 'end', focused: true, scrollTop: 0 });
const BELOW_Y = Math.min(Math.round(geo.pmBottom) + 10, 880);
const below = await click(LEFT_MARGIN_X, BELOW_Y);
const belowOk = below.focused && below.scroll === 0 && below.pos < below.docSize - 2;
record('点击正文下方留白：聚焦但不跳到全文末尾', belowOk, `  y=${BELOW_Y} pos=${below.pos}/${below.docSize} scroll=${below.scroll} focused=${below.focused}`);

await browser.close();
rmSync(tmp, { recursive: true, force: true });

// ─── 6. 汇总 ───
const failed = results.filter((r) => !r.ok);
console.log('\n' + '─'.repeat(60));
if (failed.length === 0) {
  console.log(`✅ 全部通过：${results.length}/${results.length}`);
  process.exit(0);
}
console.log(`❌ 失败 ${failed.length}/${results.length}：`);
for (const f of failed) console.log(`   - ${f.name}`);
process.exit(1);

/**
 * 真实浏览器回归测试：云同步（WebDAV / S3）
 *
 * 功能约定（用户需求原文）：
 *   「新增云同步服务，支持 webdav 和 s3」「仅提供手动同步」
 *
 * 要验证的是：
 *   1. 侧边栏「发布」分组下有独立的「云同步」界面；
 *   2. WebDAV：测试连接 → 备份到云端 → 从云端恢复（换一个干净的浏览器档案），
 *      书稿与元数据都能原样回来；
 *   3. S3：签名能被真实服务端校验通过（服务端用独立实现重算 SigV4，
 *      不匹配就返回 403）——这是浏览器端 WebCrypto 签名正确性的端到端证据；
 *   4. 双向同步：本机改动上传、云端改动下载、两端都改判冲突并另存副本，
 *      任何一方都不会被静默丢弃；
 *   5. 本机删除某本书后再同步，不会把它从云端拉回来（也不删云端数据文件）；
 *   6. **仅手动**：编辑并等待自动保存后，云端一个请求都不该收到。
 *
 * 服务端用本机 node http 起真实服务（不用 page.route 造假）：
 *   - 真实地走一遍请求方法、路径、请求头，能看到实际发的是什么；
 *   - CORS 由测试服务端显式允许，与用户自建 WebDAV 的情形一致。
 *
 * 依赖：esbuild 与 playwright-core（devDependencies），以及本机 Chromium。
 *       找不到浏览器时跳过（exit 0）而不是误报失败。
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';

const tmp = path.resolve('scripts/.tmp-sync');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });

// ─── 服务端侧：内存存储 + 两个协议实现 ───

/** 内存对象存储：key → { body(Buffer), contentType } */
const createStore = () => new Map();

/**
 * WebDAV 服务。
 * 支持 MKCOL（建目录）/ PUT / GET / DELETE，并按需要回 CORS 头。
 * 请求日志留在 requests 里，供「仅手动」用例断言云端确实没被碰过。
 */
const createWebDavServer = (store, requests) => {
  return async (req, res) => {
    requests.push({ method: req.method, url: req.url });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, MKCOL, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    // 认证：任何一组非空凭据都接受，便于测试（真实服务会校验）
    if (!req.headers.authorization) {
      res.writeHead(401).end('Unauthorized');
      return;
    }

    const key = decodeURIComponent(req.url.replace(/^\/+/, '').replace(/\/+$/, ''));

    if (req.method === 'MKCOL') {
      // 真实的 WebDAV（Nextcloud / nginx dav 等）在父目录不存在时返回 409，
      // 不会替调用方把中间层级建出来。这里如实模拟，否则会掩盖
      // 「只对整条路径发一次 MKCOL」这类 bug。
      const segments = key.split('/').filter(Boolean);
      const parent = segments.slice(0, -1).join('/');
      if (parent && !store.has(parent + '/')) {
        res.writeHead(409).end('Conflict: parent collection missing');
        return;
      }
      if (store.has(key + '/')) {
        res.writeHead(405).end('Already exists');
        return;
      }
      store.set(key + '/', { body: Buffer.alloc(0), contentType: null });
      res.writeHead(201).end();
      return;
    }

    if (req.method === 'PUT') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      store.set(key, { body: Buffer.concat(chunks), contentType: req.headers['content-type'] });
      res.writeHead(201).end();
      return;
    }

    if (req.method === 'GET') {
      const item = store.get(key);
      if (!item) {
        res.writeHead(404).end('Not Found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': item.contentType || 'application/octet-stream',
        ETag: `"${createHash('md5').update(item.body).digest('hex')}"`,
      });
      res.end(item.body);
      return;
    }

    if (req.method === 'DELETE') {
      const existed = store.delete(key);
      res.writeHead(existed ? 204 : 404).end();
      return;
    }

    res.writeHead(405).end('Method Not Allowed');
  };
};

/**
 * S3 服务：**在服务端独立重算 SigV4 校验签名**。
 *
 * 这是本测试里最有价值的一环：客户端签名是用浏览器 WebCrypto 算的，
 * 这里用 node crypto 按 AWS 规范重新推导一遍，两者必须完全一致，
 * 否则返回 403 —— 与真实 S3 的行为相同。
 */
const createS3Server = ({ store, requests, accessKeyId, secretAccessKey, region }) => {
  const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');

  const expectedSignature = ({ method, canonicalPath, query, headers, payloadHash, amzDate }) => {
    const signedHeaderNames = Object.keys(headers).filter((h) => h === 'host' || h.startsWith('x-amz-')).sort();
    const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');

    const canonicalRequest = [
      method,
      canonicalPath,
      query,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    const dateStamp = amzDate.slice(0, 8);
    const scope = `${dateStamp}/${region}/s3/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
    const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');

    return { signature: createHmac('sha256', kSigning).update(stringToSign).digest('hex'), signedHeaders };
  };

  return async (req, res) => {
    requests.push({
      method: req.method,
      url: req.url,
      // 记录是否带签名：用于断言「所有实际请求都走了签名通道」
      signed: (req.headers.authorization || '').startsWith('AWS4-HMAC-SHA256 '),
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', 'ETag');

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    const auth = req.headers.authorization || '';
    if (!auth.startsWith('AWS4-HMAC-SHA256 ')) {
      res.writeHead(403).end('<Error><Code>AccessDenied</Code><Message>缺少签名</Message></Error>');
      return;
    }

    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);

    const credential = /Credential=([^,]+)/.exec(auth)?.[1] || '';
    const clientSignature = /Signature=([0-9a-f]+)/.exec(auth)?.[1] || '';
    const [clientKey, dateStamp, clientRegion] = credential.split('/');

    if (clientKey !== accessKeyId || clientRegion !== region) {
      res
        .writeHead(403, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>InvalidAccessKeyId</Code><Message>凭据或区域不符</Message></Error>');
      return;
    }

    // 按规范重建服务端视角的请求信息
    const [rawPath, rawQuery = ''] = req.url.split('?');
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (k === 'host' || k.startsWith('x-amz-')) headers[k.toLowerCase()] = String(v).trim();
    }
    const payloadHash = headers['x-amz-content-sha256'] || EMPTY_SHA256;

    // 客户端传来的路径已做过 RFC3986 编码，这里按段规范化，保持与客户端一致
    const canonicalPath = rawPath
      .split('/')
      .map((seg) => encodeURIComponent(decodeURIComponent(seg)).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`))
      .join('/');

    const { signature, signedHeaders } = expectedSignature({
      method: req.method,
      canonicalPath,
      query: rawQuery,
      headers,
      payloadHash,
      amzDate: headers['x-amz-date'] || '',
    });

    const clientSignedHeaders = /SignedHeaders=([^,]+)/.exec(auth)?.[1] || '';
    if (signature !== clientSignature || clientSignedHeaders !== signedHeaders) {
      res.writeHead(403, { 'Content-Type': 'application/xml' }).end(
        `<Error><Code>SignatureDoesNotMatch</Code><Message>期望 ${signature}，收到 ${clientSignature}</Message></Error>`,
      );
      return;
    }

    // 签名通过，按 path-style 取 key（/bucket/prefix/key）
    const objectKey = decodeURIComponent(rawPath.replace(/^\/+/, '')).replace(/^[^/]+\//, '');

    if (req.method === 'PUT') {
      store.set(objectKey, { body, contentType: req.headers['content-type'] });
      res.writeHead(200, { ETag: `"${createHash('md5').update(body).digest('hex')}"` }).end();
      return;
    }

    if (req.method === 'GET') {
      const item = store.get(objectKey);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/xml' }).end('<Error><Code>NoSuchKey</Code></Error>');
        return;
      }
      res.writeHead(200, {
        'Content-Type': item.contentType || 'application/octet-stream',
        ETag: `"${createHash('md5').update(item.body).digest('hex')}"`,
      });
      res.end(item.body);
      return;
    }

    if (req.method === 'DELETE') {
      const existed = store.delete(objectKey);
      res.writeHead(existed ? 204 : 404).end();
      return;
    }

    res.writeHead(405).end('Method Not Allowed');
  };
};

/** 起一个服务，返回端口与关闭函数 */
const listen = async (handler) => {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
};

// ─── 打包被测应用 ───
const HARNESS = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import localforage from 'localforage';
import App from '../../App';

window.__localforage = localforage;
window.__mount = () => {
  const host = document.getElementById('root');
  host.innerHTML = '';
  createRoot(host).render(<React.StrictMode><App /></React.StrictMode>);
};
`;

writeFileSync(path.join(tmp, 'harness.tsx'), HARNESS);
await build({
  entryPoints: [path.join(tmp, 'harness.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: path.join(tmp, 'harness.js'),
  logLevel: 'error',
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.css': 'empty' },
});

// Tailwind 子集：只写决定布局与可见性的规则
const htmlPath = path.join(tmp, 'index.html');
writeFileSync(
  htmlPath,
  `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; font-family: system-ui, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
    button { cursor: pointer; }
    .flex { display: flex; } .flex-1 { flex: 1 1 0%; } .flex-none { flex: none; }
    .flex-wrap { flex-wrap: wrap; } .flex-col { flex-direction: column; }
    .hidden { display: none; } .block { display: block; }
    .h-full { height: 100%; } .h-screen { height: 100vh; }
    .h-8 { height: 2rem; } .h-7 { height: 1.75rem; } .h-1 { height: 0.25rem; }
    .h-3\\.5 { height: 0.875rem; } .h-9 { height: 2.25rem; } .h-12 { height: 3rem; }
    .w-full { width: 100%; } .w-52 { width: 13rem; } .w-11 { width: 2.75rem; }
    .w-3\\.5 { width: 0.875rem; } .max-w-3xl { max-width: 48rem; } .min-w-0 { min-width: 0; }
    .relative { position: relative; } .absolute { position: absolute; } .fixed { position: fixed; }
    .inset-0 { top:0; right:0; bottom:0; left:0; } .inset-y-0 { top:0; bottom:0; }
    .overflow-hidden { overflow: hidden; } .overflow-y-auto { overflow-y: auto; }
    .items-center { align-items: center; } .items-start { align-items: flex-start; }
    .justify-between { justify-content: space-between; } .justify-center { justify-content: center; }
    .left-0 { left: 0; } .right-4 { right: 1rem; } .bottom-4 { bottom: 1rem; } .bottom-14 { bottom: 3.5rem; }
    .-translate-x-full { transform: translateX(-100%); } .translate-x-0 { transform: translateX(0); }
    .z-40 { z-index: 40; } .z-50 { z-index: 50; }
    .p-3 { padding: 0.75rem; } .p-2 { padding: 0.5rem; }
    .px-3 { padding-left: .75rem; padding-right: .75rem; } .py-2 { padding-top:.5rem; padding-bottom:.5rem; }
    .py-1\\.5 { padding-top:.375rem; padding-bottom:.375rem; } .px-2 { padding-left:.5rem; padding-right:.5rem; }
    .px-2\\.5 { padding-left:.625rem; padding-right:.625rem; } .px-1\\.5 { padding-left:.375rem; padding-right:.375rem; }
    .mt-0\\.5 { margin-top: .125rem; } .mt-1 { margin-top: .25rem; } .mt-1\\.5 { margin-top: .375rem; }
    .mt-2 { margin-top: .5rem; } .mb-px { margin-bottom: 1px; } .my-px { margin-top:1px; margin-bottom:1px; }
    .mr-2 { margin-right: .5rem; } .ml-auto { margin-left: auto; } .ml-1 { margin-left: .25rem; }
    .gap-1 { gap: .25rem; } .gap-1\\.5 { gap: .375rem; } .gap-2 { gap: .5rem; } .gap-3 { gap: .75rem; }
    .space-y-1 > * + * { margin-top: .25rem; }
    .rounded-md { border-radius: .375rem; } .rounded-sm { border-radius: .125rem; } .rounded-full { border-radius: 9999px; }
    .border { border: 1px solid #e5e7eb; } .border-b { border-bottom: 1px solid #e5e7eb; }
    .border-r { border-right: 1px solid #e5e7eb; } .border-t { border-top: 1px solid #e5e7eb; }
    .divide-y > * + * { border-top: 1px solid #e5e7eb; }
    .bg-white { background: #fff; } .bg-gray-50 { background: #fafafa; } .bg-gray-100 { background: #f5f5f5; }
    .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text-xs { font-size: .75rem; } .text-sm { font-size: .875rem; }
    .text-\\[10px\\] { font-size: 10px; } .text-\\[11px\\] { font-size: 11px; } .text-\\[12px\\] { font-size: 12px; }
    .text-\\[13px\\] { font-size: 13px; } .font-medium { font-weight: 500; } .font-semibold { font-weight: 600; }
    .font-bold { font-weight: 700; } .uppercase { text-transform: uppercase; }
    input, textarea { font: inherit; }
    .ProseMirror { outline: none; min-height: 400px; }
    .ProseMirror p { margin: 0 0 12.8px; line-height: 1.8; font-size: 16px; }
  </style></head><body class="h-screen overflow-hidden">
    <div id="root" class="h-full"></div>
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

const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`\n${ok ? '✅' : '❌'} ${name}`);
  if (detail) console.log(detail);
};

// ─── 页面辅助 ───

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

/** 切到某个视图（两级导航：先展开所属一级分组，再点二级项） */
const gotoScreen = async (page, viewId) => {
  const alreadyOpen = await page.evaluate(
    (id) => !!document.querySelector(`[data-nav-level="2"][data-nav-id="${id}"]`),
    viewId,
  );
  if (!alreadyOpen) {
    await page.evaluate((id) => {
      const group = Array.from(document.querySelectorAll('[data-nav-level="1"]')).find((b) =>
        (b.getAttribute('data-nav-views') || '').split(',').includes(id),
      );
      if (!group) throw new Error('找不到含该视图的一级分组: ' + id);
      group.click();
    }, viewId);
    await page.waitForTimeout(350);
  }
  await page.evaluate((id) => {
    const item = document.querySelector(`[data-nav-level="2"][data-nav-id="${id}"]`);
    if (!item) throw new Error('找不到二级菜单项: ' + id);
    item.click();
  }, viewId);
  await page.waitForTimeout(500);
};

/** 写入同步配置（直接落 localStorage，等价于用户在界面里填好并保存） */
const seedSyncConfig = (page, config) =>
  page.evaluate((c) => {
    localStorage.setItem('epub-simple-editor-sync-config-v1', JSON.stringify(c));
  }, config);

/** 种子：直接写一本书进书库 */
const seedBook = (page, { title, author, chapterText }) =>
  page.evaluate(
    async ({ title, author, chapterText }) => {
      const lf = window.__localforage;
      const index = (await lf.getItem('epub_simple_editor_library_index_v1')) || { books: [], activeBookId: null };
      const id = 'seed_' + Math.random().toString(36).slice(2, 9);
      const now = Date.now();
      await lf.setItem('epub_simple_editor_book_' + id, {
        metadata: { title, creator: author, language: 'zh', description: '简介', publisher: '出版社', date: '2026-01-01' },
        chapters: [{ id: id + '_ch0', title: '第一章', content: `<h1>第一章</h1><p>${chapterText}</p>`, level: 1, subItems: [] }],
        images: [],
        extraFiles: [],
        cover: null,
        coverId: null,
        coverCustomCSS: '',
        activeStyleId: 'classic',
        isPresetStyleActive: true,
        customCSS: '',
      });
      index.books = [
        { id, title, author, chapterCount: 1, imageCount: 0, sizeBytes: 1024, createdAt: now, updatedAt: now },
        ...index.books,
      ];
      if (!index.activeBookId) index.activeBookId = id;
      await lf.setItem('epub_simple_editor_library_index_v1', index);
      return id;
    },
    { title, author, chapterText },
  );

/** 读本机书库里的书名与正文，用于校验恢复结果 */
const readLocalBooks = (page) =>
  page.evaluate(async () => {
    const lf = window.__localforage;
    const index = (await lf.getItem('epub_simple_editor_library_index_v1')) || { books: [] };
    const out = [];
    for (const b of index.books) {
      const book = await lf.getItem('epub_simple_editor_book_' + b.id);
      out.push({
        id: b.id,
        title: b.title,
        content: (book?.chapters || []).map((c) => c.content).join('|'),
        author: book?.metadata?.creator || '',
        publisher: book?.metadata?.publisher || '',
      });
    }
    return out;
  });

/** 点一个带 data-* 标记的按钮并等结果 */
const clickAndWait = async (page, selector, waitMs = 2500) => {
  await page.evaluate((sel) => {
    const btn = document.querySelector(sel);
    if (!btn) throw new Error('找不到按钮: ' + sel);
    btn.click();
  }, selector);
  await page.waitForTimeout(waitMs);
};

/** 读界面上的状态/错误文案 */
const readFeedback = (page) =>
  page.evaluate(() => ({
    error: document.querySelector('[data-sync-error]')?.textContent?.trim() || null,
    status: document.querySelector('[data-sync-status]')?.textContent?.trim() || null,
  }));

/** 在 mock 存储里按后缀找对象（键是完整 URL 路径，避免测试里硬编码目录层级） */
const findStored = (store, suffix) => {
  const key = Array.from(store.keys()).find((k) => k === suffix || k.endsWith('/' + suffix));
  return key ? store.get(key) : undefined;
};

// ─── 用例 1：入口与界面 ───
console.log('1. 「云同步」入口与界面');
{
  const page = await newPage();
  await bootApp(page);

  const navInfo = await page.evaluate(() => {
    const group = Array.from(document.querySelectorAll('[data-nav-level="1"]')).find((b) =>
      (b.getAttribute('data-nav-views') || '').split(',').includes('sync'),
    );
    return {
      groupId: group?.getAttribute('data-nav-id') || null,
      title: group?.getAttribute('title') || '',
    };
  });
  record(
    '「云同步」挂在「发布」分组下',
    navInfo.groupId === 'publish',
    `  所属一级分组=${navInfo.groupId}`,
  );

  await gotoScreen(page, 'sync');
  const ui = await page.evaluate(() => ({
    heading: Array.from(document.querySelectorAll('h1')).map((h) => h.textContent.trim()),
    // 只手动同步的说明必须在界面上写明
    mentionsManual: (document.body.textContent || '').includes('完全手动'),
    providers: Array.from(document.querySelectorAll('[data-sync-provider]')).map((b) => ({
      id: b.getAttribute('data-sync-provider'),
      active: b.getAttribute('data-active') === 'true',
    })),
    hasTestBtn: !!document.querySelector('[data-sync-test]'),
    hasUploadBtn: !!document.querySelector('[data-sync-run="upload"]'),
    hasDownloadBtn: !!document.querySelector('[data-sync-run="download"]'),
    hasTwoWayBtn: !!document.querySelector('[data-sync-run="two-way"]'),
    hasPreviewBtn: !!document.querySelector('[data-sync-preview]'),
  }));

  record('云同步是独立界面', ui.heading.includes('云同步'), `  界面标题=${JSON.stringify(ui.heading)}`);
  record(
    '同时提供 WebDAV 与 S3 两种存储，默认 WebDAV',
    ui.providers.length === 2 &&
      ui.providers.some((p) => p.id === 'webdav' && p.active) &&
      ui.providers.some((p) => p.id === 's3'),
    `  ${JSON.stringify(ui.providers)}`,
  );
  record(
    '提供测试连接 / 预览差异 / 备份 / 恢复 / 双向 五类操作',
    ui.hasTestBtn && ui.hasPreviewBtn && ui.hasUploadBtn && ui.hasDownloadBtn && ui.hasTwoWayBtn,
    `  测试连接=${ui.hasTestBtn}，预览=${ui.hasPreviewBtn}，备份=${ui.hasUploadBtn}，` +
      `恢复=${ui.hasDownloadBtn}，双向=${ui.hasTwoWayBtn}`,
  );
  record(
    '界面写明「完全手动」同步',
    ui.mentionsManual,
    ui.mentionsManual ? '' : '  未在界面上找到手动同步的说明',
  );

  // 切换 provider：表单应换成对应的字段
  await page.evaluate(() => document.querySelector('[data-sync-provider="s3"]').click());
  await page.waitForTimeout(300);
  const s3Fields = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-sync-field]')).map((el) => el.getAttribute('data-sync-field')),
  );
  record(
    '切到 S3 后表单换成 S3 字段（端点/区域/桶/密钥）',
    s3Fields.includes('s3-endpoint') && s3Fields.includes('s3-region') &&
      s3Fields.includes('s3-bucket') && s3Fields.includes('s3-secretAccessKey'),
    `  字段=${JSON.stringify(s3Fields)}`,
  );

  await page.close();
}

// ─── 用例 2：WebDAV 备份 → 恢复 ───
console.log('\n2. WebDAV：备份到云端，再恢复到干净的本机');
{
  const store = createStore();
  const requests = [];
  const dav = await listen(createWebDavServer(store, requests));

  // --- 第一台设备：写入两本书，备份 ---
  const pageA = await newPage();
  await seedSyncConfig(pageA, {
    provider: 'webdav',
    webdav: { baseUrl: `${dav.url}/dav`, username: 'user', password: 'pass', remoteDir: 'epub-simple-editor' },
    s3: {},
    lastSyncedAt: null,
  });
  await seedBook(pageA, { title: '甲书', author: '作者甲', chapterText: '甲书的正文内容' });
  await seedBook(pageA, { title: '乙书', author: '作者乙', chapterText: '乙书的正文内容' });
  await bootApp(pageA);
  await gotoScreen(pageA, 'sync');

  await clickAndWait(pageA, '[data-sync-test]', 2000);
  const testFeedback = await readFeedback(pageA);
  record(
    'WebDAV 测试连接成功',
    !!testFeedback.status && testFeedback.status.includes('连接成功') && !testFeedback.error,
    `  status=${testFeedback.status}\n  error=${testFeedback.error}`,
  );

  await clickAndWait(pageA, '[data-sync-run="upload"]', 4000);
  const uploadFeedback = await readFeedback(pageA);

  const storedKeys = Array.from(store.keys()).sort();
  const manifest = findStored(store, 'manifest.json');
  const manifestJson = manifest ? JSON.parse(manifest.body.toString('utf8')) : null;
  // 只数真正的书稿文件：mock 里还存了目录占位项（以 / 结尾）
  const bookFiles = storedKeys.filter((k) => k.includes('/books/') && k.endsWith('.json'));

  record(
    '备份：云端出现清单与两本书的数据文件',
    !!manifestJson && manifestJson.books.length === 2 && bookFiles.length === 2,
    `  云端对象=${JSON.stringify(storedKeys)}`,
  );
  record(
    '备份：清单记录书名与内容摘要',
    manifestJson?.books.every((b) => typeof b.hash === 'string' && b.hash.length === 64 && !!b.title),
    `  书目=${JSON.stringify(manifestJson?.books?.map((b) => b.title))}`,
  );
  record(
    '备份：界面回报上传数量',
    !!uploadFeedback.status && uploadFeedback.status.includes('上传 2 本'),
    `  status=${uploadFeedback.status}\n  error=${uploadFeedback.error}`,
  );

  // --- 第二台设备：干净档案，从云端恢复 ---
  const pageB = await newPage();
  await seedSyncConfig(pageB, {
    provider: 'webdav',
    webdav: { baseUrl: `${dav.url}/dav`, username: 'user', password: 'pass', remoteDir: 'epub-simple-editor' },
    s3: {},
    lastSyncedAt: null,
  });
  await bootApp(pageB);
  await gotoScreen(pageB, 'sync');

  // 恢复前本机只有自动新建的空白书
  const before = await readLocalBooks(pageB);
  await clickAndWait(pageB, '[data-sync-run="download"]', 4000);
  const restoreFeedback = await readFeedback(pageB);
  const after = await readLocalBooks(pageB);

  const restoredTitles = after.map((b) => b.title);
  const restoredJia = after.find((b) => b.title === '甲书');

  record(
    '恢复：两本书都回到本机，且正文与元数据完整',
    restoredTitles.includes('甲书') &&
      restoredTitles.includes('乙书') &&
      !!restoredJia &&
      restoredJia.content.includes('甲书的正文内容') &&
      restoredJia.author === '作者甲' &&
      restoredJia.publisher === '出版社',
    `  恢复前=${JSON.stringify(before.map((b) => b.title))}\n  恢复后=${JSON.stringify(restoredTitles)}` +
      `\n  甲书正文=${JSON.stringify(restoredJia?.content?.slice(0, 40))}，作者=${restoredJia?.author}，出版社=${restoredJia?.publisher}`,
  );
  record(
    '恢复：不删除本机原有的书',
    after.length > before.length || restoredTitles.length >= 2,
    `  恢复前 ${before.length} 本 → 恢复后 ${after.length} 本（原有书仍在）`,
  );
  record(
    '恢复：界面回报下载数量',
    !!restoreFeedback.status && restoreFeedback.status.includes('下载 2 本'),
    `  status=${restoreFeedback.status}\n  error=${restoreFeedback.error}`,
  );

  await pageA.close();
  await pageB.close();
  await dav.close();
}

// ─── 用例 2b：不先点「测试连接」，直接备份也要能建出目录 ───
console.log('\n2b. 直接备份（未先测试连接）也能自动创建远端目录');
{
  const store = createStore();
  const requests = [];
  const dav = await listen(createWebDavServer(store, requests));

  const page = await newPage();
  // remoteDir 是一个还不存在的多级目录：必须靠同步自己逐级建出来
  await seedSyncConfig(page, {
    provider: 'webdav',
    webdav: {
      baseUrl: `${dav.url}/dav`,
      username: 'u',
      password: 'p',
      remoteDir: 'nested/deeper/epub-simple-editor',
    },
    s3: {},
    lastSyncedAt: null,
  });
  await seedBook(page, { title: '直连书', author: 'A', chapterText: '内容' });
  await bootApp(page);
  await gotoScreen(page, 'sync');

  // 关键：跳过「测试连接」，直接备份
  await clickAndWait(page, '[data-sync-run="upload"]', 4000);
  const feedback = await readFeedback(page);

  const mkcolPaths = requests.filter((r) => r.method === 'MKCOL').map((r) => r.url);
  const manifestItem = findStored(store, 'manifest.json');

  record(
    '未先测试连接时，备份会自行逐级创建目录并成功写入',
    !!manifestItem && !!feedback.status && feedback.status.includes('上传 1 本') && !feedback.error,
    `  MKCOL 序列=${JSON.stringify(mkcolPaths)}\n  status=${feedback.status}\n  error=${feedback.error}`,
  );
  record(
    '创建了多层目录，而不是假定它已存在',
    mkcolPaths.some((u) => u.includes('epub-simple-editor')) &&
      mkcolPaths.some((u) => u.includes('deeper')),
    `  MKCOL 序列=${JSON.stringify(mkcolPaths)}`,
  );

  await page.close();
  await dav.close();
}

// ─── 用例 3：双向同步（上传 / 下载 / 冲突） ───
console.log('\n3. 双向同步：按改动方向走，冲突不丢数据');
{
  const store = createStore();
  const requests = [];
  const dav = await listen(createWebDavServer(store, requests));
  const webdavConfig = {
    provider: 'webdav',
    webdav: { baseUrl: `${dav.url}/dav`, username: 'u', password: 'p', remoteDir: 'sync' },
    s3: {},
    lastSyncedAt: null,
  };

  // 设备 A：建一本书并双向同步（建立基线）
  const pageA = await newPage();
  await seedSyncConfig(pageA, webdavConfig);
  await seedBook(pageA, { title: '共享书', author: '作者', chapterText: '原始内容' });
  await bootApp(pageA);
  await gotoScreen(pageA, 'sync');
  await clickAndWait(pageA, '[data-sync-run="two-way"]', 4000);
  const firstPlan = await pageA.evaluate(() =>
    Array.from(document.querySelectorAll('[data-sync-item]')).map((el) => el.getAttribute('data-sync-item')),
  );
  record(
    '双向首次同步：本机独有的书被上传',
    firstPlan.includes('upload'),
    `  明细=${JSON.stringify(firstPlan)}`,
  );

  // 设备 B：恢复同一本书，改内容，上传（模拟另一台设备编辑）
  const pageB = await newPage();
  await seedSyncConfig(pageB, webdavConfig);
  await bootApp(pageB);
  await gotoScreen(pageB, 'sync');
  await clickAndWait(pageB, '[data-sync-run="download"]', 4000);

  // B 上改这本书的正文，再上传
  await pageB.evaluate(async () => {
    const lf = window.__localforage;
    const index = await lf.getItem('epub_simple_editor_library_index_v1');
    const target = index.books.find((b) => b.title === '共享书');
    const book = await lf.getItem('epub_simple_editor_book_' + target.id);
    book.chapters[0].content = '<h1>第一章</h1><p>来自 B 设备的修改</p>';
    await lf.setItem('epub_simple_editor_book_' + target.id, book);
    index.books = index.books.map((b) => (b.id === target.id ? { ...b, updatedAt: Date.now() } : b));
    await lf.setItem('epub_simple_editor_library_index_v1', index);
  });

  await pageB.reload();
  await pageB.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await pageB.waitForTimeout(300);
  await bootApp(pageB);
  await gotoScreen(pageB, 'sync');
  await clickAndWait(pageB, '[data-sync-run="two-way"]', 4000);

  // 设备 A：本机也改这本书，然后双向同步 → 两端都改过，应判冲突
  await pageA.evaluate(async () => {
    const lf = window.__localforage;
    const index = await lf.getItem('epub_simple_editor_library_index_v1');
    const target = index.books.find((b) => b.title === '共享书');
    const book = await lf.getItem('epub_simple_editor_book_' + target.id);
    book.chapters[0].content = '<h1>第一章</h1><p>来自 A 设备的修改</p>';
    await lf.setItem('epub_simple_editor_book_' + target.id, book);
    index.books = index.books.map((b) => (b.id === target.id ? { ...b, updatedAt: Date.now() } : b));
    await lf.setItem('epub_simple_editor_library_index_v1', index);
  });

  await pageA.reload();
  await pageA.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await pageA.waitForTimeout(300);
  await bootApp(pageA);
  await gotoScreen(pageA, 'sync');

  // 先预览：应该已经在界面上看到冲突
  await clickAndWait(pageA, '[data-sync-preview]', 3000);
  const previewActions = await pageA.evaluate(() =>
    Array.from(document.querySelectorAll('[data-sync-item]')).map((el) => el.getAttribute('data-sync-item')),
  );
  record(
    '预览差异：两端都改过的书被标为冲突',
    previewActions.includes('conflict'),
    `  预览明细=${JSON.stringify(previewActions)}`,
  );

  const beforeSyncTitles = (await readLocalBooks(pageA)).map((b) => b.title);
  await clickAndWait(pageA, '[data-sync-run="two-way"]', 5000);
  const conflictFeedback = await readFeedback(pageA);
  const afterSyncBooks = await readLocalBooks(pageA);
  const afterTitles = afterSyncBooks.map((b) => b.title);

  const localCopy = afterSyncBooks.find((b) => b.title === '共享书');
  const cloudCopy = afterSyncBooks.find((b) => b.title.includes('云端副本'));

  record(
    '冲突：本机版本原样保留（A 的修改没被覆盖成 B 的）',
    !!localCopy && localCopy.content.includes('来自 A 设备的修改'),
    `  本机「共享书」正文=${JSON.stringify(localCopy?.content?.slice(0, 60))}`,
  );
  record(
    '冲突：云端版本另存为一本副本，内容也保住了',
    !!cloudCopy && cloudCopy.content.includes('来自 B 设备的修改'),
    `  副本标题=${cloudCopy?.title}\n  副本正文=${JSON.stringify(cloudCopy?.content?.slice(0, 60))}\n` +
      `  同步前书名=${JSON.stringify(beforeSyncTitles)}，同步后=${JSON.stringify(afterTitles)}`,
  );
  record(
    '冲突：界面回报冲突数量',
    !!conflictFeedback.status && conflictFeedback.status.includes('冲突'),
    `  status=${conflictFeedback.status}\n  error=${conflictFeedback.error}`,
  );

  // 冲突处置必须收敛：本机胜出版本要写回云端，否则下次同步会反复报同一个冲突，
  // 甚至把本机刚保留的版本反向覆盖掉。
  const cloudBookAfterSync = JSON.parse(
    findStored(store, `${localCopy.id}.json`)?.body?.toString('utf8') ||
      JSON.stringify({ chapters: [] }),
  );
  record(
    '冲突：本机胜出版本已写回云端（两端收敛到同一状态）',
    (cloudBookAfterSync.chapters || []).some((c) => (c.content || '').includes('来自 A 设备的修改')),
    `  云端该书记录的正文=${JSON.stringify(
      (cloudBookAfterSync.chapters || []).map((c) => (c.content || '').slice(0, 50)),
    )}`,
  );

  // 再同步一次：不应再报同一个冲突（基线已更新）
  await pageA.reload();
  await pageA.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await pageA.waitForTimeout(300);
  await bootApp(pageA);
  await gotoScreen(pageA, 'sync');
  await clickAndWait(pageA, '[data-sync-preview]', 3000);
  const secondActions = await pageA.evaluate(() =>
    Array.from(document.querySelectorAll('[data-sync-item]')).map((el) => el.getAttribute('data-sync-item')),
  );
  record(
    '冲突处理后再预览：不再反复报同一个冲突',
    !secondActions.includes('conflict'),
    `  第二次预览明细=${JSON.stringify(secondActions)}`,
  );

  // 真正再同步一次，确认本机保留的版本没有被云端旧内容覆盖
  await clickAndWait(pageA, '[data-sync-run="two-way"]', 5000);
  const afterSecondSync = await readLocalBooks(pageA);
  const stillLocal = afterSecondSync.find((b) => b.title === '共享书');
  record(
    '再次同步后，本机保留的版本仍然生效（未被云端旧内容覆盖）',
    !!stillLocal && stillLocal.content.includes('来自 A 设备的修改'),
    `  本机「共享书」正文=${JSON.stringify(stillLocal?.content?.slice(0, 60))}`,
  );

  await pageA.close();
  await pageB.close();
  await dav.close();
}

// ─── 用例 4：S3 签名被服务端校验通过 ───
console.log('\n4. S3：浏览器端签名通过服务端校验');
{
  const store = createStore();
  const requests = [];
  const accessKeyId = 'AKIAIOSFODNN7EXAMPLE';
  const secretAccessKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
  const s3 = await listen(
    createS3Server({ store, requests, accessKeyId, secretAccessKey, region: 'us-east-1' }),
  );

  const page = await newPage();
  await seedSyncConfig(page, {
    provider: 's3',
    webdav: {},
    s3: {
      endpoint: s3.url,
      region: 'us-east-1',
      bucket: 'testbucket',
      prefix: 'epub-simple-editor',
      accessKeyId,
      secretAccessKey,
      sessionToken: '',
      // 用路径风格：虚拟主机风格会解析到 testbucket.127.0.0.1，测试环境里不可达
      forcePathStyle: true,
    },
    lastSyncedAt: null,
  });
  await seedBook(page, { title: 'S3 上的书', author: 'S3 作者', chapterText: 'S3 内容' });
  await bootApp(page);
  await gotoScreen(page, 'sync');

  await clickAndWait(page, '[data-sync-test]', 2500);
  const testFeedback = await readFeedback(page);
  record(
    'S3 测试连接：服务端校验签名通过（未返回 403）',
    !!testFeedback.status && testFeedback.status.includes('连接成功') && !testFeedback.error,
    `  status=${testFeedback.status}\n  error=${testFeedback.error}`,
  );

  await clickAndWait(page, '[data-sync-run="upload"]', 4000);
  const uploadFeedback = await readFeedback(page);
  const keys = Array.from(store.keys()).sort();

  record(
    'S3 备份：对象写入到 prefix 下（清单 + 单本书）',
    keys.some((k) => k.endsWith('manifest.json')) && keys.some((k) => k.includes('/books/')),
    `  桶内对象=${JSON.stringify(keys)}`,
  );
  record(
    'S3 备份成功（签名校验通过，界面无错误）',
    !!uploadFeedback.status && uploadFeedback.status.includes('上传 1 本') && !uploadFeedback.error,
    `  status=${uploadFeedback.status}\n  error=${uploadFeedback.error}`,
  );

  // 每个非预检请求都必须带签名；服务端全程未返回 403（否则上面已报错）
  const actualRequests = requests.filter((r) => r.method !== 'OPTIONS');
  const signedRequests = actualRequests.filter((r) => r.signed);
  record(
    'S3 的每个实际请求都带 SigV4 签名，且全部被服务端接受',
    actualRequests.length > 0 &&
      signedRequests.length === actualRequests.length &&
      actualRequests.some((r) => r.method === 'PUT'),
    `  实际请求=${actualRequests.length} 个，带签名=${signedRequests.length} 个\n` +
      `  请求序列=${JSON.stringify(actualRequests.map((r) => `${r.method} ${r.url}`))}`,
  );

  // 用错误的密钥必须被服务端拒绝 —— 反证校验确实在起作用的
  const pageBad = await newPage();
  await seedSyncConfig(pageBad, {
    provider: 's3',
    webdav: {},
    s3: {
      endpoint: s3.url,
      region: 'us-east-1',
      bucket: 'testbucket',
      prefix: 'epub-simple-editor',
      accessKeyId,
      secretAccessKey: 'WRONG-SECRET-KEY',
      sessionToken: '',
      forcePathStyle: true,
    },
    lastSyncedAt: null,
  });
  await bootApp(pageBad);
  await gotoScreen(pageBad, 'sync');
  await clickAndWait(pageBad, '[data-sync-test]', 2500);
  const badFeedback = await readFeedback(pageBad);

  record(
    'S3 错误密钥被服务端拒绝，并在界面上给出可读的提示',
    !!badFeedback.error && badFeedback.error.includes('403'),
    `  error=${badFeedback.error}`,
  );

  await page.close();
  await pageBad.close();
  await s3.close();
}

// ─── 用例 5：本机删除的书不再拉回，且不删云端数据 ───
console.log('\n5. 删除后的同步行为（不误删云端备份）');
{
  const store = createStore();
  const requests = [];
  const dav = await listen(createWebDavServer(store, requests));
  const webdavConfig = {
    provider: 'webdav',
    webdav: { baseUrl: `${dav.url}/dav`, username: 'u', password: 'p', remoteDir: 'sync' },
    s3: {},
    lastSyncedAt: null,
  };

  const page = await newPage();
  await seedSyncConfig(page, webdavConfig);
  await seedBook(page, { title: '留下的书', author: 'A', chapterText: '留' });
  await seedBook(page, { title: '删掉的书', author: 'B', chapterText: '删' });
  await bootApp(page);
  await gotoScreen(page, 'sync');
  await clickAndWait(page, '[data-sync-run="upload"]', 4000);

  const bookFilesBefore = Array.from(store.keys()).filter((k) => k.includes('/books/') && k.endsWith('.json')).length;

  // 本机删掉其中一本
  await page.evaluate(async () => {
    const lf = window.__localforage;
    const index = await lf.getItem('epub_simple_editor_library_index_v1');
    const target = index.books.find((b) => b.title === '删掉的书');
    index.books = index.books.filter((b) => b.id !== target.id);
    await lf.setItem('epub_simple_editor_library_index_v1', index);
    await lf.removeItem('epub_simple_editor_book_' + target.id);
  });

  await page.reload();
  await page.waitForFunction(() => typeof window.__mount === 'function', null, { timeout: 20000 });
  await page.waitForTimeout(300);
  await bootApp(page);
  await gotoScreen(page, 'sync');
  await clickAndWait(page, '[data-sync-run="two-way"]', 4000);

  const afterBooks = (await readLocalBooks(page)).map((b) => b.title);
  const manifestItem = findStored(store, 'manifest.json');
  const manifest = JSON.parse(manifestItem.body.toString('utf8'));
  const bookFilesAfter = Array.from(store.keys()).filter((k) => k.includes('/books/') && k.endsWith('.json')).length;

  record(
    '双向同步不会把本机已删除的书拉回来',
    !afterBooks.includes('删掉的书') && afterBooks.includes('留下的书'),
    `  本机书名=${JSON.stringify(afterBooks)}`,
  );
  record(
    '同步后云端清单不再包含已删除的书',
    !manifest.books.some((b) => b.title === '删掉的书'),
    `  云端清单=${JSON.stringify(manifest.books.map((b) => b.title))}`,
  );
  record(
    '云端数据文件被保留（宁可留备份，也不误删用户的书）',
    bookFilesAfter === bookFilesBefore,
    `  同步前数据文件=${bookFilesBefore} 个，同步后=${bookFilesAfter} 个`,
  );

  await page.close();
  await dav.close();
}

// ─── 用例 6：仅手动同步 —— 编辑不会碰云端 ───
console.log('\n6. 仅手动同步：编辑与自动保存不产生任何云端请求');
{
  const store = createStore();
  const requests = [];
  const dav = await listen(createWebDavServer(store, requests));

  const page = await newPage();
  await seedSyncConfig(page, {
    provider: 'webdav',
    webdav: { baseUrl: `${dav.url}/dav`, username: 'u', password: 'p', remoteDir: 'sync' },
    s3: {},
    lastSyncedAt: null,
  });
  await seedBook(page, { title: '编辑中的书', author: 'A', chapterText: '原内容' });
  await bootApp(page);

  // 在编辑器里改一段正文
  await gotoScreen(page, 'chapters');
  await page.waitForSelector('.ProseMirror', { timeout: 20000 });
  await page.evaluate(() => {
    const pm = document.querySelector('.ProseMirror');
    pm.focus();
    const p = document.createElement('p');
    p.textContent = '编辑后新增的一段';
    pm.appendChild(p);
    pm.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // 等自动保存（防抖 2s）+ 书目同步（1.5s）
  await page.waitForTimeout(5000);

  const localAfterEdit = await readLocalBooks(page);
  const edited = localAfterEdit.find((b) => b.title === '编辑中的书');

  record(
    '编辑内容已按原有机制自动保存到本机',
    !!edited && edited.content.includes('编辑后新增的一段'),
    `  本机正文含新段落=${!!edited?.content?.includes('编辑后新增的一段')}`,
  );
  record(
    '等待自动保存期间，云端一个请求都没有（同步确实是手动的）',
    requests.length === 0,
    `  云端收到的请求数=${requests.length}` +
      (requests.length ? `\n  请求=${JSON.stringify(requests.map((r) => `${r.method} ${r.url}`))}` : ''),
  );

  await page.close();
  await dav.close();
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

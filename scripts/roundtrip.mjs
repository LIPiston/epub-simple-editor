/**
 * Round-trip harness: generate an EPUB from a project that contains the
 * characters that used to break the OPF (`&` in titles/metadata), then feed
 * the produced file straight back into parseEpub.
 *
 * This is the regression guard for the "cannot import EPUB" bug: the exporter
 * used to interpolate raw `&`, producing XML that its own importer rejected.
 */
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import JSZip from 'jszip';

const dom = new JSDOM('', { url: 'http://localhost/' });
globalThis.DOMParser = dom.window.DOMParser;
globalThis.document = dom.window.document;
globalThis.window = dom.window;
globalThis.File = dom.window.File;
globalThis.Blob = globalThis.Blob || dom.window.Blob;
globalThis.btoa = globalThis.btoa || ((s) => Buffer.from(s, 'binary').toString('base64'));

// Capture whatever the exporter hands to file-saver instead of downloading it.
const stubDir = path.resolve('scripts/.tmp');
mkdirSync(stubDir, { recursive: true });
const stubPath = path.join(stubDir, 'file-saver-stub.mjs');
writeFileSync(stubPath, 'export default function saveAs(blob, name) { globalThis.__lastSaved = { blob, name }; }\n');

const bundle = async (entry, outfile) => {
  await build({
    entryPoints: [path.resolve(entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: path.resolve(outfile),
    logLevel: 'error',
    external: ['jszip'],
    alias: { 'file-saver': stubPath },
  });
  return import(pathToFileURL(path.resolve(outfile)).href + `?t=${Date.now()}`);
};

const { generateEpub } = await bundle('services/epub/generator.ts', 'scripts/.tmp-generator.mjs');
const { parseEpub } = await bundle('services/epub/importer.ts', 'scripts/.tmp-importer.mjs');

const chapter = (id, title, content, level = 1) => ({ id, title, content, level });

const project = {
  metadata: {
    title: '芊玖&芊玲 <测试>',
    creator: '草awa & 朋友',
    language: 'zh-CN',
    description: '描述里有 & 和 <尖括号>',
    publisher: 'P & J',
    date: '2024-01-01',
    subjects: ['轻小说', 'A & B'],
    series: '春の風 & 续',
  },
  chapters: [
    chapter('c1', '前言 & 序', '<h1 id="heading-1">前言 &amp; 序</h1><p>正文 &amp; 更多</p>'),
    chapter('c2', '第一章 <划开>', '<h1 id="heading-2">第一章</h1><p>内容</p>', 1),
    chapter('c3', '1.1 小节 & 注', '<h2>小节</h2><p>x</p>', 2),
  ],
  images: [],
  extraFiles: [],
  cover: null,
  activeStyleId: 'default',
  customCSS: '',
};

console.log('=== 1. 生成 EPUB（含 & 与 < >）===');
await generateEpub(project);
const saved = globalThis.__lastSaved;
if (!saved) throw new Error('生成失败：未捕获到导出文件');
console.log('文件名 :', saved.name);

const ab = await saved.blob.arrayBuffer();
console.log('大小   :', ab.byteLength, 'bytes');
writeFileSync(path.resolve('scripts/.tmp/roundtrip.epub'), Buffer.from(ab));

// ── 严格校验导出产物本身是不是合法 XML ──────────────────────────────
// 这一项不能省：宽容导入器会把坏 XML「修好」，从而掩盖导出端的缺陷。
// 必须用一个绝不宽容的解析器直接检查 OPF / NCX / 章节文件。
console.log('\n=== 1b. 严格校验导出包的 XML 合法性 ===');
const xmlProblems = [];
{
  const zip = await JSZip.loadAsync(ab);
  const targets = Object.keys(zip.files).filter(
    (n) => /\.(opf|ncx|xhtml|xml)$/i.test(n) && !zip.files[n].dir
  );
  const strictParser = new dom.window.DOMParser();
  for (const name of targets.sort()) {
    const text = await zip.file(name).async('text');
    const doc = strictParser.parseFromString(text, 'application/xml');
    const isErr =
      !doc.documentElement ||
      doc.documentElement.tagName === 'parsererror' ||
      doc.getElementsByTagName('parsererror').length > 0;
    if (isErr) {
      const detail = doc.getElementsByTagName('parsererror')[0]?.textContent?.trim().split('\n')[0] || '未知错误';
      xmlProblems.push(`${name}: ${detail}`);
      console.log('  ❌', name, '->', detail);
    } else {
      console.log('  ✅', name);
    }
  }
}

console.log('\n=== 2. 立刻用导入器读回这个文件 ===');
const file = Object.assign(ab, { name: saved.name });
const result = await parseEpub(file, { cleanHtml: true, removeImages: false });

console.log('title      :', JSON.stringify(result.metadata?.title));
console.log('creator    :', JSON.stringify(result.metadata?.creator));
console.log('series     :', JSON.stringify(result.metadata?.series));
console.log('subjects   :', JSON.stringify(result.metadata?.subjects));
console.log('date       :', JSON.stringify(result.metadata?.date));
console.log('chapters   :', result.chapters?.length);
console.log('titles     :', JSON.stringify(result.chapters?.map((c) => c.title)));

const problems = [...xmlProblems];
if (result.metadata?.title !== '芊玖&芊玲 <测试>') problems.push('title 未往返一致（& 或 <> 丢失）');
if (result.metadata?.series !== '春の風 & 续') problems.push('series 未往返一致');
if (result.metadata?.creator !== '草awa & 朋友') problems.push('creator 未往返一致');
if (!(result.metadata?.subjects || []).includes('A & B')) problems.push('subjects 未往返一致');
if ((result.chapters?.length || 0) !== 3) problems.push(`章节数应为 3，实际 ${result.chapters?.length}`);
if (!result.chapters?.some((c) => c.title.includes('&'))) problems.push('章节标题中的 & 丢失');

console.log('\n=== 结果 ===');
if (problems.length) {
  problems.forEach((p) => console.log('❌', p));
  process.exit(1);
}
console.log('✅ 往返一致：导出产物可被本应用重新导入，& 与 <> 均正确保留');
